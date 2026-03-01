import { camelizeKeysDeep, type ManaPoolCredentials } from "../manapool/types";

const BASE_URL = "https://manapool.com/api/v1";

type QueryValue = string | number | boolean;
type QueryInput =
  | QueryValue
  | QueryValue[]
  | readonly QueryValue[]
  | null
  | undefined;

export class ManaPoolError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly details: unknown;

  constructor(message: string, httpStatus: number, details: unknown, code?: string) {
    super(message);
    this.name = "ManaPoolError";
    this.httpStatus = httpStatus;
    this.details = details;
    this.code = code;
  }
}

function buildUrl(path: string, query?: Record<string, QueryInput>): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (!query) return url.toString();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.append(key, String(value));
  }

  return url.toString();
}

function buildHeaders(
  opts: {
    credentials?: ManaPoolCredentials;
    accept?: "application/json" | "text/csv";
    contentTypeJson?: boolean;
  } = {},
): Headers {
  const headers = new Headers();

  if (opts.accept) {
    headers.set("Accept", opts.accept);
  }

  if (opts.contentTypeJson) {
    headers.set("Content-Type", "application/json");
  }

  if (opts.credentials) {
    headers.set("X-ManaPool-Email", opts.credentials.email);
    headers.set("X-ManaPool-Access-Token", opts.credentials.accessToken);
  }

  return headers;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  return await response.text();
}

async function requestJson<T>(opts: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  credentials?: ManaPoolCredentials;
  query?: Record<string, QueryInput>;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(buildUrl(opts.path, opts.query), {
    method: opts.method,
    headers: buildHeaders({
      credentials: opts.credentials,
      accept: "application/json",
      contentTypeJson: opts.body !== undefined,
    }),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const parsed = await parseBody(response);

  if (!response.ok) {
    const details = parsed;
    const message =
      typeof details === "object" && details !== null && "message" in details
        ? String((details as Record<string, unknown>).message)
        : `ManaPool request failed with status ${response.status}`;
    const code =
      typeof details === "object" && details !== null && "code" in details
        ? String((details as Record<string, unknown>).code)
        : undefined;
    throw new ManaPoolError(message, response.status, details, code);
  }

  return camelizeKeysDeep(parsed) as T;
}

async function requestText(opts: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  credentials?: ManaPoolCredentials;
  query?: Record<string, QueryInput>;
  body?: unknown;
  accept: "text/csv";
}): Promise<string> {
  const response = await fetch(buildUrl(opts.path, opts.query), {
    method: opts.method,
    headers: buildHeaders({
      credentials: opts.credentials,
      accept: opts.accept,
      contentTypeJson: opts.body !== undefined,
    }),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new ManaPoolError(
      `ManaPool text request failed with status ${response.status}`,
      response.status,
      body,
    );
  }

  return body;
}

export function isOutageError(error: unknown): boolean {
  if (error instanceof ManaPoolError) {
    return error.httpStatus === 429 || error.httpStatus >= 500;
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (error.name === "TypeError") return true;
  }

  return false;
}

export type LookupSinglesParams = {
  scryfallIds?: string[];
  tcgplayerIds?: number[];
  tcgplayerSkuIds?: number[];
  mtgjsonUuids?: string[];
  productIds?: string[];
  languages?: string[];
};

export type LookupSealedParams = {
  tcgplayerIds?: number[];
  mtgjsonUuids?: string[];
  productIds?: string[];
};

export type SellerInventoryListParams = {
  limit?: number;
  offset?: number;
  minQuantity?: number;
};

export type SellerInventorySetBody = {
  priceCents: number;
  quantity: number;
};

export type SellerInventoryScryfallLookup = {
  scryfallId: string;
  languageId?: string;
  finishId?: string;
  conditionId?: string;
};

export type SellerInventoryTcgplayerLookup = {
  tcgplayerId: number;
  languageId?: string;
  finishId?: string;
  conditionId?: string;
};

export type BulkPriceJobsListParams = {
  limit?: number;
  offset?: number;
};

export type SellerOrdersListParams = {
  since?: string;
  isUnfulfilled?: "true" | "false";
  isFulfilled?: "true" | "false";
  hasFulfillments?: "true" | "false";
  label?: string;
  limit?: number;
  offset?: number;
};

export type SellerOrderFulfillmentBody = {
  status: "error" | "processing" | "shipped" | "delivered" | "refunded" | "replaced";
  trackingCompany?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  inTransitAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
};

export type WebhookRegisterBody = {
  topic: "order_created";
  callbackUrl: string;
};

export async function getSinglesPrices(
  format: "json" | "csv",
): Promise<unknown | string> {
  if (format === "csv") {
    return requestText({
      method: "GET",
      path: "/prices/singles",
      accept: "text/csv",
    });
  }

  return requestJson({ method: "GET", path: "/prices/singles" });
}

export async function getSealedPrices(
  format: "json" | "csv",
): Promise<unknown | string> {
  if (format === "csv") {
    return requestText({
      method: "GET",
      path: "/prices/sealed",
      accept: "text/csv",
    });
  }

  return requestJson({ method: "GET", path: "/prices/sealed" });
}

export async function getVariantPrices(
  format: "json" | "csv",
): Promise<unknown | string> {
  if (format === "csv") {
    return requestText({
      method: "GET",
      path: "/prices/variants",
      accept: "text/csv",
    });
  }

  return requestJson({ method: "GET", path: "/prices/variants" });
}

export async function lookupSingles(params: LookupSinglesParams): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/products/singles",
    query: {
      scryfall_ids: params.scryfallIds,
      tcgplayer_ids: params.tcgplayerIds,
      tcgplayer_sku_ids: params.tcgplayerSkuIds,
      mtgjson_uuids: params.mtgjsonUuids,
      product_ids: params.productIds,
      languages: params.languages,
    },
  });
}

