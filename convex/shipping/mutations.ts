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
    isVerificationOverridden: v.optional(v.boolean()),
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
    isVerificationOverridden: v.optional(v.boolean()),
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

export const setAddressVerificationOverride = internalMutation({
  args: {
    addressId: v.id("addresses"),
    isVerificationOverridden: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.addressId, {
      isVerificationOverridden: args.isVerificationOverridden,
    });
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

export const getOrCreateShipmentForPurchase = internalMutation({
  args: {
    ownerUserId: v.string(),
    orderId: v.id("orders"),
    fromAddressId: v.id("addresses"),
    toAddressId: v.id("addresses"),
    parcelLength: v.number(),
    parcelWidth: v.number(),
    parcelHeight: v.number(),
    parcelWeight: v.number(),
    serviceLevelNormalized: v.string(),
  },
  handler: async (ctx, args) => {
    const existingByOrder = await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
    const matchingShipments = existingByOrder.filter(
      (s) =>
        s.ownerUserId === args.ownerUserId &&
        s.fromAddressId === args.fromAddressId &&
        s.toAddressId === args.toAddressId &&
        s.parcelLength === args.parcelLength &&
        s.parcelWidth === args.parcelWidth &&
        s.parcelHeight === args.parcelHeight &&
        s.parcelWeight === args.parcelWeight,
    );

    const existingPurchased = [...matchingShipments]
      .reverse()
      .find(
        (s) =>
          (s.status === "purchased" ||
            s.status === "in_transit" ||
            s.status === "delivered") &&
          s.trackingNumber &&
          s.labelUrl &&
          typeof s.rateCents === "number" &&
          s.service?.trim().toLowerCase() === args.serviceLevelNormalized,
      );
    if (existingPurchased?.trackingNumber && existingPurchased.labelUrl) {
      return {
        kind: "already_purchased" as const,
        shipmentId: existingPurchased._id,
        trackingNumber: existingPurchased.trackingNumber,
        labelUrl: existingPurchased.labelUrl,
        rateCents: existingPurchased.rateCents!,
      };
    }

    const existingInProgress = [...matchingShipments]
      .reverse()
      .find(
        (s) =>
          s.status === "draft" ||
          s.status === "error" ||
          s.status === "purchasing",
      );
    if (existingInProgress) {
      return {
        kind: "use_existing" as const,
        shipmentId: existingInProgress._id,
      };
    }

    const shipmentId = await ctx.db.insert("shipments", {
      ownerUserId: args.ownerUserId,
      orderId: args.orderId,
      fromAddressId: args.fromAddressId,
      toAddressId: args.toAddressId,
      parcelLength: args.parcelLength,
      parcelWidth: args.parcelWidth,
      parcelHeight: args.parcelHeight,
      parcelWeight: args.parcelWeight,
      status: "draft",
    });
    return { kind: "created" as const, shipmentId };
  },
});

export const claimShipmentPurchase = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    ownerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    if (shipment.ownerUserId !== args.ownerUserId) {
      throw new Error("Not authorized");
    }

    if (
      (shipment.status === "purchased" ||
        shipment.status === "in_transit" ||
        shipment.status === "delivered") &&
      shipment.trackingNumber &&
      shipment.labelUrl &&
      typeof shipment.rateCents === "number"
    ) {
      return {
        claimed: false as const,
        reason: "already_purchased" as const,
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        labelUrl: shipment.labelUrl,
        rateCents: shipment.rateCents,
      };
    }

    if (shipment.status === "purchasing") {
      return {
        claimed: false as const,
        reason: "in_progress" as const,
        shipmentId: shipment._id,
      };
    }

    if (shipment.status === "void_pending" || shipment.status === "voided") {
      return {
        claimed: false as const,
        reason: "terminal_void" as const,
        shipmentId: shipment._id,
      };
    }

    if (shipment.status !== "draft" && shipment.status !== "error") {
      return {
        claimed: false as const,
        reason: "not_purchaseable" as const,
        shipmentId: shipment._id,
      };
    }

    await ctx.db.patch(args.shipmentId, {
      status: "purchasing",
      errorMessage: undefined,
    });
    return {
      claimed: true as const,
      shipmentId: shipment._id,
      easypostShipmentId: shipment.easypostShipmentId ?? null,
    };
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
      v.literal("purchasing"),
      v.literal("purchased"),
      v.literal("in_transit"),
      v.literal("delivered"),
      v.literal("void_pending"),
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
      v.literal("not_applicable"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("refunds", args);
  },
});

export const upsertRefundByShipment = internalMutation({
  args: {
    ownerUserId: v.string(),
    shipmentId: v.id("shipments"),
    easypostRefundId: v.optional(v.string()),
    status: v.union(
      v.literal("submitted"),
      v.literal("refunded"),
      v.literal("rejected"),
      v.literal("not_applicable"),
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("refunds")
      .withIndex("by_shipmentId", (q) => q.eq("shipmentId", args.shipmentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ownerUserId: args.ownerUserId,
        easypostRefundId: args.easypostRefundId,
        status: args.status,
        rejectionReason: args.rejectionReason,
      });
      return existing._id;
    }

    return await ctx.db.insert("refunds", {
      ownerUserId: args.ownerUserId,
      shipmentId: args.shipmentId,
      easypostRefundId: args.easypostRefundId,
      status: args.status,
      rejectionReason: args.rejectionReason,
    });
  },
});

export const updateRefundStatus = internalMutation({
  args: {
    refundId: v.id("refunds"),
    status: v.union(
      v.literal("submitted"),
      v.literal("refunded"),
      v.literal("rejected"),
      v.literal("not_applicable"),
    ),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { refundId, ...fields } = args;
    await ctx.db.patch(refundId, fields);
  },
});
