import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireAdminUserId } from "../manapool/auth";
import type { OrderListItem, SourceSyncStatus } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function toTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortOrdersDescending(a: Doc<"orders">, b: Doc<"orders">): number {
  const left = Math.max(toTimestamp(a.syncUpdatedAt), toTimestamp(a.createdAt));
  const right = Math.max(toTimestamp(b.syncUpdatedAt), toTimestamp(b.createdAt));
  return right - left;
}

function toOrderListItem(order: Doc<"orders">): OrderListItem {
  const source = order.source === "manapool" ? "manapool" : "tcgplayer";
  const sourceOrderId =
    source === "manapool"
      ? (order.manapoolOrderId ?? "")
      : (order.tcgplayerOrderNumber ?? "");

  return {
    id: order._id,
    source,
    sourceOrderId,
    createdAt: order.createdAt,
    status: order.status,
    latestFulfillmentStatus: order.latestFulfillmentStatus,
    buyerName: order.buyerName,
    totalCents: order.totalCents,
    shippingMethod: order.shippingMethod,
    syncUpdatedAt: order.syncUpdatedAt,
  };
}

function clampPageArgs(args: { from?: number; size?: number }) {
  const from = Math.max(0, args.from ?? 0);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, args.size ?? DEFAULT_PAGE_SIZE));
  return { from, size };
}

export const listMergedOrdersInternal = internalQuery({
  args: {
    ownerUserId: v.string(),
    from: v.optional(v.number()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { from, size } = clampPageArgs(args);
    const [manapoolOrders, tcgplayerOrders] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("source", "manapool"),
        )
        .collect(),
      ctx.db
        .query("orders")
        .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("source", "tcgplayer"),
        )
        .collect(),
    ]);

    const merged = [...manapoolOrders, ...tcgplayerOrders].sort(sortOrdersDescending);
    const window = merged.slice(from, from + size).map(toOrderListItem);

    return {
      orders: window,
      total: merged.length,
    };
  },
});

function toSourceStatus(doc: Doc<"orderSyncStatus"> | null): SourceSyncStatus {
  if (!doc) {
    return {
      status: "idle",
    };
  }

  return {
    status: doc.status,
    lastAttemptAt: doc.lastAttemptAt,
    lastSuccessAt: doc.lastSuccessAt,
    lastError: doc.lastError,
  };
}

export const getSyncStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [manapool, tcgplayer] = await Promise.all([
      ctx.db
        .query("orderSyncStatus")
        .withIndex("by_source", (q) => q.eq("source", "manapool"))
        .first(),
      ctx.db
        .query("orderSyncStatus")
        .withIndex("by_source", (q) => q.eq("source", "tcgplayer"))
        .first(),
    ]);

    return {
      manapool: toSourceStatus(manapool),
      tcgplayer: toSourceStatus(tcgplayer),
    };
  },
});

export const listMergedOrders = query({
  args: {
    from: v.optional(v.number()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAdminUserId(ctx);
    const { from, size } = clampPageArgs(args);
    const [manapoolOrders, tcgplayerOrders] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
          q.eq("ownerUserId", ownerUserId).eq("source", "manapool"),
        )
        .collect(),
      ctx.db
        .query("orders")
        .withIndex("by_ownerUserId_source_syncUpdatedAt", (q) =>
          q.eq("ownerUserId", ownerUserId).eq("source", "tcgplayer"),
        )
        .collect(),
    ]);

    const merged = [...manapoolOrders, ...tcgplayerOrders].sort(sortOrdersDescending);
    const window = merged.slice(from, from + size).map(toOrderListItem);

    return {
      orders: window,
      total: merged.length,
    };
  },
});

export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminUserId(ctx);
    const [manapool, tcgplayer] = await Promise.all([
      ctx.db
        .query("orderSyncStatus")
        .withIndex("by_source", (q) => q.eq("source", "manapool"))
        .first(),
      ctx.db
        .query("orderSyncStatus")
        .withIndex("by_source", (q) => q.eq("source", "tcgplayer"))
        .first(),
    ]);

    return {
      manapool: toSourceStatus(manapool),
      tcgplayer: toSourceStatus(tcgplayer),
    };
  },
});
