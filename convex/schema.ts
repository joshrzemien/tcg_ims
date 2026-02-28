import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  addresses: defineTable({
    ownerUserId: v.optional(v.string()),
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
  }).index("by_easypostAddressId", ["easypostAddressId"]),

  shipments: defineTable({
    ownerUserId: v.optional(v.string()),
    orderId: v.id("orders"),
    fromAddressId: v.id("addresses"),
    toAddressId: v.id("addresses"),
    status: v.union(
      v.literal("draft"),
      v.literal("purchased"),
      v.literal("in_transit"),
      v.literal("delivered"),
      v.literal("voided"),
      v.literal("error"),
      v.literal("returned"),
    ),
    easypostShipmentId: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    rateCents: v.optional(v.number()),
    carrier: v.optional(v.string()),
    service: v.optional(v.string()),
    easypostTrackerId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    parcelLength: v.number(),
    parcelWidth: v.number(),
    parcelHeight: v.number(),
    parcelWeight: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_easypostShipmentId", ["easypostShipmentId"])
    .index("by_trackingNumber", ["trackingNumber"]),

  trackingEvents: defineTable({
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
  })
    .index("by_shipmentId", ["shipmentId"])
    .index("by_trackingNumber", ["trackingNumber"])
    .index("by_easypostEventId", ["easypostEventId"]),

  refunds: defineTable({
    ownerUserId: v.optional(v.string()),
    shipmentId: v.id("shipments"),
    easypostRefundId: v.optional(v.string()),
    status: v.union(
      v.literal("submitted"),
      v.literal("refunded"),
      v.literal("rejected"),
    ),
    rejectionReason: v.optional(v.string()),
  }).index("by_shipmentId", ["shipmentId"]),

  // Stub so v.id("orders") compiles. Replaced when orders domain is built.
  orders: defineTable({
    status: v.optional(v.string()),
  }),
});
