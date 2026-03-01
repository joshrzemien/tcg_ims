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
import { requireAdminUserId } from "../manapool/auth";

declare const process: { env: Record<string, string | undefined> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new Error("EASYPOST_API_KEY not set");
  return key;
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
  epStatus: unknown,
): "in_transit" | "delivered" | "returned" | "error" | null {
  if (typeof epStatus !== "string") return null;
  switch (epStatus.trim().toLowerCase()) {
    case "unknown":
    case "pre_transit":
      return null;
    case "in_transit":
    case "out_for_delivery":
    case "available_for_pickup":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "return_to_sender":
      return "returned";
    case "cancelled":
    case "error":
    case "failure":
      return "error";
    default:
      return null;
  }
}

function normalizeServiceLevel(serviceLevel: string): string {
  return serviceLevel.trim().toLowerCase();
}

const REFUND_STATUSES = new Set([
  "submitted",
  "refunded",
  "rejected",
  "not_applicable",
] as const);

type RefundStatus = "submitted" | "refunded" | "rejected" | "not_applicable";

function isRefundStatus(value: string): value is RefundStatus {
  return REFUND_STATUSES.has(value as RefundStatus);
}

function formatAddressValidationError(
  kind: "From" | "To",
  verificationErrors?: string[],
): string {
  const errors = (verificationErrors ?? []).filter((e) => e.trim().length > 0);
  if (errors.length === 0) {
    return `${kind} address is not verified by EasyPost. Correct the address or use override to continue.`;
  }
  return `${kind} address failed verification: ${errors.join("; ")}. Correct the address or use override to continue.`;
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
    const ownerUserId = await requireAdminUserId(ctx);

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
        isVerificationOverridden: false,
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

export const overrideAddressVerification = action({
  args: {
    addressId: v.id("addresses"),
  },
  handler: async (ctx, args): Promise<{
    addressId: Id<"addresses">;
    isVerified: boolean;
    isVerificationOverridden: boolean;
    verificationErrors: string[];
  }> => {
    const ownerUserId = await requireAdminUserId(ctx);
    const address = await ctx.runQuery(internal.shipping.queries.getAddressInternal, {
      addressId: args.addressId,
    });

    if (!address) throw new Error("Address not found");
    if (address.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized to override this address");
    }

    const isVerificationOverridden = address.isVerified ? false : true;
    if (isVerificationOverridden) {
      await ctx.runMutation(
        internal.shipping.mutations.setAddressVerificationOverride,
        {
          addressId: args.addressId,
          isVerificationOverridden,
        },
      );
    }

    return {
      addressId: args.addressId,
      isVerified: address.isVerified,
      isVerificationOverridden,
      verificationErrors: address.verificationErrors ?? [],
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
    const ownerUserId = await requireAdminUserId(ctx);

    // 1. Validate both addresses are verified
    const [fromAddress, toAddress] = await Promise.all([
      ctx.runQuery(internal.shipping.queries.getAddressInternal, {
        addressId: args.fromAddressId,
      }),
      ctx.runQuery(internal.shipping.queries.getAddressInternal, {
        addressId: args.toAddressId,
      }),
    ]);

    if (!fromAddress) {
      throw new Error("From address not found");
    }
    if (!toAddress) {
      throw new Error("To address not found");
    }
    if (fromAddress.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized to use from address");
    }
    if (toAddress.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized to use to address");
    }

    const fromAddressCanBeUsed =
      !!fromAddress.easypostAddressId &&
      (fromAddress.isVerified || fromAddress.isVerificationOverridden === true);
    const toAddressCanBeUsed =
      !!toAddress.easypostAddressId &&
      (toAddress.isVerified || toAddress.isVerificationOverridden === true);

    if (!fromAddressCanBeUsed) {
      throw new Error(
        formatAddressValidationError("From", fromAddress.verificationErrors),
      );
    }
    if (!toAddressCanBeUsed) {
      throw new Error(
        formatAddressValidationError("To", toAddress.verificationErrors),
      );
    }

    const serviceLevelNormalized = normalizeServiceLevel(args.serviceLevel);

    // TODO(test): Add concurrency tests for purchase attempt claim/create idempotency.
    // 2. Atomically select or create the shipment attempt for these exact inputs.
    const selected = await ctx.runMutation(
      internal.shipping.mutations.getOrCreateShipmentForPurchase,
      {
        ownerUserId,
        orderId: args.orderId,
        fromAddressId: args.fromAddressId,
        toAddressId: args.toAddressId,
        parcelLength: args.parcelLength,
        parcelWidth: args.parcelWidth,
        parcelHeight: args.parcelHeight,
        parcelWeight: args.parcelWeight,
        serviceLevelNormalized,
      },
    );

    if (selected.kind === "already_purchased") {
      return {
        shipmentId: selected.shipmentId,
        trackingNumber: selected.trackingNumber,
        labelUrl: selected.labelUrl,
        rateCents: selected.rateCents,
      };
    }

    const shipmentId = selected.shipmentId;

    // 3. Claim the shipment attempt before any external EasyPost writes.
    const claim = await ctx.runMutation(
      internal.shipping.mutations.claimShipmentPurchase,
      {
        shipmentId,
        ownerUserId,
      },
    );
    if (!claim.claimed) {
      if (claim.reason === "already_purchased") {
        return {
          shipmentId: claim.shipmentId,
          trackingNumber: claim.trackingNumber,
          labelUrl: claim.labelUrl,
          rateCents: claim.rateCents,
        };
      }
      if (claim.reason === "in_progress") {
        throw new Error(
          "A label purchase for this shipment is already in progress. Retry shortly.",
        );
      }
      if (claim.reason === "terminal_void") {
        throw new Error(
          "Cannot purchase on a voided shipment attempt. Create a new shipment attempt instead.",
        );
      }
      throw new Error("Shipment is not in a purchaseable state.");
    }

    let easypostShipmentId: string | null = claim.easypostShipmentId ?? null;
    try {
      let rates: ShipmentRate[] = [];
      if (!easypostShipmentId) {
        // 4. Create shipment in EasyPost and persist linkage before buy.
        const created = await createShipment(apiKey, {
          fromAddressId: fromAddress.easypostAddressId!,
          toAddressId: toAddress.easypostAddressId!,
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
  handler: async (ctx, args): Promise<{ refundStatus: RefundStatus }> => {
    const apiKey = getApiKey();
    const ownerUserId = await requireAdminUserId(ctx);

    // 1. Validate shipment ownership and fetch any existing refund record.
    const shipment = await ctx.runQuery(
      internal.shipping.queries.getShipmentInternal,
      { shipmentId: args.shipmentId },
    );
    if (!shipment) throw new Error("Shipment not found");
    if (!shipment.ownerUserId || shipment.ownerUserId !== ownerUserId) {
      throw new Error("Not authorized");
    }

    const existingRefund = await ctx.runQuery(
      internal.shipping.queries.getRefundByShipmentInternal,
      { shipmentId: args.shipmentId },
    );

    if (shipment.status === "voided") {
      return { refundStatus: existingRefund?.status ?? "refunded" };
    }
    if (shipment.status === "void_pending") {
      return { refundStatus: existingRefund?.status ?? "submitted" };
    }
    if (existingRefund) {
      return { refundStatus: existingRefund.status };
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
    if (!isRefundStatus(result.easypostRefundStatus)) {
      throw new Error(
        `Unexpected EasyPost refund status: ${result.easypostRefundStatus}`,
      );
    }

    // 3. Upsert refund record
    await ctx.runMutation(internal.shipping.mutations.upsertRefundByShipment, {
      ownerUserId,
      shipmentId: args.shipmentId,
      status: result.easypostRefundStatus,
      rejectionReason:
        result.easypostRefundStatus === "rejected"
          ? "Label refund rejected by EasyPost"
          : result.easypostRefundStatus === "not_applicable"
            ? "Label refund not applicable per EasyPost"
            : undefined,
    });

    // 4. Update shipment status based on EasyPost result.
    if (result.easypostRefundStatus === "submitted") {
      await ctx.runMutation(internal.shipping.mutations.updateShipmentStatus, {
        shipmentId: args.shipmentId,
        status: "void_pending",
      });
    } else if (result.easypostRefundStatus === "refunded") {
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
    } else if (result.easypostRefundStatus === "not_applicable") {
      await ctx.runMutation(internal.shipping.mutations.updateShipmentStatus, {
        shipmentId: args.shipmentId,
        status: "error",
        errorMessage: "Label refund not applicable per EasyPost",
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

    const eventId = typeof payload.id === "string" ? payload.id : null;
    const trackingNumber =
      typeof tracker.tracking_code === "string" ? tracker.tracking_code : null;
    if (!eventId || !trackingNumber) return;

    // 3. Look up shipment
    const shipment = await ctx.runQuery(
      internal.shipping.queries.getShipmentByTrackingNumber,
      { trackingNumber },
    );
    if (!shipment) {
      console.warn(`No shipment found for tracking number ${trackingNumber}`);
      return;
    }
    if (shipment.status === "void_pending" || shipment.status === "voided") {
      return;
    }

    // 4. Extract latest tracking detail
    const details = Array.isArray(tracker.tracking_details)
      ? tracker.tracking_details
      : [];
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
        status: typeof tracker.status === "string" ? tracker.status : "unknown",
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