export async function lookupSealed(params: LookupSealedParams): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/products/sealed",
    query: {
      tcgplayer_ids: params.tcgplayerIds,
      mtgjson_uuids: params.mtgjsonUuids,
      product_ids: params.productIds,
    },
  });
}

export async function getInventoryListingsByIds(ids: string[]): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/inventory/listings",
    query: { id: ids },
  });
}

export async function getInventoryListingById(id: string): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/inventory/listings/${encodeURIComponent(id)}`,
  });
}

export async function listSellerInventory(
  credentials: ManaPoolCredentials,
  params: SellerInventoryListParams,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/seller/inventory",
    credentials,
    query: {
      limit: params.limit,
      offset: params.offset,
      minQuantity: params.minQuantity,
    },
  });
}

export async function bulkUpsertSellerInventoryByTcgsku(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/seller/inventory/tcgsku",
    credentials,
    body,
  });
}

export async function bulkUpsertSellerInventoryByProduct(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/seller/inventory/product",
    credentials,
    body,
  });
}

export async function bulkUpsertSellerInventoryByScryfallId(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/seller/inventory/scryfall_id",
    credentials,
    body,
  });
}

export async function bulkUpsertSellerInventoryByTcgplayerId(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/seller/inventory/tcgplayer_id",
    credentials,
    body,
  });
}

export async function getSellerInventoryByTcgsku(
  credentials: ManaPoolCredentials,
  sku: number,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/inventory/tcgsku/${encodeURIComponent(String(sku))}`,
    credentials,
  });
}

export async function updateSellerInventoryByTcgsku(
  credentials: ManaPoolCredentials,
  sku: number,
  body: SellerInventorySetBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: `/seller/inventory/tcgsku/${encodeURIComponent(String(sku))}`,
    credentials,
    body: {
      price_cents: body.priceCents,
      quantity: body.quantity,
    },
  });
}

export async function deleteSellerInventoryByTcgsku(
  credentials: ManaPoolCredentials,
  sku: number,
): Promise<unknown> {
  return requestJson({
    method: "DELETE",
    path: `/seller/inventory/tcgsku/${encodeURIComponent(String(sku))}`,
    credentials,
  });
}

