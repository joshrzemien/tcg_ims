import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdminUserId } from "../manapool/auth";
import type { Doc } from "../_generated/dataModel";

const DEFAULT_PAGE_SIZE = 25;
const SCAN_BUFFER = 200;
const MAX_SCAN_LIMIT = 2000;
const PENDING_PAYMENT_SCAN_LIMIT = 100;

function normalizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

function isVisibleToOwner(
  docOwnerUserId: string | undefined,
  ownerUserId: string | undefined,
): boolean {
  if (!ownerUserId) return true;
  if (!docOwnerUserId) return true;
  return docOwnerUserId === ownerUserId;
}

function orderMatchesFilters(
  order: Doc<"orders">,
  args: {
    orderStatuses?: string[];
    fulfillmentTypes?: string[];
  },
): boolean {
  if (args.orderStatuses && args.orderStatuses.length > 0) {
    const statusFilters = new Set(args.orderStatuses.map((status) => normalizeToken(status)));
    const orderStatusCandidates = [
      typeof order.latestFulfillmentStatus === "string"
        ? normalizeToken(order.latestFulfillmentStatus)
        : "",
      typeof order.status === "string" ? normalizeToken(order.status) : "",
    ];

    const hasMatch = orderStatusCandidates.some(
      (candidate) => candidate.length > 0 && statusFilters.has(candidate),
    );

    if (!hasMatch) {
      return false;
    }
  }

  if (args.fulfillmentTypes && args.fulfillmentTypes.length > 0) {
    const fulfillmentFilters = new Set(
      args.fulfillmentTypes.map((value) => value.trim().toLowerCase()),
    );

    const fulfillment =
      typeof order.orderFulfillment === "string"
        ? order.orderFulfillment.trim().toLowerCase()
        : "";

    if (!fulfillment || !fulfillmentFilters.has(fulfillment)) {
      return false;
    }
  }

  return true;
}

function getPageWindow(args: { from?: number; size?: number }): {
  from: number;
  size: number;
} {
  return {
    from: Math.max(0, args.from ?? 0),
    size: Math.max(1, args.size ?? DEFAULT_PAGE_SIZE),
  };
}

function getOrderScanLimit(args: { from: number; size: number }): number {
  // TODO(test): Add regression coverage that stale filtering still returns expected windows.
  // TODO(schema-hardening): Move list/search endpoints to cursor pagination after vertical slices stabilize.
  return Math.min(MAX_SCAN_LIMIT, args.from + args.size + SCAN_BUFFER);
}

function applyOrderSnapshotFilters(args: {
  orders: Doc<"orders">[];
  ownerUserId?: string;
  orderStatuses?: string[];
  fulfillmentTypes?: string[];
  from: number;
  size: number;
}) {
  const filtered = args.orders
    .filter((doc) => doc.source === "tcgplayer")
    .filter((doc) => isVisibleToOwner(doc.ownerUserId, args.ownerUserId))
    .filter((doc) =>
      orderMatchesFilters(doc, {
        orderStatuses: args.orderStatuses,
        fulfillmentTypes: args.fulfillmentTypes,
      }),
    );

  return {
    orders: filtered.slice(args.from, args.from + args.size),
    totalOrders: filtered.length,
  };
}

export const getOrderByTcgplayerOrderNumber = internalQuery({
  args: {
    orderNumber: v.string(),
    ownerUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_tcgplayerOrderNumber", (q) =>
        q.eq("tcgplayerOrderNumber", args.orderNumber),
      )
      .first();

    if (!order || order.source !== "tcgplayer") return null;
    if (!isVisibleToOwner(order.ownerUserId, args.ownerUserId)) return null;

    return order;
  },
});

export const searchOrderSnapshots = internalQuery({
  args: {
    ownerUserId: v.optional(v.string()),
    sellerKey: v.optional(v.string()),
    from: v.optional(v.number()),
    size: v.optional(v.number()),
    orderStatuses: v.optional(v.array(v.string())),
    fulfillmentTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const normalizedSellerKey = args.sellerKey?.toLowerCase();
    const window = getPageWindow(args);
    const scanLimit = getOrderScanLimit(window);

    const orders =
      normalizedSellerKey && args.ownerUserId
        ? await ctx.db
            .query("orders")
            .withIndex("by_tcgplayerSellerKey_ownerUserId_syncUpdatedAt", (q) =>
              q
                .eq("tcgplayerSellerKey", normalizedSellerKey)
                .eq("ownerUserId", args.ownerUserId),
            )
            .order("desc")
            .take(scanLimit)
        : normalizedSellerKey
          ? await ctx.db
              .query("orders")
              .withIndex("by_tcgplayerSellerKey_syncUpdatedAt", (q) =>
                q.eq("tcgplayerSellerKey", normalizedSellerKey),
              )
              .order("desc")
              .take(scanLimit)
          : args.ownerUserId
            ? await ctx.db
                .query("orders")
                .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
                  q.eq("ownerUserId", args.ownerUserId).eq("source", "tcgplayer"),
                )
                .order("desc")
                .take(scanLimit)
            : await ctx.db
                .query("orders")
                .withIndex("by_source_syncUpdatedAt", (q) =>
                  q.eq("source", "tcgplayer"),
                )
                .order("desc")
                .take(scanLimit);

    return applyOrderSnapshotFilters({
      orders,
      ownerUserId: args.ownerUserId,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      from: window.from,
      size: window.size,
    });
  },
});

