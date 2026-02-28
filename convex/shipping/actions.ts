import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  verifyAddress,
  createShipment,
  getShipment,
  buyShipment,
  refundShipment,
  verifyWebhookSignature,
  EasyPostError,
  type ShipmentRate,
} from "../integrations/easypost";

declare const process: { env: Record<string, string | undefined> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error("EASYPOST_API_KEY not set");
  return key;
}

async function requireUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

function findUspsRate(
  rates: ShipmentRate[],
  serviceLevel: string,
): ShipmentRate | null {
  return (
    rates.find(
      (r) =>
        r.service.toLowerCase() === serviceLevel.toLowerCase() &&
        r.carrier === "USPS",
    ) ?? null
  );
}

/** Map EasyPost tracker status → our shipment status. Returns null if no change. */
function mapTrackerStatus(
  epStatus: string,
): "in_transit" | "delivered" | "returned" | "error" | null {
  switch (epStatus) {
    case "in_transit":
    case "out_for_delivery":
    case "available_for_pickup":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "return_to_sender":
      return "returned";
    case "failure":
      return "error";
    default:
      return null; // pre_transit, unknown — no status change
  }
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export const verifyAndSaveAddress = action({
  args: {
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
  },
  handler: async (ctx, args): Promise<{
    addressId: Id<"addresses">;
    isVerified: boolean;
    verificationErrors: string[];
  }> => {
    const apiKey = getApiKey();
    const ownerUserId = await requireUserId(ctx);

    const verified = await verifyAddress(apiKey, args);

    const addressId = await ctx.runMutation(
      internal.shipping.mutations.createAddress,
      {
        ownerUserId,
        street1: verified.street1,
        street2: verified.street2,
        city: verified.city,
        state: verified.state,
        zip: verified.zip,
        country: verified.country,
        name: args.name,
        company: args.company,
        phone: args.phone,
        email: args.email,
        isVerified: verified.isVerified,
        easypostAddressId: verified.easypostAddressId,
        verificationErrors: verified.verificationErrors,
      },
    );

    return {
      addressId,
      isVerified: verified.isVerified,
      verificationErrors: verified.verificationErrors,
    };
  },
});

export const purchaseLabel = action({
  args: {
    orderId: v.id("orders"),
    fromAddressId: v.id("addresses"),
    toAddressId: v.id("addresses"),
    parcelLength: v.number(),
    parcelWidth: v.number(),
    parcelHeight: v.number(),
    parcelWeight: v.number(),
    serviceLevel: v.string(), // e.g. "First", "Priority", "Express"
  },
  handler: async (ctx, args): Promise<{
    shipmentId: Id<"shipments">;
    trackingNumber: string;
    labelUrl: string;
    rateCents: number;
  }> => {
    const apiKey = getApiKey();
    const ownerUserId = await requireUserId(ctx);

    // 1. Validate both addresses are verified
    const [fromAddress, toAddress] = await Promise.all([
      ctx.runQuery(internal.shipping.queries.getAddressInternal, {
        addressId: args.fromAddressId,
      }),
      ctx.runQuery(internal.shipping.queries.getAddressInternal, {
        addressId: args.toAddressId,
      }),
    ]);

    if (fromAddress?.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized to use from address");
    }
    if (toAddress?.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized to use to address");
    }
    if (!fromAddress?.isVerified || !fromAddress.easypostAddressId) {
      throw new Error("From address is not verified");
    }
    if (!toAddress?.isVerified || !toAddress.easypostAddressId) {
      throw new Error("To address is not verified");
    }

    // 2. Reuse an existing purchased shipment for identical inputs (idempotency).
    const existingByOrder = await ctx.runQuery(
      internal.shipping.queries.listShipmentsByOrderInternal,
      { orderId: args.orderId },
    );
    const matchingShipments = existingByOrder.filter(
      (s) =>
        s.ownerUserId === ownerUserId &&
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
          s.service?.toLowerCase() === args.serviceLevel.toLowerCase(),
      );
    if (existingPurchased?.trackingNumber && existingPurchased.labelUrl) {
      return {
        shipmentId: existingPurchased._id,
        trackingNumber: existingPurchased.trackingNumber,
        labelUrl: existingPurchased.labelUrl,
        rateCents: existingPurchased.rateCents!,
      };
    }

    // 3. Reuse a matching in-progress shipment when possible.
    const existingInProgress = [...matchingShipments]
      .reverse()
      .find((s) => s.status === "draft" || s.status === "error");

    const shipmentId =
      existingInProgress?._id ??
      (await ctx.runMutation(internal.shipping.mutations.createShipment, {
        ownerUserId,
        orderId: args.orderId,
        fromAddressId: args.fromAddressId,
        toAddressId: args.toAddressId,
        parcelLength: args.parcelLength,
        parcelWidth: args.parcelWidth,
        parcelHeight: args.parcelHeight,
        parcelWeight: args.parcelWeight,
      }));

    let easypostShipmentId: string | null =
      existingInProgress?.easypostShipmentId ?? null;
    try {
      let rates: ShipmentRate[] = [];
      if (!easypostShipmentId) {
        // 4. Create shipment in EasyPost and persist linkage before buy.
        const created = await createShipment(apiKey, {
          fromAddressId: fromAddress.easypostAddressId,
          toAddressId: toAddress.easypostAddressId,
          parcel: {
            length: args.parcelLength,
            width: args.parcelWidth,
            height: args.parcelHeight,
            weight: args.parcelWeight,
          },
        });
        easypostShipmentId = created.easypostShipmentId;
        rates = created.rates;
        await ctx.runMutation(internal.shipping.mutations.setShipmentEasypostId, {
          shipmentId,
          easypostShipmentId,
        });
      } else {
        // 4b. Recover state from an already-created EasyPost shipment.
        const existing = await getShipment(apiKey, easypostShipmentId);
        if (existing.purchased && existing.purchasedData) {
          await ctx.runMutation(internal.shipping.mutations.updateShipmentPurchased, {
            shipmentId,
            trackingNumber: existing.purchasedData.trackingNumber,
            labelUrl: existing.purchasedData.labelUrl,
            rateCents: existing.purchasedData.rateCents,
            carrier: existing.purchasedData.carrier,
            service: existing.purchasedData.service,
            easypostTrackerId: existing.purchasedData.easypostTrackerId,
            easypostShipmentId,
          });
          return {
            shipmentId,
            trackingNumber: existing.purchasedData.trackingNumber,
            labelUrl: existing.purchasedData.labelUrl,
            rateCents: existing.purchasedData.rateCents,
          };
        }
        rates = existing.rates;
      }

      // 5. Find the rate matching the requested service level.
      const rate = findUspsRate(rates, args.serviceLevel);
      if (!rate) {
        const available = rates
          .filter((r) => r.carrier === "USPS")
          .map((r) => r.service)
          .join(", ");
        throw new Error(
          `No USPS rate found for service "${args.serviceLevel}". Available: ${available}`,
        );
      }
      if (!easypostShipmentId) {
        throw new Error("EasyPost shipment ID missing before purchase");
      }

      // 6. Buy the label.
      const purchased = await buyShipment(apiKey, easypostShipmentId, rate.rateId);

      // 7. Update shipment to purchased.
      await ctx.runMutation(
        internal.shipping.mutations.updateShipmentPurchased,
        {
          shipmentId,
          trackingNumber: purchased.trackingNumber,
          labelUrl: purchased.labelUrl,
          rateCents: purchased.rateCents,
          carrier: purchased.carrier,
          service: purchased.service,
          easypostTrackerId: purchased.easypostTrackerId,
          easypostShipmentId,
        },
      );

      return {
        shipmentId,
        trackingNumber: purchased.trackingNumber,
        labelUrl: purchased.labelUrl,
        rateCents: purchased.rateCents,
      };
    } catch (err) {
      // Recover if EasyPost already purchased but local update failed.
      if (easypostShipmentId) {
        try {
          const existing = await getShipment(apiKey, easypostShipmentId);
          if (existing.purchased && existing.purchasedData) {
            await ctx.runMutation(
              internal.shipping.mutations.updateShipmentPurchased,
              {
                shipmentId,
                trackingNumber: existing.purchasedData.trackingNumber,
                labelUrl: existing.purchasedData.labelUrl,
                rateCents: existing.purchasedData.rateCents,
                carrier: existing.purchasedData.carrier,
                service: existing.purchasedData.service,
                easypostTrackerId: existing.purchasedData.easypostTrackerId,
                easypostShipmentId,
              },
            );
            return {
              shipmentId,
              trackingNumber: existing.purchasedData.trackingNumber,
              labelUrl: existing.purchasedData.labelUrl,
              rateCents: existing.purchasedData.rateCents,
            };
          }
        } catch (recoveryErr) {
          console.error("Purchase recovery failed:", recoveryErr);
        }
      }

      // Mark shipment as errored.
      const message =
        err instanceof EasyPostError
          ? `[${err.code}] ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown error";
      await ctx.runMutation(
        internal.shipping.mutations.updateShipmentStatus,
        { shipmentId, status: "error", errorMessage: message },
      );
      throw err;
    }
  },
});

export const voidLabel = action({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const apiKey = getApiKey();
    const ownerUserId = await requireUserId(ctx);

    // 1. Validate shipment is purchased
    const shipment = await ctx.runQuery(
      internal.shipping.queries.getShipmentInternal,
      { shipmentId: args.shipmentId },
    );
    if (!shipment) throw new Error("Shipment not found");
    if (!shipment.ownerUserId || shipment.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized");
    }
    if (shipment.status !== "purchased") {
      throw new Error(
        `Cannot void shipment in "${shipment.status}" status — must be "purchased"`,
      );
    }
    if (!shipment.easypostShipmentId) {
      throw new Error("Shipment has no EasyPost ID");
    }

    // 2. Refund via EasyPost
    const result = await refundShipment(apiKey, shipment.easypostShipmentId);
    if (
      result.easypostRefundStatus !== "submitted" &&
      result.easypostRefundStatus !== "refunded" &&
      result.easypostRefundStatus !== "rejected"
    ) {
      throw new Error(
        `Unexpected EasyPost refund status: ${result.easypostRefundStatus}`,
      );
    }

    // 3. Create refund record
    await ctx.runMutation(internal.shipping.mutations.createRefund, {
      ownerUserId,
      shipmentId: args.shipmentId,
      status: result.easypostRefundStatus,
    });

    // 4. Update shipment status based on EasyPost result.
    if (result.easypostRefundStatus === "refunded") {
      await ctx.runMutation(internal.shipping.mutations.updateShipmentStatus, {
        shipmentId: args.shipmentId,
        status: "voided",
      });
    } else if (result.easypostRefundStatus === "rejected") {
      await ctx.runMutation(internal.shipping.mutations.updateShipmentStatus, {
        shipmentId: args.shipmentId,
        status: "error",
        errorMessage: "Label refund rejected by EasyPost",
      });
    }

    return { refundStatus: result.easypostRefundStatus };
  },
});

// ---------------------------------------------------------------------------
// Internal action (called by HTTP webhook handler)
// ---------------------------------------------------------------------------

export const processTrackingWebhook = internalAction({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Verify HMAC signature
    const secret = process.env.EASYPOST_WEBHOOK_SECRET;
    if (!secret) {
      console.error("EASYPOST_WEBHOOK_SECRET not set — dropping webhook");
      return;
    }

    const valid = await verifyWebhookSignature(
      secret,
      args.signature,
      args.rawBody,
    );
    if (!valid) {
      console.warn("Invalid webhook signature — dropping");
      return;
    }

    // 2. Parse payload
    const payload = JSON.parse(args.rawBody);
    if (payload.description !== "tracker.updated") return;

    const tracker = payload.result;
    if (!tracker) return;

    const eventId: string = payload.id;
    const trackingNumber: string = tracker.tracking_code;

    // 3. Look up shipment
    const shipment = await ctx.runQuery(
      internal.shipping.queries.getShipmentByTrackingNumber,
      { trackingNumber },
    );
    if (!shipment) {
      console.warn(`No shipment found for tracking number ${trackingNumber}`);
      return;
    }

    // 4. Extract latest tracking detail
    const details = tracker.tracking_details ?? [];
    const latest = details[details.length - 1];
    const location = latest?.tracking_location ?? {};

    // 5. Insert tracking event if this event has not been processed yet.
    const inserted = await ctx.runMutation(
      internal.shipping.mutations.insertTrackingEventIfNew,
      {
        ownerUserId: shipment.ownerUserId,
        shipmentId: shipment._id,
        trackingNumber,
        easypostEventId: eventId,
        status: tracker.status ?? "unknown",
        message: latest?.message ?? "",
        datetime: latest?.datetime ?? new Date().toISOString(),
        city: location.city ?? undefined,
        state: location.state ?? undefined,
        zip: location.zip ?? undefined,
        country: location.country ?? undefined,
      },
    );
    if (!inserted.inserted) return;

    // 6. Update shipment status if applicable.
    const newStatus = mapTrackerStatus(tracker.status);
    if (newStatus) {
      await ctx.runMutation(
        internal.shipping.mutations.updateShipmentStatus,
        { shipmentId: shipment._id, status: newStatus },
      );
    }
  },
});
