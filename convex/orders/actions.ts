import { action, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { SearchOrdersRequestModel } from "../integrations/tcgplayer";
import { searchOrders } from "../integrations/tcgplayer";
import { listSellerOrders, type SellerOrdersListParams } from "../integrations/manapool";
import { getManaPoolCredentialsOrThrow, requireAdminUserId } from "../manapool/auth";
import { getOptionalRecord, toOptionalNumber, toOptionalString } from "../lib/normalize";
import { mapSearchOrderSummary } from "../tcgplayer/types";
import type { CanonicalOrderInput, OrderListItem, SourceSyncStatus } from "./types";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const FRESHNESS_WINDOW_MS = 2 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 8_000;

const TCG_DEFAULT_SORT: SearchOrdersRequestModel["sortBy"] = [
  { sortingType: "orderStatus", direction: "ascending" },
  { sortingType: "orderDate", direction: "ascending" },
];

type MergedOrdersResponse = {
  orders: OrderListItem[];
  total: number;
};

type SourceStatusResponse = {
  manapool: SourceSyncStatus;
  tcgplayer: SourceSyncStatus;
};

type LoadActionResult = {
  orders: OrderListItem[];
  total: number;
  sources: SourceStatusResponse;
  servedAt: string;
};

function clampPageArgs(args: { from?: number; size?: number }) {
  const from = Math.max(0, args.from ?? 0);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, args.size ?? DEFAULT_PAGE_SIZE));
  return { from, size };
}

function withTimeout<T>(
  label: string,
  task: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    task()
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function getTcgplayerSessionCookieOrThrow(): string {
  const cookie = process.env.TCGPLAYER_SESSION_COOKIE;
  if (!cookie || cookie.trim().length === 0) {
    throw new Error("TCGPLAYER_SESSION_COOKIE not set");
  }
  return cookie;
}

function getTcgplayerSellerKeyOrThrow(): string {
  const sellerKey = process.env.TCGPLAYER_SELLER_KEY;
  if (!sellerKey || sellerKey.trim().length === 0) {
    throw new Error("TCGPLAYER_SELLER_KEY not set");
  }
  return sellerKey.trim().toLowerCase();
}

function extractManaOrders(payload: unknown): unknown[] {
  const record = getOptionalRecord(payload);
  if (!record) return [];

  const orders = record.orders;
  if (Array.isArray(orders)) return orders;

  const nestedOrders = getOptionalRecord(record.data)?.orders;
  return Array.isArray(nestedOrders) ? nestedOrders : [];
}

function mapManaOrderToCanonical(order: unknown): CanonicalOrderInput | null {
  const record = getOptionalRecord(order);
  const sourceOrderId = toOptionalString(record?.id);
  if (!sourceOrderId) return null;

  const trackingNumbers = Array.isArray(record?.trackingNumbers)
    ? record.trackingNumbers.filter((value): value is string => typeof value === "string")
    : undefined;

  const allowedActions = Array.isArray(record?.allowedActions)
    ? record.allowedActions.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    sourceOrderId,
    status: toOptionalString(record?.status),
    createdAt: toOptionalString(record?.createdAt),
    buyerId: toOptionalString(record?.buyerId),
    buyerName: toOptionalString(record?.buyerName),
    sellerName: toOptionalString(record?.sellerName),
    orderChannel: toOptionalString(record?.orderChannel),
    orderFulfillment: toOptionalString(record?.orderFulfillment),
    label: toOptionalString(record?.label),
    totalCents: toOptionalNumber(record?.totalCents),
    shippingMethod: toOptionalString(record?.shippingMethod),
    latestFulfillmentStatus: toOptionalString(record?.latestFulfillmentStatus),
    estimatedDeliveryAt: toOptionalString(record?.estimatedDeliveryAt),
    buyerPaid: typeof record?.buyerPaid === "boolean" ? record.buyerPaid : undefined,
    trackingNumbers,
    allowedActions,
    refundStatus: toOptionalString(record?.refundStatus),
    shippingAddress: getOptionalRecord(record?.shippingAddress),
    payment: getOptionalRecord(record?.payment),
    fulfillments: Array.isArray(record?.fulfillments) ? record.fulfillments : undefined,
    items: Array.isArray(record?.items) ? record.items : undefined,
    reports: Array.isArray(record?.reports) ? record.reports : undefined,
  };
}

function mapTcgplayerSummaryToCanonical(
  summary: ReturnType<typeof mapSearchOrderSummary>,
): CanonicalOrderInput | null {
  if (!summary) return null;

  return {
    sourceOrderId: summary.orderNumber,
    status: summary.statusDisplay,
    createdAt: summary.createdAt,
    buyerName: summary.buyerName,
    totalCents: summary.totalAmountCents,
    shippingMethod: summary.shippingType,
    latestFulfillmentStatus: summary.statusCode,
    orderChannel: summary.orderChannel,
    orderFulfillment: summary.orderFulfillment,
    buyerPaid: summary.buyerPaid,
    payment: {
      productAmountCents: summary.productAmountCents,
      shippingAmountCents: summary.shippingAmountCents,
      totalAmountCents: summary.totalAmountCents,
    },
    tcgplayerSellerKey: summary.sellerKey,
    tcgplayerSummaryHash: summary.summaryHash,
  };
}