export const getLatestPendingPaymentsSnapshot = internalQuery({
  args: {
    sellerKey: v.string(),
    ownerUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedSellerKey = args.sellerKey.toLowerCase();
    if (args.ownerUserId) {
      const ownedSnapshot = await ctx.db
        .query("tcgplayerPendingPayments")
        .withIndex("by_sellerKey_ownerUserId_syncedAt", (q) =>
          q
            .eq("sellerKey", normalizedSellerKey)
            .eq("ownerUserId", args.ownerUserId),
        )
        .order("desc")
        .first();
      if (ownedSnapshot) return ownedSnapshot;
    }

    const snapshots = await ctx.db
      .query("tcgplayerPendingPayments")
      .withIndex("by_sellerKey_syncedAt", (q) =>
        q.eq("sellerKey", normalizedSellerKey),
      )
      .order("desc")
      .take(PENDING_PAYMENT_SCAN_LIMIT);

    return (
      snapshots.find((snapshot) =>
        isVisibleToOwner(snapshot.ownerUserId, args.ownerUserId),
      ) ?? null
    );
  },
});

export const listOrders = query({
  args: {
    sellerKey: v.optional(v.string()),
    from: v.optional(v.number()),
    size: v.optional(v.number()),
    orderStatuses: v.optional(v.array(v.string())),
    fulfillmentTypes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAdminUserId(ctx);
    const normalizedSellerKey = args.sellerKey?.toLowerCase();
    const window = getPageWindow(args);
    const scanLimit = getOrderScanLimit(window);

    const orders = normalizedSellerKey
      ? await ctx.db
          .query("orders")
          .withIndex("by_tcgplayerSellerKey_ownerUserId_syncUpdatedAt", (q) =>
            q
              .eq("tcgplayerSellerKey", normalizedSellerKey)
              .eq("ownerUserId", ownerUserId),
          )
          .order("desc")
          .take(scanLimit)
      : await ctx.db
          .query("orders")
          .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
            q.eq("ownerUserId", ownerUserId).eq("source", "tcgplayer"),
          )
          .order("desc")
          .take(scanLimit);

    return applyOrderSnapshotFilters({
      orders,
      ownerUserId,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      from: window.from,
      size: window.size,
    });
  },
});

export const getOrder = query({
  args: {
    orderNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAdminUserId(ctx);

    const order = await ctx.db
      .query("orders")
      .withIndex("by_tcgplayerOrderNumber", (q) =>
        q.eq("tcgplayerOrderNumber", args.orderNumber),
      )
      .first();

    if (!order || order.source !== "tcgplayer") return null;
    if (!isVisibleToOwner(order.ownerUserId, ownerUserId)) {
      throw new Error("Not authorized");
    }

    return order;
  },
});

export const getLatestPendingPayments = query({
  args: {
    sellerKey: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAdminUserId(ctx);
    const normalizedSellerKey = args.sellerKey.toLowerCase();

    const ownedSnapshot = await ctx.db
      .query("tcgplayerPendingPayments")
      .withIndex("by_sellerKey_ownerUserId_syncedAt", (q) =>
        q.eq("sellerKey", normalizedSellerKey).eq("ownerUserId", ownerUserId),
      )
      .order("desc")
      .first();
    if (ownedSnapshot) return ownedSnapshot;

    const snapshots = await ctx.db
      .query("tcgplayerPendingPayments")
      .withIndex("by_sellerKey_syncedAt", (q) => q.eq("sellerKey", normalizedSellerKey))
      .order("desc")
      .take(PENDING_PAYMENT_SCAN_LIMIT);

    return (
      snapshots.find((snapshot) =>
        isVisibleToOwner(snapshot.ownerUserId, ownerUserId),
      ) ?? null
    );
  },
});
