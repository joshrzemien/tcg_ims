import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getOptionalRecord, stripUndefined, toOptionalNumber, toOptionalString } from "../lib/normalize";

export const upsertOrdersBatch = internalMutation({
  args: {
    source: v.union(v.literal("manapool"), v.literal("tcgplayer")),
    ownerUserId: v.optional(v.string()),
    syncedAt: v.string(),
    orders: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    let upserted = 0;

    for (const order of args.orders) {
      const record = getOptionalRecord(order);
      const sourceOrderId = toOptionalString(record?.sourceOrderId);
      if (!sourceOrderId) continue;

      const existing =
        args.source === "manapool"
          ? await ctx.db
              .query("orders")
              .withIndex("by_manapoolOrderId", (q) =>
                q.eq("manapoolOrderId", sourceOrderId),
              )
              .first()
          : await ctx.db
              .query("orders")
              .withIndex("by_tcgplayerOrderNumber", (q) =>
                q.eq("tcgplayerOrderNumber", sourceOrderId),
              )
              .first();

      const fields = stripUndefined({
        ownerUserId: args.ownerUserId,
        source: args.source,
        manapoolOrderId: args.source === "manapool" ? sourceOrderId : undefined,
        tcgplayerOrderNumber: args.source === "tcgplayer" ? sourceOrderId : undefined,
        tcgplayerSellerKey: toOptionalString(record?.tcgplayerSellerKey),
        tcgplayerSummaryHash: toOptionalString(record?.tcgplayerSummaryHash),
        status: toOptionalString(record?.status),
        label: toOptionalString(record?.label),
        createdAt: toOptionalString(record?.createdAt),
        buyerId: toOptionalString(record?.buyerId),
        buyerName: toOptionalString(record?.buyerName),
        sellerName: toOptionalString(record?.sellerName),
        orderChannel: toOptionalString(record?.orderChannel),
        orderFulfillment: toOptionalString(record?.orderFulfillment),
        buyerPaid: typeof record?.buyerPaid === "boolean" ? record.buyerPaid : undefined,
        totalCents: toOptionalNumber(record?.totalCents),
        shippingMethod: toOptionalString(record?.shippingMethod),
        latestFulfillmentStatus: toOptionalString(record?.latestFulfillmentStatus),
        estimatedDeliveryAt: toOptionalString(record?.estimatedDeliveryAt),
        trackingNumbers: Array.isArray(record?.trackingNumbers) ? record?.trackingNumbers : undefined,
        allowedActions: Array.isArray(record?.allowedActions) ? record?.allowedActions : undefined,
        refundStatus: toOptionalString(record?.refundStatus),
        shippingAddress: getOptionalRecord(record?.shippingAddress),
        payment: getOptionalRecord(record?.payment),
        fulfillments: Array.isArray(record?.fulfillments) ? record?.fulfillments : undefined,
        items: Array.isArray(record?.items) ? record?.items : undefined,
        reports: Array.isArray(record?.reports) ? record?.reports : undefined,
        syncUpdatedAt: args.syncedAt,
      });

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("orders", fields);
      }

      upserted += 1;
    }

    return { upserted };
  },
});

export const upsertSyncStatus = internalMutation({
  args: {
    source: v.union(v.literal("manapool"), v.literal("tcgplayer")),
    status: v.union(v.literal("ok"), v.literal("error")),
    lastAttemptAt: v.string(),
    lastSuccessAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orderSyncStatus")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .first();

    const fields = stripUndefined({
      status: args.status,
      lastAttemptAt: args.lastAttemptAt,
      lastSuccessAt: args.lastSuccessAt,
      lastError: args.lastError,
    });

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("orderSyncStatus", {
      source: args.source,
      status: args.status,
      lastAttemptAt: args.lastAttemptAt,
      ...(args.lastSuccessAt ? { lastSuccessAt: args.lastSuccessAt } : {}),
      ...(args.lastError ? { lastError: args.lastError } : {}),
    });
  },
});
