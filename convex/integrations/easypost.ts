// Pure TypeScript — zero Convex imports.
// API key is always passed as a parameter; this module never reads process.env.

const BASE_URL = "https://api.easypost.com/v2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddressInput {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
}

export interface VerifiedAddress {
  easypostAddressId: string;
  isVerified: boolean;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  verificationErrors: string[];
}

export interface ParcelInput {
  length: number;
  width: number;
  height: number;
  weight: number; // ounces
}

export interface ShipmentRate {
  rateId: string;
  carrier: string;
  service: string;
  rateCents: number;
  deliveryDays: number | null;
}

export interface CreatedShipment {
  easypostShipmentId: string;
  rates: ShipmentRate[];
}

export interface PurchasedShipment {
  trackingNumber: string;
  labelUrl: string;
  rateCents: number;
  carrier: string;
  service: string;
  easypostTrackerId: string;
}

export interface RefundResult {
  easypostRefundStatus: string;
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

  const data = await res.json();

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await easypostFetch(apiKey, "POST", "/addresses", {
    address: { ...address, verify: ["delivery"] },
  })) as any;

  const delivery = data.verifications?.delivery;
  const isVerified: boolean = delivery?.success === true;
  const verificationErrors: string[] = (delivery?.errors ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => e.message ?? "Unknown verification error",
  );

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  })) as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rates: ShipmentRate[] = (data.rates ?? []).map((r: any) => ({
    rateId: r.id,
    carrier: r.carrier,
    service: r.service,
    rateCents: dollarsToCents(r.rate),
    deliveryDays: r.delivery_days ?? null,
  }));

  return { easypostShipmentId: data.id, rates };
}

/**
 * Buy a shipment (purchase the label for a specific rate).
 */
export async function buyShipment(
  apiKey: string,
  shipmentId: string,
  rateId: string,
): Promise<PurchasedShipment> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await easypostFetch(
    apiKey,
    "POST",
    `/shipments/${shipmentId}/buy`,
    { rate: { id: rateId } },
  )) as any;

  return {
    trackingNumber: data.tracking_code,
    labelUrl: data.postage_label.label_url,
    rateCents: dollarsToCents(data.selected_rate.rate),
    carrier: data.selected_rate.carrier,
    service: data.selected_rate.service,
    easypostTrackerId: data.tracker.id,
  };
}

/**
 * Void / refund a shipment label.
 */
export async function refundShipment(
  apiKey: string,
  shipmentId: string,
): Promise<RefundResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await easypostFetch(
    apiKey,
    "POST",
    `/shipments/${shipmentId}/refund`,
  )) as any;

  return { easypostRefundStatus: data.refund_status };
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

  return expected === sig;
}