export async function batchGetSellerInventoryByTcgsku(
  credentials: ManaPoolCredentials,
  skus: number[],
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/seller/inventory/tcgsku/batch",
    credentials,
    body: { tcgplayer_skus: skus },
  });
}

export async function getSellerInventoryByProduct(
  credentials: ManaPoolCredentials,
  productType: string,
  productId: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/inventory/product/${encodeURIComponent(productType)}/${encodeURIComponent(productId)}`,
    credentials,
  });
}

export async function updateSellerInventoryByProduct(
  credentials: ManaPoolCredentials,
  productType: string,
  productId: string,
  body: SellerInventorySetBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: `/seller/inventory/product/${encodeURIComponent(productType)}/${encodeURIComponent(productId)}`,
    credentials,
    body: {
      price_cents: body.priceCents,
      quantity: body.quantity,
    },
  });
}

export async function deleteSellerInventoryByProduct(
  credentials: ManaPoolCredentials,
  productType: string,
  productId: string,
): Promise<unknown> {
  return requestJson({
    method: "DELETE",
    path: `/seller/inventory/product/${encodeURIComponent(productType)}/${encodeURIComponent(productId)}`,
    credentials,
  });
}

export async function getSellerInventoryByScryfallId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryScryfallLookup,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/inventory/scryfall_id/${encodeURIComponent(lookup.scryfallId)}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
  });
}

export async function updateSellerInventoryByScryfallId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryScryfallLookup,
  body: SellerInventorySetBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: `/seller/inventory/scryfall_id/${encodeURIComponent(lookup.scryfallId)}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
    body: {
      price_cents: body.priceCents,
      quantity: body.quantity,
    },
  });
}

export async function deleteSellerInventoryByScryfallId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryScryfallLookup,
): Promise<unknown> {
  return requestJson({
    method: "DELETE",
    path: `/seller/inventory/scryfall_id/${encodeURIComponent(lookup.scryfallId)}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
  });
}

export async function getSellerInventoryByTcgplayerId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryTcgplayerLookup,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/inventory/tcgplayer_id/${encodeURIComponent(String(lookup.tcgplayerId))}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
  });
}

export async function updateSellerInventoryByTcgplayerId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryTcgplayerLookup,
  body: SellerInventorySetBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: `/seller/inventory/tcgplayer_id/${encodeURIComponent(String(lookup.tcgplayerId))}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
    body: {
      price_cents: body.priceCents,
      quantity: body.quantity,
    },
  });
}

export async function deleteSellerInventoryByTcgplayerId(
  credentials: ManaPoolCredentials,
  lookup: SellerInventoryTcgplayerLookup,
): Promise<unknown> {
  return requestJson({
    method: "DELETE",
    path: `/seller/inventory/tcgplayer_id/${encodeURIComponent(String(lookup.tcgplayerId))}`,
    credentials,
    query: {
      language_id: lookup.languageId,
      finish_id: lookup.finishId,
      condition_id: lookup.conditionId,
    },
  });
}

export async function listSellerInventoryAnomalies(
  credentials: ManaPoolCredentials,
  params: { limit?: number; offset?: number },
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/seller/inventory/anomalies",
    credentials,
    query: {
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function countSellerInventoryAnomalies(
  credentials: ManaPoolCredentials,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/seller/inventory/anomalies/count",
    credentials,
  });
}

export async function createBulkPriceJob(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/inventory/bulk-price",
    credentials,
    body,
  });
}

export async function countBulkPriceMatches(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/inventory/bulk-price/count",
    credentials,
    body,
  });
}

export async function previewBulkPrice(
  credentials: ManaPoolCredentials,
  body: unknown,
): Promise<unknown> {
  return requestJson({
    method: "POST",
    path: "/inventory/bulk-price/preview",
    credentials,
    body,
  });
}

