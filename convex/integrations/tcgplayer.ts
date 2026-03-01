const ORDER_MANAGEMENT_BASE_URL = "https://order-management-api.tcgplayer.com";
const STORE_ADMIN_BASE_URL = "https://store.tcgplayer.com";
const ORDER_API_VERSION = "2.0";

type QueryValue = string | number | boolean;
type QueryInput =
  | QueryValue
  | QueryValue[]
  | readonly QueryValue[]
  | null
  | undefined;

export interface SearchOrdersRequestModel {
  searchRange: string;
  filters: {
    sellerKey: string;
    orderStatuses?: string[];
    fulfillmentTypes?: string[];
  };
  sortBy: Array<{
    sortingType: string;
    direction: "ascending" | "descending";
  }>;
  from: number;
  size: number;
}

export interface SearchOrderSummary {
  orderNumber: string;
  orderDate?: string;
  orderChannel?: string;
  orderStatus?: string;
  buyerName?: string;
  shippingType?: string;
  productAmount?: number;
  shippingAmount?: number;
  totalAmount?: number;
  buyerPaid?: boolean;
  orderFulfillment?: string;
}

export interface SearchOrdersResponse {
  orders: SearchOrderSummary[];
  totalOrders: number;
}

export interface OrderTaxLine {
  code?: string;
  amount?: number;
}

export interface OrderProductLine {
  name?: string;
  unitPrice?: number;
  extendedPrice?: number;
  quantity?: number;
  url?: string;
  productId?: string | number;
  skuId?: string | number;
}

export interface OrderDetailResponse {
  createdAt?: string;
  status?: string;
  orderChannel?: string;
  orderFulfillment?: string;
  orderNumber: string;
  sellerName?: string;
  buyerName?: string;
  paymentType?: string;
  pickupStatus?: string;
  shippingType?: string;
  estimatedDeliveryDate?: string;
  transaction?: {
    productAmount?: number;
    shippingAmount?: number;
    grossAmount?: number;
    feeAmount?: number;
    netAmount?: number;
    directFeeAmount?: number;
    taxes?: OrderTaxLine[];
  };
  shippingAddress?: Record<string, unknown>;
  products?: OrderProductLine[];
  refunds?: unknown[];
  refundStatus?: string;
  trackingNumbers?: string[];
  allowedActions?: string[];
}

export interface ExportOrdersRequest {
  searchOrdersRequestModel: SearchOrdersRequestModel;
  timezoneOffset: number;
}

export interface ExportPullSheetsRequest {
  sortingType: string;
  format: string;
  timezoneOffset: number;
  orderNumbers: string[];
}

export interface ExportPackingSlipsRequest {
  orderNumbers: string[];
  timezoneOffset: number;
}

export interface ExportedDocument {
  contentBase64: string;
  contentType: string | null;
  contentDisposition: string | null;
}

export class TcgplayerError extends Error {
  readonly httpStatus: number;
  readonly details: unknown;

  constructor(message: string, httpStatus: number, details: unknown) {
    super(message);
    this.name = "TcgplayerError";
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function buildUrl(opts: {
  baseUrl: string;
  path: string;
  query?: Record<string, QueryInput>;
  includeApiVersion?: boolean;
}): string {
  const url = new URL(`${opts.baseUrl}${opts.path}`);

  if (opts.includeApiVersion) {
    url.searchParams.set("api-version", ORDER_API_VERSION);
  }

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
        continue;
      }
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

function buildHeaders(opts: {
  sessionCookie: string;
  accept: string;
  contentTypeJson?: boolean;
}): Headers {
  const headers = new Headers();
  headers.set("Accept", opts.accept);
  headers.set("Cookie", opts.sessionCookie);
  if (opts.contentTypeJson) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  return await response.text();
}

function extractErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim().length > 0) {
    return body.trim();
  }

  if (typeof body === "object" && body !== null) {
    const asRecord = body as Record<string, unknown>;
    if (typeof asRecord.message === "string" && asRecord.message.trim().length > 0) {
      return asRecord.message;
    }
    if (typeof asRecord.title === "string" && asRecord.title.trim().length > 0) {
      return asRecord.title;
    }
  }

  return `TCGPlayer request failed with status ${status}`;
}

function normalizeBase64Payload(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // response was plain text base64, keep as-is
    }

    return trimmed;
  }

  throw new Error("TCGPlayer export response was not a base64 string");
}

