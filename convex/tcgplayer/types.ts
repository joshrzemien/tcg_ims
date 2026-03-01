import type {
  OrderDetailResponse,
  SearchOrderSummary,
} from "../integrations/tcgplayer";

export interface CanonicalOrderSummary {
  orderNumber: string;
  sellerKey: string;
  createdAt?: string;
  statusDisplay?: string;
  statusCode?: string;
  orderChannel?: string;
  buyerName?: string;
  shippingType?: string;
  orderFulfillment?: string;
  buyerPaid?: boolean;
  productAmountCents?: number;
  shippingAmountCents?: number;
  totalAmountCents?: number;
  summaryHash: string;
}

export interface CanonicalOrderDetail {
  orderNumber: string;
  sellerKey?: string;
  createdAt?: string;
  statusDisplay?: string;
  statusCode?: string;
  orderChannel?: string;
  orderFulfillment?: string;
  sellerName?: string;
  buyerName?: string;
  shippingType?: string;
  estimatedDeliveryAt?: string;
  payment?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  items?: unknown[];
  refunds?: unknown[];
  refundStatus?: string;
  trackingNumbers: string[];
  allowedActions: string[];
  totalCents?: number;
}

export interface CanonicalPendingPaymentChannel {
  channel: string;
  amountCents: number;
}

export interface CanonicalPendingPayments {
  sellerKey?: string;
  totalPendingAmountCents: number;
  channels: CanonicalPendingPaymentChannel[];
  rawHtml: string;
}

const STATUS_CODE_BY_TOKEN: Record<string, string> = {
  processing: "Processing",
  readytoship: "ReadyToShip",
  received: "Received",
  pulling: "Pulling",
  readyforpickup: "ReadyForPickup",
  shippedintransit: "ShippedInTransit",
  completedpaid: "CompletedPaid",
};

const FILTER_STATUS_BY_TOKEN: Record<string, string> = {
  processing: "Processing",
  readytoship: "ReadyToShip",
  received: "Received",
  pulling: "Pulling",
  readyforpickup: "ReadyForPickup",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}

function toTitlePascal(value: string): string {
  const parts = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  return parts.join("");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripHtmlTags(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

function parseCurrencyToCents(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const negative =
    trimmed.startsWith("-") ||
    (trimmed.includes("(") && trimmed.includes(")"));

  const numeric = trimmed.replace(/[^0-9.]/g, "");
  if (!numeric) return undefined;

  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount)) return undefined;

  const cents = Math.round(amount * 100);
  return negative ? -cents : cents;
}

function extractLastCurrencyCents(value: string): number | undefined {
  const matches = value.match(/[-(]?\$?\s*\d[\d,]*(?:\.\d{1,2})?\)?/g);
  if (!matches || matches.length === 0) return undefined;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const cents = parseCurrencyToCents(matches[index] ?? "");
    if (typeof cents === "number") {
      return cents;
    }
  }

  return undefined;
}

function summaryHashPayload(summary: Omit<CanonicalOrderSummary, "summaryHash">): string {
  return JSON.stringify({
    orderNumber: summary.orderNumber,
    sellerKey: summary.sellerKey,
    createdAt: summary.createdAt,
    statusDisplay: summary.statusDisplay,
    statusCode: summary.statusCode,
    orderChannel: summary.orderChannel,
    buyerName: summary.buyerName,
    shippingType: summary.shippingType,
    orderFulfillment: summary.orderFulfillment,
    buyerPaid: summary.buyerPaid,
    productAmountCents: summary.productAmountCents,
    shippingAmountCents: summary.shippingAmountCents,
    totalAmountCents: summary.totalAmountCents,
  });
}

export function dollarsToCents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return undefined;
}

export function normalizeStatusCode(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const token = normalizeToken(value);
  if (!token) return undefined;

  const mapped = STATUS_CODE_BY_TOKEN[token];
  if (mapped) return mapped;

  return toTitlePascal(value);
}

export function normalizeOrderStatusFilter(value: string): string {
  const token = normalizeToken(value);
  if (!token) return value;
  return FILTER_STATUS_BY_TOKEN[token] ?? toTitlePascal(value);
}

export function normalizeFulfillmentFilter(value: string): string {
  return normalizeWhitespace(value);
}

export function extractSellerKeyFromOrderNumber(
  orderNumber: string,
): string | undefined {
  const match = orderNumber.match(/^([A-Fa-f0-9]{8})-/);
  return match?.[1]?.toLowerCase();
}

export function mapSearchOrderSummary(
  raw: SearchOrderSummary,
  sellerKey: string,
): CanonicalOrderSummary | null {
  if (!raw || typeof raw.orderNumber !== "string" || raw.orderNumber.length === 0) {
    return null;
  }

  const summaryWithoutHash: Omit<CanonicalOrderSummary, "summaryHash"> = {
    orderNumber: raw.orderNumber,
    sellerKey,
    createdAt: toOptionalString(raw.orderDate),
    statusDisplay: toOptionalString(raw.orderStatus),
    statusCode: normalizeStatusCode(toOptionalString(raw.orderStatus)),
    orderChannel: toOptionalString(raw.orderChannel),
    buyerName: toOptionalString(raw.buyerName),
    shippingType: toOptionalString(raw.shippingType),
    orderFulfillment: toOptionalString(raw.orderFulfillment),
    buyerPaid: toOptionalBoolean(raw.buyerPaid),
    productAmountCents: dollarsToCents(raw.productAmount),
    shippingAmountCents: dollarsToCents(raw.shippingAmount),
    totalAmountCents: dollarsToCents(raw.totalAmount),
  };

  return {
    ...summaryWithoutHash,
    summaryHash: summaryHashPayload(summaryWithoutHash),
  };
}