export async function listBulkPriceJobs(
  credentials: ManaPoolCredentials,
  params: BulkPriceJobsListParams,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/inventory/bulk-price/jobs",
    credentials,
    query: {
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function getBulkPriceJob(
  credentials: ManaPoolCredentials,
  jobId: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/inventory/bulk-price/jobs/${encodeURIComponent(jobId)}`,
    credentials,
  });
}

export async function getRecentBulkPriceJob(
  credentials: ManaPoolCredentials,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/inventory/bulk-price/jobs/recent",
    credentials,
  });
}

export async function exportBulkPriceJobCsv(
  credentials: ManaPoolCredentials,
  jobId: string,
): Promise<string> {
  return requestText({
    method: "GET",
    path: `/inventory/bulk-price/jobs/${encodeURIComponent(jobId)}/export`,
    credentials,
    accept: "text/csv",
  });
}

export async function listSellerOrders(
  credentials: ManaPoolCredentials,
  params: SellerOrdersListParams,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/seller/orders",
    credentials,
    query: {
      since: params.since,
      is_unfulfilled: params.isUnfulfilled,
      is_fulfilled: params.isFulfilled,
      has_fulfillments: params.hasFulfillments,
      label: params.label,
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export async function getSellerOrder(
  credentials: ManaPoolCredentials,
  orderId: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/orders/${encodeURIComponent(orderId)}`,
    credentials,
  });
}

export async function upsertSellerOrderFulfillment(
  credentials: ManaPoolCredentials,
  orderId: string,
  body: SellerOrderFulfillmentBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: `/seller/orders/${encodeURIComponent(orderId)}/fulfillment`,
    credentials,
    body: {
      status: body.status,
      tracking_company: body.trackingCompany,
      tracking_number: body.trackingNumber,
      tracking_url: body.trackingUrl,
      in_transit_at: body.inTransitAt,
      estimated_delivery_at: body.estimatedDeliveryAt,
      delivered_at: body.deliveredAt,
    },
  });
}

export async function getSellerOrderReports(
  credentials: ManaPoolCredentials,
  orderId: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/seller/orders/${encodeURIComponent(orderId)}/reports`,
    credentials,
  });
}

export async function listWebhooks(
  credentials: ManaPoolCredentials,
  topic?: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: "/webhooks",
    credentials,
    query: {
      topic,
    },
  });
}

export async function getWebhook(
  credentials: ManaPoolCredentials,
  webhookId: string,
): Promise<unknown> {
  return requestJson({
    method: "GET",
    path: `/webhooks/${encodeURIComponent(webhookId)}`,
    credentials,
  });
}

export async function deleteWebhook(
  credentials: ManaPoolCredentials,
  webhookId: string,
): Promise<void> {
  await requestJson({
    method: "DELETE",
    path: `/webhooks/${encodeURIComponent(webhookId)}`,
    credentials,
  });
}

export async function registerWebhook(
  credentials: ManaPoolCredentials,
  body: WebhookRegisterBody,
): Promise<unknown> {
  return requestJson({
    method: "PUT",
    path: "/webhooks/register",
    credentials,
    body: {
      topic: body.topic,
      callback_url: body.callbackUrl,
    },
  });
}

export type ParsedSignature = {
  timestamp: number | null;
  v1: string[];
};

export function parseWebhookSignatureHeader(signatureHeader: string): ParsedSignature {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  let timestamp: number | null = null;
  const v1: string[] = [];

  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) continue;
    const value = rest.join("=");
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    }
    if (key === "v1") {
      v1.push(value);
    }
  }

  return { timestamp, v1 };
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyWebhookSignature(opts: {
  secret: string;
  timestampHeader: string;
  signatureHeader: string;
  rawBody: string;
}): Promise<boolean> {
  const parsedSignature = parseWebhookSignatureHeader(opts.signatureHeader);
  if (parsedSignature.v1.length === 0) return false;

  const headerTimestamp = Number.parseInt(opts.timestampHeader, 10);
  if (!Number.isFinite(headerTimestamp)) return false;

  if (
    parsedSignature.timestamp !== null &&
    parsedSignature.timestamp !== headerTimestamp
  ) {
    return false;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(opts.secret);
  const message = `v1:${headerTimestamp}:${opts.rawBody}`;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );

  const expectedHex = bufferToHex(signature);
  return parsedSignature.v1.some((candidate) =>
    timingSafeEqualHex(expectedHex, candidate),
  );
}