async function requestJson<T>(opts: {
  method: "GET" | "POST";
  url: string;
  sessionCookie: string;
  body?: unknown;
  accept?: string;
}): Promise<T> {
  const response = await fetch(opts.url, {
    method: opts.method,
    headers: buildHeaders({
      sessionCookie: opts.sessionCookie,
      accept: opts.accept ?? "application/json, text/plain, */*",
      contentTypeJson: opts.body !== undefined,
    }),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const parsed = await parseResponseBody(response);

  if (!response.ok) {
    throw new TcgplayerError(
      extractErrorMessage(parsed, response.status),
      response.status,
      parsed,
    );
  }

  return parsed as T;
}

async function requestExport(opts: {
  url: string;
  sessionCookie: string;
  body: unknown;
}): Promise<ExportedDocument> {
  const response = await fetch(opts.url, {
    method: "POST",
    headers: buildHeaders({
      sessionCookie: opts.sessionCookie,
      accept: "application/json, text/plain, */*",
      contentTypeJson: true,
    }),
    body: JSON.stringify(opts.body),
  });

  const parsed = await parseResponseBody(response);

  if (!response.ok) {
    throw new TcgplayerError(
      extractErrorMessage(parsed, response.status),
      response.status,
      parsed,
    );
  }

  return {
    contentBase64: normalizeBase64Payload(parsed),
    contentType: response.headers.get("content-type"),
    contentDisposition: response.headers.get("content-disposition"),
  };
}

export function isRetriableTcgplayerError(error: unknown): boolean {
  if (error instanceof TcgplayerError) {
    return (
      error.httpStatus === 408 ||
      error.httpStatus === 429 ||
      error.httpStatus >= 500
    );
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (error.name === "TypeError") return true;
  }

  return false;
}

export async function searchOrders(opts: {
  sessionCookie: string;
  request: SearchOrdersRequestModel;
}): Promise<SearchOrdersResponse> {
  const url = buildUrl({
    baseUrl: ORDER_MANAGEMENT_BASE_URL,
    path: "/orders/search",
    includeApiVersion: true,
  });

  return await requestJson<SearchOrdersResponse>({
    method: "POST",
    url,
    sessionCookie: opts.sessionCookie,
    body: opts.request,
  });
}

export async function getOrderDetail(opts: {
  sessionCookie: string;
  orderNumber: string;
}): Promise<OrderDetailResponse> {
  const url = buildUrl({
    baseUrl: ORDER_MANAGEMENT_BASE_URL,
    path: `/orders/${encodeURIComponent(opts.orderNumber)}`,
    includeApiVersion: true,
  });

  return await requestJson<OrderDetailResponse>({
    method: "GET",
    url,
    sessionCookie: opts.sessionCookie,
  });
}

export async function exportOrdersCsv(opts: {
  sessionCookie: string;
  request: ExportOrdersRequest;
}): Promise<ExportedDocument> {
  const url = buildUrl({
    baseUrl: ORDER_MANAGEMENT_BASE_URL,
    path: "/orders/export",
    includeApiVersion: true,
  });

  return await requestExport({
    url,
    sessionCookie: opts.sessionCookie,
    body: opts.request,
  });
}

export async function exportPullSheets(opts: {
  sessionCookie: string;
  request: ExportPullSheetsRequest;
}): Promise<ExportedDocument> {
  const url = buildUrl({
    baseUrl: ORDER_MANAGEMENT_BASE_URL,
    path: "/orders/pull-sheets/export",
    includeApiVersion: true,
  });

  return await requestExport({
    url,
    sessionCookie: opts.sessionCookie,
    body: opts.request,
  });
}

export async function exportPackingSlips(opts: {
  sessionCookie: string;
  request: ExportPackingSlipsRequest;
}): Promise<ExportedDocument> {
  const url = buildUrl({
    baseUrl: ORDER_MANAGEMENT_BASE_URL,
    path: "/orders/packing-slips/export",
    includeApiVersion: true,
  });

  return await requestExport({
    url,
    sessionCookie: opts.sessionCookie,
    body: opts.request,
  });
}

export async function loadPendingPaymentsHtml(opts: {
  sessionCookie: string;
  cacheBuster?: number;
}): Promise<string> {
  const url = buildUrl({
    baseUrl: STORE_ADMIN_BASE_URL,
    path: "/admin/payment/loadpendingpayments",
    query: {
      r: opts.cacheBuster ?? Math.random(),
    },
  });

  return await requestJson<string>({
    method: "GET",
    url,
    sessionCookie: opts.sessionCookie,
    accept: "text/html, */*",
  });
}