function isStale(status: SourceSyncStatus, nowMs: number): boolean {
  if (!status.lastSuccessAt) return true;
  const lastSuccessMs = Date.parse(status.lastSuccessAt);
  if (!Number.isFinite(lastSuccessMs)) return true;
  return nowMs - lastSuccessMs > FRESHNESS_WINDOW_MS;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown provider error";
}

async function syncManaPool(
  ctx: Pick<ActionCtx, "runMutation">,
  args: { ownerUserId: string; fetchSize: number },
) {
  const credentials = getManaPoolCredentialsOrThrow();
  const params: SellerOrdersListParams = {
    limit: args.fetchSize,
    offset: 0,
  };
  const response = await withTimeout(
    "ManaPool orders sync",
    () => listSellerOrders(credentials, params),
    PROVIDER_TIMEOUT_MS,
  );

  const syncedAt = new Date().toISOString();
  const canonicalOrders = extractManaOrders(response)
    .map(mapManaOrderToCanonical)
    .filter((order): order is CanonicalOrderInput => !!order);

  await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, {
    source: "manapool",
    ownerUserId: args.ownerUserId,
    syncedAt,
    orders: canonicalOrders,
  });

  return canonicalOrders.length;
}

async function syncTcgplayer(
  ctx: Pick<ActionCtx, "runMutation">,
  args: { ownerUserId: string; fetchSize: number },
) {
  const sessionCookie = getTcgplayerSessionCookieOrThrow();
  const sellerKey = getTcgplayerSellerKeyOrThrow();
  const request: SearchOrdersRequestModel = {
    searchRange: "LastThreeMonths",
    filters: { sellerKey },
    sortBy: TCG_DEFAULT_SORT,
    from: 0,
    size: args.fetchSize,
  };

  const response = await withTimeout(
    "TCGplayer orders sync",
    () => searchOrders({ sessionCookie, request }),
    PROVIDER_TIMEOUT_MS,
  );

  const syncedAt = new Date().toISOString();
  const canonicalOrders = response.orders
    .map((order) => mapSearchOrderSummary(order, sellerKey))
    .map(mapTcgplayerSummaryToCanonical)
    .filter((order): order is CanonicalOrderInput => !!order);

  await ctx.runMutation(internal.orders.mutations.upsertOrdersBatch, {
    source: "tcgplayer",
    ownerUserId: args.ownerUserId,
    syncedAt,
    orders: canonicalOrders,
  });

  return canonicalOrders.length;
}

export const loadAction = action({
  args: {
    from: v.optional(v.number()),
    size: v.optional(v.number()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<LoadActionResult> => {
    const ownerUserId = await requireAdminUserId(ctx);
    const { from, size } = clampPageArgs(args);

    const existing = (await ctx.runQuery(internal.orders.queries.listMergedOrdersInternal, {
      ownerUserId,
      from,
      size,
    })) as MergedOrdersResponse;
    const syncStatus = (await ctx.runQuery(internal.orders.queries.getSyncStatusInternal, {})) as SourceStatusResponse;

    const nowMs = Date.now();
    const shouldSync =
      args.forceRefresh === true ||
      existing.total === 0 ||
      isStale(syncStatus.manapool, nowMs) ||
      isStale(syncStatus.tcgplayer, nowMs);

    if (shouldSync) {
      const fetchSize = Math.min(100, Math.max(size + from + 25, DEFAULT_PAGE_SIZE));
      const nowIso = new Date().toISOString();

      const results = await Promise.allSettled([
        syncManaPool(ctx, { ownerUserId, fetchSize }),
        syncTcgplayer(ctx, { ownerUserId, fetchSize }),
      ]);

      const manapoolResult = results[0];
      if (manapoolResult?.status === "fulfilled") {
        await ctx.runMutation(internal.orders.mutations.upsertSyncStatus, {
          source: "manapool",
          status: "ok",
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
          lastError: "",
        });
      } else {
        await ctx.runMutation(internal.orders.mutations.upsertSyncStatus, {
          source: "manapool",
          status: "error",
          lastAttemptAt: nowIso,
          lastError: toErrorMessage(manapoolResult?.reason),
        });
      }

      const tcgplayerResult = results[1];
      if (tcgplayerResult?.status === "fulfilled") {
        await ctx.runMutation(internal.orders.mutations.upsertSyncStatus, {
          source: "tcgplayer",
          status: "ok",
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
          lastError: "",
        });
      } else {
        await ctx.runMutation(internal.orders.mutations.upsertSyncStatus, {
          source: "tcgplayer",
          status: "error",
          lastAttemptAt: nowIso,
          lastError: toErrorMessage(tcgplayerResult?.reason),
        });
      }
    }

    const latest = (await ctx.runQuery(internal.orders.queries.listMergedOrdersInternal, {
      ownerUserId,
      from,
      size,
    })) as MergedOrdersResponse;
    const latestSyncStatus = (await ctx.runQuery(internal.orders.queries.getSyncStatusInternal, {})) as SourceStatusResponse;
    const bothSourcesFailed =
      latestSyncStatus.manapool.status === "error" &&
      latestSyncStatus.tcgplayer.status === "error";

    if (latest.total === 0 && bothSourcesFailed) {
      throw new Error("Unable to load orders from ManaPool and TCGplayer.");
    }

    return {
      orders: latest.orders,
      total: latest.total,
      sources: latestSyncStatus,
      servedAt: new Date().toISOString(),
    };
  },
});
