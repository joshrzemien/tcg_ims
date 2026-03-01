import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAdminUserId } from "../manapool/auth";
import type { Doc } from "../_generated/dataModel";

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

function applyOrderSnapshotFilters(args: {
  orders: Doc<"orders">[];
  ownerUserId?: string;
  orderStatuses?: string[];
  fulfillmentTypes?: string[];
  from?: number;
  size?: number;
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

  const from = Math.max(0, args.from ?? 0);
  const size = Math.max(1, args.size ?? 25);

  return {
    orders: filtered.slice(from, from + size),
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

    const orders = normalizedSellerKey
      ? await ctx.db
          .query("orders")
          .withIndex("by_tcgplayerSellerKey_syncUpdatedAt", (q) =>
            q.eq("tcgplayerSellerKey", normalizedSellerKey),
          )
          .order("desc")
          .collect()
      : await ctx.db.query("orders").withIndex("by_syncUpdatedAt").order("desc").collect();

    return applyOrderSnapshotFilters({
      orders,
      ownerUserId: args.ownerUserId,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      from: args.from,
      size: args.size,
    });
  },
});

export const getLatestPendingPaymentsSnapshot = internalQuery({
  args: {
    sellerKey: v.string(),
    ownerUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("tcgplayerPendingPayments")
      .withIndex("by_sellerKey", (q) => q.eq("sellerKey", args.sellerKey.toLowerCase()))
      .order("desc")
      .collect();

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

    const orders = normalizedSellerKey
      ? await ctx.db
          .query("orders")
          .withIndex("by_tcgplayerSellerKey_syncUpdatedAt", (q) =>
            q.eq("tcgplayerSellerKey", normalizedSellerKey),
          )
          .order("desc")
          .collect()
      : await ctx.db.query("orders").withIndex("by_syncUpdatedAt").order("desc").collect();

    return applyOrderSnapshotFilters({
      orders,
      ownerUserId,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      from: args.from,
      size: args.size,
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

    const snapshots = await ctx.db
      .query("tcgplayerPendingPayments")
      .withIndex("by_sellerKey", (q) => q.eq("sellerKey", args.sellerKey.toLowerCase()))
      .order("desc")
      .collect();

    return (
      snapshots.find((snapshot) =>
        isVisibleToOwner(snapshot.ownerUserId, ownerUserId),
      ) ?? null
    );
  },
});
