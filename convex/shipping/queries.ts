import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Public queries (auth-gated, for frontend)
// ---------------------------------------------------------------------------

export const getShipment = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;
    if (!shipment.ownerUserId || shipment.ownerUserId !== identity.subject) {
      throw new Error("Not authorized");
    }
    return shipment;
  },
});

export const getAddress = query({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const address = await ctx.db.get(args.addressId);
    if (!address) return null;
    if (!address.ownerUserId || address.ownerUserId !== identity.subject) {
      throw new Error("Not authorized");
    }
    return address;
  },
});

export const listShipmentsByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
    return shipments.filter((s) => s.ownerUserId === identity.subject);
  },
});

export const listTrackingEvents = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || !shipment.ownerUserId || shipment.ownerUserId !== identity.subject) {
      throw new Error("Not authorized");
    }
    return await ctx.db
      .query("trackingEvents")
      .withIndex("by_shipmentId", (q) =>
        q.eq("shipmentId", args.shipmentId),
      )
      .order("desc")
      .collect();
  },
});

export const getRefundByShipment = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || !shipment.ownerUserId || shipment.ownerUserId !== identity.subject) {
      throw new Error("Not authorized");
    }
    return await ctx.db
      .query("refunds")
      .withIndex("by_shipmentId", (q) =>
        q.eq("shipmentId", args.shipmentId),
      )
      .first();
  },
});

// ---------------------------------------------------------------------------
// Internal queries (for actions to read DB)
// ---------------------------------------------------------------------------

export const getAddressInternal = internalQuery({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.addressId);
  },
});

export const getShipmentInternal = internalQuery({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.shipmentId);
  },
});

export const getShipmentByTrackingNumber = internalQuery({
  args: { trackingNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shipments")
      .withIndex("by_trackingNumber", (q) =>
        q.eq("trackingNumber", args.trackingNumber),
      )
      .first();
  },
});

export const getShipmentByEasypostId = internalQuery({
  args: { easypostShipmentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shipments")
      .withIndex("by_easypostShipmentId", (q) =>
        q.eq("easypostShipmentId", args.easypostShipmentId),
      )
      .first();
  },
});

export const getRefundByShipmentInternal = internalQuery({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("refunds")
      .withIndex("by_shipmentId", (q) =>
        q.eq("shipmentId", args.shipmentId),
      )
      .first();
  },
});

export const listShipmentsByOrderInternal = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});
