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
    isVerificationOverridden: v.optional(v.boolean()),
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
      v.literal("purchasing"),
      v.literal("purchased"),
      v.literal("in_transit"),
      v.literal("delivered"),
      v.literal("void_pending"),
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
    // TODO(schema-hardening): Make required after legacy shipment rows are backfilled.
    purchaseAttemptKey: v.optional(v.string()),
    parcelLength: v.number(),
    parcelWidth: v.number(),
    parcelHeight: v.number(),
    parcelWeight: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_purchaseAttemptKey", ["purchaseAttemptKey"])
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
      v.literal("not_applicable"),
    ),
    rejectionReason: v.optional(v.string()),
  }).index("by_shipmentId", ["shipmentId"]),

  orders: defineTable({
    ownerUserId: v.optional(v.string()),
    source: v.optional(v.union(v.literal("manapool"), v.literal("tcgplayer"))),
    manapoolOrderId: v.optional(v.string()),
    tcgplayerOrderNumber: v.optional(v.string()),
    tcgplayerSellerKey: v.optional(v.string()),
    tcgplayerSummaryHash: v.optional(v.string()),
    status: v.optional(v.string()),
    label: v.optional(v.string()),
    createdAt: v.optional(v.string()),
    buyerId: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    sellerName: v.optional(v.string()),
    orderChannel: v.optional(v.string()),
    orderFulfillment: v.optional(v.string()),
    buyerPaid: v.optional(v.boolean()),
    totalCents: v.optional(v.number()),
    shippingMethod: v.optional(v.string()),
    latestFulfillmentStatus: v.optional(v.string()),
    estimatedDeliveryAt: v.optional(v.string()),
    trackingNumbers: v.optional(v.array(v.string())),
    allowedActions: v.optional(v.array(v.string())),
    refundStatus: v.optional(v.string()),
    // TODO(schema-hardening): Replace v.any fields with explicit canonical sub-shapes.
    shippingAddress: v.optional(v.any()),
    // TODO(schema-hardening): Replace v.any fields with explicit canonical sub-shapes.
    payment: v.optional(v.any()),
    // TODO(schema-hardening): Replace v.any fields with explicit canonical sub-shapes.
    fulfillments: v.optional(v.array(v.any())),
    // TODO(schema-hardening): Replace v.any fields with explicit canonical sub-shapes.
    items: v.optional(v.array(v.any())),
    // TODO(schema-hardening): Replace v.any fields with explicit canonical sub-shapes.
    reports: v.optional(v.array(v.any())),
    syncUpdatedAt: v.optional(v.string()),
  })
    .index("by_manapoolOrderId", ["manapoolOrderId"])
    .index("by_tcgplayerOrderNumber", ["tcgplayerOrderNumber"])
    .index("by_source_syncUpdatedAt", ["source", "syncUpdatedAt"])
    .index("by_ownerUserId_source_syncUpdatedAt", [
      "ownerUserId",
      "source",
      "syncUpdatedAt",
    ])
    .index("by_tcgplayerSellerKey_syncUpdatedAt", [
      "tcgplayerSellerKey",
      "syncUpdatedAt",
    ])
    .index("by_tcgplayerSellerKey_ownerUserId_syncUpdatedAt", [
      "tcgplayerSellerKey",
      "ownerUserId",
      "syncUpdatedAt",
    ])
    .index("by_syncUpdatedAt", ["syncUpdatedAt"]),

  tcgplayerPendingPayments: defineTable({
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
  })
    .index("by_sellerKey", ["sellerKey"])
    .index("by_sellerKey_ownerUserId_syncedAt", [
      "sellerKey",
      "ownerUserId",
      "syncedAt",
    ])
    .index("by_sellerKey_syncedAt", ["sellerKey", "syncedAt"]),

  manapoolInventoryItems: defineTable({
    ownerUserId: v.optional(v.string()),
    manapoolInventoryId: v.string(),
    productId: v.optional(v.string()),
    productType: v.optional(v.string()),
    tcgplayerSku: v.optional(v.number()),
    quantity: v.optional(v.number()),
    priceCents: v.optional(v.number()),
    effectiveAsOf: v.optional(v.string()),
    pricingAnomaly: v.optional(v.boolean()),
    // TODO(schema-hardening): Replace payload with canonical item snapshot fields.
    payload: v.any(),
    syncedAt: v.string(),
  })
    .index("by_manapoolInventoryId", ["manapoolInventoryId"])
    .index("by_productId", ["productId"])
    .index("by_productType", ["productType"])
    .index("by_syncedAt", ["syncedAt"]),

  manapoolBulkPriceJobs: defineTable({
    ownerUserId: v.optional(v.string()),
    manapoolJobId: v.string(),
    status: v.string(),
    isPreview: v.optional(v.boolean()),
    downloadUrl: v.optional(v.string()),
    progressPercentage: v.optional(v.number()),
    // TODO(schema-hardening): Replace payload/progress with explicit job schemas.
    payload: v.any(),
    // TODO(schema-hardening): Replace payload/progress with explicit job schemas.
    progress: v.optional(v.array(v.any())),
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    syncedAt: v.string(),
  })
    .index("by_manapoolJobId", ["manapoolJobId"])
    .index("by_status", ["status"])
    .index("by_syncedAt", ["syncedAt"]),

  manapoolWebhooks: defineTable({
    ownerUserId: v.optional(v.string()),
    manapoolWebhookId: v.string(),
    topic: v.string(),
    callbackUrl: v.string(),
    secret: v.optional(v.string()),
    // TODO(schema-hardening): Replace payload with explicit webhook schema.
    payload: v.any(),
    syncedAt: v.string(),
  })
    .index("by_manapoolWebhookId", ["manapoolWebhookId"])
    .index("by_topic", ["topic"])
    .index("by_syncedAt", ["syncedAt"]),

  manapoolWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    event: v.string(),
    timestamp: v.number(),
    signature: v.string(),
    manapoolOrderId: v.optional(v.string()),
    // TODO(schema-hardening): Replace payload with explicit webhook delivery schema.
    payload: v.any(),
    processedAt: v.string(),
  })
    .index("by_deliveryId", ["deliveryId"])
    .index("by_orderId", ["manapoolOrderId"])
    .index("by_processedAt", ["processedAt"]),
});
