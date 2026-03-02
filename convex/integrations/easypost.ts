// Pure TypeScript — zero Convex imports.
// API key is always passed as a parameter; this module never reads process.env.

import type {
  AddressInput,
  CreatedShipment,
  ParcelInput,
  PurchasedShipment,
  RefundResult,
  RetrievedShipment,
  ShipmentRate,
  VerifiedAddress,
} from "../shipping/types";

const BASE_URL = "https://api.easypost.com/v2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EasyPostRateRaw {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  delivery_days?: number | null;
}

interface EasyPostAddressVerificationResponse {
  id: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  verifications?: {
    delivery?: {
      success?: boolean;
      errors?: Array<{ message?: string }>;
    };
  };
}

interface EasyPostShipmentResponse {
  id: string;
  rates?: EasyPostRateRaw[];
  tracking_code?: string;
  postage_label?: { label_url?: string };
  selected_rate?: { rate?: string; carrier?: string; service?: string };
  tracker?: { id?: string };
}

interface EasyPostRefundResponse {
  refund_status?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EasyPostError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "EasyPostError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ---------------------------------------------------------------------------
// Internal HTTP helper
// ---------------------------------------------------------------------------

async function easypostFetch(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  if (res.status !== 204) {
    data = await res.json();
  }

  if (!res.ok) {
    const err = (data as Record<string, unknown>)?.error as
      | Record<string, unknown>
      | undefined;
    throw new EasyPostError(
      (err?.code as string) ?? "UNKNOWN_ERROR",
      (err?.message as string) ?? "Unknown EasyPost error",
      res.status,
    );
  }

  return data;
}

/** Convert a dollar string like "7.58" to integer cents (758). */
function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}

function mapRates(data: { rates?: EasyPostRateRaw[] }): ShipmentRate[] {
  return (data.rates ?? []).map((r) => ({
    rateId: r.id,
    carrier: r.carrier,
    service: r.service,
    rateCents: dollarsToCents(r.rate),
    deliveryDays: r.delivery_days ?? null,
  }));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Verify an address via EasyPost. Returns isVerified: false with errors on
 * failure — never throws for verification problems.
 */
export async function verifyAddress(
  apiKey: string,
  address: AddressInput,
): Promise<VerifiedAddress> {
  const data = (await easypostFetch(apiKey, "POST", "/addresses", {
    address: { ...address, verify: ["delivery"] },
  })) as EasyPostAddressVerificationResponse;

  const delivery = data.verifications?.delivery;
  const isVerified: boolean = delivery?.success === true;
  const verificationErrors: string[] = (delivery?.errors ?? []).map((e) =>
    e.message ?? "Unknown verification error",
  );
  if (!isVerified && verificationErrors.length === 0) {
    verificationErrors.push(
      "EasyPost could not verify this address. Use override only if you have manually confirmed it.",
    );
  }

  return {
    easypostAddressId: data.id,
    isVerified,
    street1: data.street1,
    street2: data.street2 ?? undefined,
    city: data.city,
    state: data.state,
    zip: data.zip,
    country: data.country,
    verificationErrors,
  };
}

/**
 * Create a shipment (returns rates, does NOT buy yet).
 * Hardcodes label_format: PNG, label_size: 4x6.
 */
export async function createShipment(
  apiKey: string,
  opts: {
    fromAddressId: string;
    toAddressId: string;
    parcel: ParcelInput;
  },
): Promise<CreatedShipment> {
  const data = (await easypostFetch(apiKey, "POST", "/shipments", {
    shipment: {
      from_address: { id: opts.fromAddressId },
      to_address: { id: opts.toAddressId },
      parcel: {
        length: opts.parcel.length,
        width: opts.parcel.width,
        height: opts.parcel.height,
        weight: opts.parcel.weight,
      },
      options: { label_format: "PNG", label_size: "4x6" },
    },
  })) as EasyPostShipmentResponse;
  if (!data.id) throw new Error("EasyPost shipment missing ID");

  const rates = mapRates(data);

  return { easypostShipmentId: data.id, rates };
}

/**
 * Retrieve an existing shipment from EasyPost.
 */
export async function getShipment(
  apiKey: string,
  shipmentId: string,
): Promise<RetrievedShipment> {
  const data = (await easypostFetch(
    apiKey,
    "GET",
    `/shipments/${shipmentId}`,
  )) as EasyPostShipmentResponse;

  const trackingNumber = data.tracking_code;
  const labelUrl = data.postage_label?.label_url;
  const rate = data.selected_rate?.rate;
  const carrier = data.selected_rate?.carrier;
  const service = data.selected_rate?.service;
  const trackerId = data.tracker?.id;
  const hasPurchasedData =
    !!trackingNumber &&
    !!labelUrl &&
    !!rate &&
    !!carrier &&
    !!service &&
    !!trackerId;
  let purchasedData: PurchasedShipment | null = null;
  if (trackingNumber && labelUrl && rate && carrier && service && trackerId) {
    purchasedData = {
      trackingNumber,
      labelUrl,
      rateCents: dollarsToCents(rate),
      carrier,
      service,
      easypostTrackerId: trackerId,
    };
  }
  if (!data.id) throw new Error("EasyPost shipment missing ID");

  return {
    easypostShipmentId: data.id,
    rates: mapRates(data),
    purchased: hasPurchasedData,
    purchasedData,
  };
}

/**
 * Buy a shipment (purchase the label for a specific rate).
 */
export async function buyShipment(
  apiKey: string,
  shipmentId: string,
  rateId: string,
): Promise<PurchasedShipment> {
  const data = (await easypostFetch(
    apiKey,
    "POST",
    `/shipments/${shipmentId}/buy`,
    { rate: { id: rateId } },
  )) as EasyPostShipmentResponse;
  const trackingNumber = data.tracking_code;
  const labelUrl = data.postage_label?.label_url;
  const rate = data.selected_rate?.rate;
  const carrier = data.selected_rate?.carrier;
  const service = data.selected_rate?.service;
  const trackerId = data.tracker?.id;
  if (!trackingNumber || !labelUrl || !rate || !carrier || !service || !trackerId) {
    throw new Error("EasyPost buy response missing required purchased fields");
  }

  return {
    trackingNumber,
    labelUrl,
    rateCents: dollarsToCents(rate),
    carrier,
    service,
    easypostTrackerId: trackerId,
  };
}

/**
 * Void / refund a shipment label.
 */
export async function refundShipment(
  apiKey: string,
  shipmentId: string,
): Promise<RefundResult> {
  const data = (await easypostFetch(
    apiKey,
    "POST",
    `/shipments/${shipmentId}/refund`,
  )) as EasyPostRefundResponse;

  const rawStatus = typeof data.refund_status === "string" ? data.refund_status : "";
  switch (rawStatus) {
    case "submitted":
    case "refunded":
    case "rejected":
    case "not_applicable":
      return { easypostRefundStatus: rawStatus };
    default:
      return { easypostRefundStatus: "unknown" };
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA256 via crypto.subtle)
// ---------------------------------------------------------------------------

/**
 * Verify an EasyPost webhook HMAC-SHA256 signature.
 * Uses Web Crypto API (available in Convex default runtime).
 */
export async function verifyWebhookSignature(
  secret: string,
  signature: string,
  rawBody: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  // Strip optional prefix (e.g. "hmac-sha256-hex=")
  const sig = signature.includes("=")
    ? signature.slice(signature.indexOf("=") + 1)
    : signature;
  const normalizedSig = sig.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalizedSig)) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqualHex(expected, normalizedSig);
}