export function mapOrderDetail(
  raw: OrderDetailResponse,
  sellerKeyHint?: string,
): CanonicalOrderDetail | null {
  if (!raw || typeof raw.orderNumber !== "string" || raw.orderNumber.length === 0) {
    return null;
  }

  const sellerKey =
    sellerKeyHint ?? extractSellerKeyFromOrderNumber(raw.orderNumber) ?? undefined;

  const transaction = isRecord(raw.transaction) ? raw.transaction : undefined;
  const taxes = Array.isArray(transaction?.taxes)
    ? transaction?.taxes
        .map((tax) => {
          const line = isRecord(tax) ? tax : {};
          const code = toOptionalString(line.code);
          const amountCents = dollarsToCents(line.amount);
          if (!code || typeof amountCents !== "number") return null;
          return { code, amountCents };
        })
        .filter((line): line is { code: string; amountCents: number } => !!line)
    : undefined;

  const payment: Record<string, unknown> = {
    paymentType: toOptionalString(raw.paymentType),
    pickupStatus: toOptionalString(raw.pickupStatus),
    productAmountCents: dollarsToCents(transaction?.productAmount),
    shippingAmountCents: dollarsToCents(transaction?.shippingAmount),
    grossAmountCents: dollarsToCents(transaction?.grossAmount),
    feeAmountCents: dollarsToCents(transaction?.feeAmount),
    netAmountCents: dollarsToCents(transaction?.netAmount),
    directFeeAmountCents: dollarsToCents(transaction?.directFeeAmount),
    taxes,
  };

  const products = Array.isArray(raw.products)
    ? raw.products.map((product) => {
        const line = isRecord(product) ? product : {};
        return {
          name: toOptionalString(line.name),
          quantity:
            typeof line.quantity === "number" && Number.isFinite(line.quantity)
              ? line.quantity
              : undefined,
          unitPriceCents: dollarsToCents(line.unitPrice),
          extendedPriceCents: dollarsToCents(line.extendedPrice),
          url: toOptionalString(line.url),
          productId:
            typeof line.productId === "number"
              ? String(line.productId)
              : toOptionalString(line.productId),
          skuId:
            typeof line.skuId === "number"
              ? String(line.skuId)
              : toOptionalString(line.skuId),
        };
      })
    : undefined;

  const trackingNumbers = Array.isArray(raw.trackingNumbers)
    ? raw.trackingNumbers.filter((value): value is string => typeof value === "string")
    : [];

  const allowedActions = Array.isArray(raw.allowedActions)
    ? raw.allowedActions.filter((value): value is string => typeof value === "string")
    : [];

  const shippingAddress = isRecord(raw.shippingAddress)
    ? raw.shippingAddress
    : undefined;

  return {
    orderNumber: raw.orderNumber,
    sellerKey,
    createdAt: toOptionalString(raw.createdAt),
    statusDisplay: toOptionalString(raw.status),
    statusCode: normalizeStatusCode(toOptionalString(raw.status)),
    orderChannel: toOptionalString(raw.orderChannel),
    orderFulfillment: toOptionalString(raw.orderFulfillment),
    sellerName: toOptionalString(raw.sellerName),
    buyerName: toOptionalString(raw.buyerName),
    shippingType: toOptionalString(raw.shippingType),
    estimatedDeliveryAt: toOptionalString(raw.estimatedDeliveryDate),
    payment,
    shippingAddress,
    items: products,
    refunds: Array.isArray(raw.refunds) ? raw.refunds : undefined,
    refundStatus: toOptionalString(raw.refundStatus),
    trackingNumbers,
    allowedActions,
    totalCents:
      dollarsToCents(transaction?.grossAmount) ??
      dollarsToCents(transaction?.productAmount),
  };
}

export function parsePendingPaymentsHtml(
  html: string,
  sellerKeyHint?: string,
): CanonicalPendingPayments {
  const sellerKeyMatch = html.match(/expand-pending-payment_[^_]+_([A-Fa-f0-9]{8})/);
  const sellerKey = sellerKeyMatch?.[1]?.toLowerCase() ?? sellerKeyHint;

  const channels: CanonicalPendingPaymentChannel[] = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  let totalPendingAmountCents: number | undefined;

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (match) => match[1] ?? "",
    );
    if (cells.length === 0) continue;

    const label = stripHtmlTags(cells[0] ?? "");
    if (!label) continue;

    const rowText = stripHtmlTags(cells.join(" "));
    const amountCents = extractLastCurrencyCents(rowText);
    if (typeof amountCents !== "number") continue;

    if (/^total$/i.test(label) || /^total pending/i.test(label)) {
      totalPendingAmountCents = amountCents;
      continue;
    }

    channels.push({ channel: label, amountCents });
  }

  if (typeof totalPendingAmountCents !== "number") {
    totalPendingAmountCents = channels.reduce(
      (sum, channel) => sum + channel.amountCents,
      0,
    );
  }

  return {
    sellerKey,
    totalPendingAmountCents,
    channels,
    rawHtml: html,
  };
}
