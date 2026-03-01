import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import {
  isRecord,
  stripUndefined,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalString,
  toOptionalStringArray,
} from "../lib/normalize";

function extractSummaryFields(
  summary: unknown,
  args: {
    ownerUserId?: string;
    sellerKey: string;
    syncedAt: string;
  },
) {
  const record = isRecord(summary) ? summary : {};
  const orderNumber = toOptionalString(record.orderNumber);
  if (!orderNumber) return null;

  const sellerKey =
    toOptionalString(record.sellerKey)?.toLowerCase() ?? args.sellerKey.toLowerCase();

  return {
    orderNumber,
    fields: stripUndefined({
      ownerUserId: args.ownerUserId,
      source: "tcgplayer",
      tcgplayerOrderNumber: orderNumber,
      tcgplayerSellerKey: sellerKey,
      tcgplayerSummaryHash: toOptionalString(record.summaryHash),
      status: toOptionalString(record.statusDisplay),
      latestFulfillmentStatus: toOptionalString(record.statusCode),
      createdAt: toOptionalString(record.createdAt),
      buyerName: toOptionalString(record.buyerName),
      orderChannel: toOptionalString(record.orderChannel),
      orderFulfillment: toOptionalString(record.orderFulfillment),
      buyerPaid: toOptionalBoolean(record.buyerPaid),
      shippingMethod: toOptionalString(record.shippingType),
      totalCents: toOptionalNumber(record.totalAmountCents),
      syncUpdatedAt: args.syncedAt,
    }),
  };
}

function extractDetailFields(
  detail: unknown,
  args: {
    ownerUserId?: string;
    syncedAt: string;
  },
) {
  const record = isRecord(detail) ? detail : {};
  const orderNumber = toOptionalString(record.orderNumber);
  if (!orderNumber) return null;

  const sellerKey = toOptionalString(record.sellerKey)?.toLowerCase();

  const shippingAddress = isRecord(record.shippingAddress)
    ? record.shippingAddress
    : undefined;

  const payment = isRecord(record.payment) ? record.payment : undefined;

  return {
    orderNumber,
    fields: stripUndefined({
      ownerUserId: args.ownerUserId,
      source: "tcgplayer",
      tcgplayerOrderNumber: orderNumber,
      tcgplayerSellerKey: sellerKey,
      status: toOptionalString(record.statusDisplay),
      latestFulfillmentStatus: toOptionalString(record.statusCode),
      createdAt: toOptionalString(record.createdAt),
      sellerName: toOptionalString(record.sellerName),
      buyerName: toOptionalString(record.buyerName),
      orderChannel: toOptionalString(record.orderChannel),
      orderFulfillment: toOptionalString(record.orderFulfillment),
      shippingMethod: toOptionalString(record.shippingType),
      estimatedDeliveryAt: toOptionalString(record.estimatedDeliveryAt),
      refundStatus: toOptionalString(record.refundStatus),
      trackingNumbers: toOptionalStringArray(record.trackingNumbers),
      allowedActions: toOptionalStringArray(record.allowedActions),
      shippingAddress,
      payment,
      items: Array.isArray(record.items) ? record.items : undefined,
      fulfillments: Array.isArray(record.fulfillments)
        ? record.fulfillments
        : undefined,
      totalCents: toOptionalNumber(record.totalCents),
      syncUpdatedAt: args.syncedAt,
    }),
  };
}

export const upsertOrderSummaries = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    sellerKey: v.string(),
    summaries: v.array(v.any()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const changedOrderNumbers: string[] = [];
    const newOrderNumbers: string[] = [];

    let upserted = 0;

    for (const summary of args.summaries) {
      const snapshot = extractSummaryFields(summary, args);
      if (!snapshot) continue;

      const existing = await ctx.db
        .query("orders")
        .withIndex("by_tcgplayerOrderNumber", (q) =>
          q.eq("tcgplayerOrderNumber", snapshot.orderNumber),
        )
        .first();

      const nextHash = toOptionalString(snapshot.fields.tcgplayerSummaryHash);
      const previousHash = toOptionalString(existing?.tcgplayerSummaryHash);
      const changed = !existing || nextHash !== previousHash;

      if (existing) {
        await ctx.db.patch(existing._id, snapshot.fields);
      } else {
        await ctx.db.insert("orders", {
          ...snapshot.fields,
          source: "tcgplayer",
          tcgplayerOrderNumber: snapshot.orderNumber,
          tcgplayerSellerKey: args.sellerKey.toLowerCase(),
        });
        newOrderNumbers.push(snapshot.orderNumber);
      }

      if (changed) {
        changedOrderNumbers.push(snapshot.orderNumber);
      }

      upserted += 1;
    }

    return {
      upserted,
      changedOrderNumbers,
      newOrderNumbers,
    };
  },
});

export const upsertOrderDetail = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    detail: v.any(),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = extractDetailFields(args.detail, args);
    if (!snapshot) {
      throw new Error("Order detail missing orderNumber");
    }

    const existing = await ctx.db
      .query("orders")
      .withIndex("by_tcgplayerOrderNumber", (q) =>
        q.eq("tcgplayerOrderNumber", snapshot.orderNumber),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, snapshot.fields);
      return {
        created: false as const,
        orderId: existing._id,
      };
    }

    const orderId = await ctx.db.insert("orders", {
      ...snapshot.fields,
      source: "tcgplayer",
      tcgplayerOrderNumber: snapshot.orderNumber,
    });

    return {
      created: true as const,
      orderId,
    };
  },
});

export const upsertPendingPaymentsSnapshot = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    sellerKey: v.string(),
    totalPendingAmountCents: v.number(),
    channels: v.array(
      v.object({
        channel: v.string(),
        amountCents: v.number(),
      }),
    ),
    rawHtml: v.string(),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tcgplayerPendingPayments", {
      ownerUserId: args.ownerUserId,
      sellerKey: args.sellerKey.toLowerCase(),
      totalPendingAmountCents: args.totalPendingAmountCents,
      channels: args.channels,
      rawHtml: args.rawHtml,
      syncedAt: args.syncedAt,
    });
  },
});
