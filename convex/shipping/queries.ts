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
    return await ctx.db.get(args.shipmentId);
  },
});

export const getAddress = query({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db.get(args.addressId);
  },
});

export const listShipmentsByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});

export const listTrackingEvents = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
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

export const trackingEventExists = internalQuery({
  args: { easypostEventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("trackingEvents")
      .withIndex("by_easypostEventId", (q) =>
        q.eq("easypostEventId", args.easypostEventId),
      )
      .first();
    return existing !== null;
  },
});
