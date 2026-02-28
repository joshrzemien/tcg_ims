import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const createAddress = internalMutation({
  args: {
    ownerUserId: v.string(),
    street1: v.string(),
    street2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    country: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    isVerified: v.boolean(),
    easypostAddressId: v.optional(v.string()),
    verificationErrors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("addresses", args);
  },
});

export const updateAddressVerification = internalMutation({
  args: {
    addressId: v.id("addresses"),
    isVerified: v.boolean(),
    easypostAddressId: v.optional(v.string()),
    street1: v.optional(v.string()),
    street2: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    verificationErrors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { addressId, ...fields } = args;
    // Strip undefined values so we only patch what's provided
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(addressId, patch);
  },
});

export const createShipment = internalMutation({
  args: {
    ownerUserId: v.string(),
    orderId: v.id("orders"),
    fromAddressId: v.id("addresses"),
    toAddressId: v.id("addresses"),
    parcelLength: v.number(),
    parcelWidth: v.number(),
    parcelHeight: v.number(),
    parcelWeight: v.number(),
    easypostShipmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("shipments", {
      ...args,
      status: "draft",
    });
  },
});

export const updateShipmentPurchased = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    trackingNumber: v.string(),
    labelUrl: v.string(),
    rateCents: v.number(),
    carrier: v.string(),
    service: v.string(),
    easypostTrackerId: v.string(),
    easypostShipmentId: v.string(),
  },
  handler: async (ctx, args) => {
    const { shipmentId, ...fields } = args;
    await ctx.db.patch(shipmentId, {
      ...fields,
      status: "purchased",
      errorMessage: undefined,
    });
  },
});

export const setShipmentEasypostId = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    easypostShipmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.shipmentId, {
      easypostShipmentId: args.easypostShipmentId,
    });
  },
});

export const updateShipmentStatus = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    status: v.union(
      v.literal("draft"),
      v.literal("purchased"),
      v.literal("in_transit"),
      v.literal("delivered"),
      v.literal("voided"),
      v.literal("error"),
      v.literal("returned"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { shipmentId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(shipmentId, patch);
  },
});

export const insertTrackingEventIfNew = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    shipmentId: v.id("shipments"),
    trackingNumber: v.string(),
    easypostEventId: v.string(),
    status: v.string(),
    message: v.string(),
    datetime: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trackingEvents")
      .withIndex("by_easypostEventId", (q) =>
        q.eq("easypostEventId", args.easypostEventId),
      )
      .first();
    if (existing) {
      return { inserted: false as const };
    }

    await ctx.db.insert("trackingEvents", args);
    return { inserted: true as const };
  },
});

export const createRefund = internalMutation({
  args: {
    ownerUserId: v.string(),
    shipmentId: v.id("shipments"),
    easypostRefundId: v.optional(v.string()),
    status: v.union(
      v.literal("submitted"),
      v.literal("refunded"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("refunds", args);
  },
});

export const updateRefundStatus = internalMutation({
  args: {
    refundId: v.id("refunds"),
    status: v.union(
      v.literal("submitted"),
      v.literal("refunded"),
      v.literal("rejected"),
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { refundId, ...fields } = args;
    await ctx.db.patch(refundId, fields);
  },
});
