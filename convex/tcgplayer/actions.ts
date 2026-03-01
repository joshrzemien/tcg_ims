import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  exportOrdersCsv,
  exportPackingSlips,
  exportPullSheets,
  getOrderDetail,
  isRetriableTcgplayerError,
  loadPendingPaymentsHtml,
  searchOrders,
  type ExportedDocument,
  type SearchOrdersRequestModel,
} from "../integrations/tcgplayer";
import { requireAdminUserId } from "../manapool/auth";
import {
  mapOrderDetail,
  mapSearchOrderSummary,
  normalizeFulfillmentFilter,
  normalizeOrderStatusFilter,
  parsePendingPaymentsHtml,
} from "./types";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_SEARCH_RANGE = "LastThreeMonths";
const DEFAULT_SORT_BY = [
  { sortingType: "orderStatus", direction: "ascending" as const },
  { sortingType: "orderDate", direction: "ascending" as const },
];

const sortByValidator = v.object({
  sortingType: v.string(),
  direction: v.union(v.literal("ascending"), v.literal("descending")),
});

type SyncCtx = {
  runMutation: ActionCtx["runMutation"];
  runQuery: ActionCtx["runQuery"];
};

type SearchOrdersActionResult =
  | {
      source: "live";
      sellerKey: string;
      totalOrders: number;
      orders: unknown[];
      ordersUpserted: number;
      changedOrderNumbers: string[];
      newOrderNumbers: string[];
      detailsRefreshed: number;
    }
  | {
      source: "stale";
      sellerKey: string;
      totalOrders: number;
      orders: unknown[];
      ordersUpserted: number;
      changedOrderNumbers: string[];
      newOrderNumbers: string[];
      detailsRefreshed: number;
    };

type GetOrderDetailActionResult =
  | {
      source: "live";
      order: unknown;
    }
  | {
      source: "stale";
      order: unknown;
    };

type GetPendingPaymentsActionResult =
  | {
      source: "live";
      sellerKey: string;
      totalPendingAmountCents: number;
      channels: Array<{ channel: string; amountCents: number }>;
      rawHtml: string;
      syncedAt: string;
    }
  | {
      source: "stale";
      sellerKey: string;
      totalPendingAmountCents: number;
      channels: Array<{ channel: string; amountCents: number }>;
      rawHtml: string;
      syncedAt: string;
    };

function getSessionCookieOrThrow(): string {
  const cookie = process.env.TCGPLAYER_SESSION_COOKIE;
  if (!cookie || cookie.trim().length === 0) {
    throw new Error("TCGPLAYER_SESSION_COOKIE not set");
  }
  return cookie;
}

function resolveSellerKey(sellerKeyOverride?: string): string {
  const fromArg = sellerKeyOverride?.trim().toLowerCase();
  if (fromArg) return fromArg;

  const fromEnv = process.env.TCGPLAYER_SELLER_KEY?.trim().toLowerCase();
  if (fromEnv) return fromEnv;

  throw new Error("TCGPLAYER_SELLER_KEY not set and sellerKey was not provided");
}

function normalizeStatuses(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const normalized = values
    .map((value) => normalizeOrderStatusFilter(value))
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFulfillments(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const normalized = values
    .map((value) => normalizeFulfillmentFilter(value))
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function buildSearchRequestModel(args: {
  sellerKey: string;
  searchRange?: string;
  orderStatuses?: string[];
  fulfillmentTypes?: string[];
  sortBy?: Array<{ sortingType: string; direction: "ascending" | "descending" }>;
  from?: number;
  size?: number;
  defaultSize: number;
}): SearchOrdersRequestModel {
  const searchRange = args.searchRange?.trim() || DEFAULT_SEARCH_RANGE;
  const orderStatuses = normalizeStatuses(args.orderStatuses);
  const fulfillmentTypes = normalizeFulfillments(args.fulfillmentTypes);
  const from = Math.max(0, args.from ?? 0);
  const size = Math.max(1, args.size ?? args.defaultSize);

  const filters: SearchOrdersRequestModel["filters"] = {
    sellerKey: args.sellerKey,
  };

  if (orderStatuses && orderStatuses.length > 0) {
    filters.orderStatuses = orderStatuses;
  }

  if (fulfillmentTypes && fulfillmentTypes.length > 0) {
    filters.fulfillmentTypes = fulfillmentTypes;
  }

  return {
    searchRange,
    filters,
    sortBy: args.sortBy && args.sortBy.length > 0 ? args.sortBy : DEFAULT_SORT_BY,
    from,
    size,
  };
}

function parseFileName(
  contentDisposition: string | null,
  fallbackFileName: string,
): string {
  if (!contentDisposition) return fallbackFileName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return fallbackFileName;
}

function toExportResponse(args: {
  document: ExportedDocument;
  fallbackFileName: string;
  fallbackMimeType: string;
}) {
  const mimeTypeRaw = args.document.contentType ?? args.fallbackMimeType;
  const mimeType = mimeTypeRaw.split(";")[0]?.trim() || args.fallbackMimeType;

  return {
    contentBase64: args.document.contentBase64,
    mimeType,
    fileName: parseFileName(args.document.contentDisposition, args.fallbackFileName),
  };
}

async function refreshOrderDetails(args: {
  ctx: SyncCtx;
  sessionCookie: string;
  ownerUserId?: string;
  sellerKey: string;
  orderNumbers: string[];
  syncedAt: string;
}): Promise<number> {
  let detailsRefreshed = 0;

  for (const orderNumber of args.orderNumbers) {
    try {
      const detail = await getOrderDetail({
        sessionCookie: args.sessionCookie,
        orderNumber,
      });
      const canonicalDetail = mapOrderDetail(detail, args.sellerKey);
      if (!canonicalDetail) continue;

      await args.ctx.runMutation(internal.tcgplayer.mutations.upsertOrderDetail, {
        ownerUserId: args.ownerUserId,
        detail: canonicalDetail,
        syncedAt: args.syncedAt,
      });

      detailsRefreshed += 1;
    } catch (error) {
      if (isRetriableTcgplayerError(error)) {
        console.warn(`TCGPlayer detail refresh skipped for ${orderNumber}`, error);
        continue;
      }
      throw error;
    }
  }

  return detailsRefreshed;
}

async function runFullSync(args: {
  ctx: SyncCtx;
  sessionCookie: string;
  sellerKey: string;
  ownerUserId?: string;
  pageSize: number;
  maxPages: number;
}): Promise<{
  source: "live" | "stale";
  pagesProcessed: number;
  ordersUpserted: number;
  detailsRefreshed: number;
  pendingPaymentsSynced: number;
}> {
  const pageSize = Math.max(1, args.pageSize);
  const maxPages = Math.max(1, args.maxPages);

  let pagesProcessed = 0;
  let ordersUpserted = 0;
  let detailsRefreshed = 0;
  let pendingPaymentsSynced = 0;
  let source: "live" | "stale" = "live";

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const searchRequest = buildSearchRequestModel({
      sellerKey: args.sellerKey,
      searchRange: DEFAULT_SEARCH_RANGE,
      from,
      size: pageSize,
      defaultSize: pageSize,
    });

    const response = await searchOrders({
      sessionCookie: args.sessionCookie,
      request: searchRequest,
    });

    pagesProcessed += 1;

    const summaries = response.orders
      .map((order) => mapSearchOrderSummary(order, args.sellerKey))
      .filter((summary): summary is NonNullable<typeof summary> => !!summary);

    const syncedAt = new Date().toISOString();
    const upsert = (await args.ctx.runMutation(
      internal.tcgplayer.mutations.upsertOrderSummaries,
      {
        ownerUserId: args.ownerUserId,
        sellerKey: args.sellerKey,
        summaries,
        syncedAt,
      },
    )) as {
      upserted: number;
      changedOrderNumbers: string[];
    };

    ordersUpserted += upsert.upserted;
    detailsRefreshed += await refreshOrderDetails({
      ctx: args.ctx,
      sessionCookie: args.sessionCookie,
      ownerUserId: args.ownerUserId,
      sellerKey: args.sellerKey,
      orderNumbers: upsert.changedOrderNumbers,
      syncedAt,
    });

    if (
      response.orders.length < pageSize ||
      from + response.orders.length >= response.totalOrders
    ) {
      break;
    }
  }

  try {
    const html = await loadPendingPaymentsHtml({
      sessionCookie: args.sessionCookie,
      cacheBuster: Math.random(),
    });

    const parsed = parsePendingPaymentsHtml(html, args.sellerKey);

    await args.ctx.runMutation(
      internal.tcgplayer.mutations.upsertPendingPaymentsSnapshot,
      {
        ownerUserId: args.ownerUserId,
        sellerKey: parsed.sellerKey ?? args.sellerKey,
        totalPendingAmountCents: parsed.totalPendingAmountCents,
        channels: parsed.channels,
        rawHtml: parsed.rawHtml,
        syncedAt: new Date().toISOString(),
      },
    );

    pendingPaymentsSynced = 1;
  } catch (error) {
    if (!isRetriableTcgplayerError(error)) {
      throw error;
    }

    const snapshot = (await args.ctx.runQuery(
      internal.tcgplayer.queries.getLatestPendingPaymentsSnapshot,
      {
        sellerKey: args.sellerKey,
        ownerUserId: args.ownerUserId,
      },
    )) as { _id: string } | null;

    if (!snapshot) {
      throw error;
    }

    source = "stale";
  }

  return {
    source,
    pagesProcessed,
    ordersUpserted,
    detailsRefreshed,
    pendingPaymentsSynced,
  };
}

export const searchOrdersAction = action({
  args: {
    sellerKey: v.optional(v.string()),
    searchRange: v.optional(v.string()),
    orderStatuses: v.optional(v.array(v.string())),
    fulfillmentTypes: v.optional(v.array(v.string())),
    sortBy: v.optional(v.array(sortByValidator)),
    from: v.optional(v.number()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchOrdersActionResult> => {
    const ownerUserId = await requireAdminUserId(ctx);
    const sellerKey = resolveSellerKey(args.sellerKey);
    const sessionCookie = getSessionCookieOrThrow();

    const request = buildSearchRequestModel({
      sellerKey,
      searchRange: args.searchRange,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      sortBy: args.sortBy,
      from: args.from,
      size: args.size,
      defaultSize: 25,
    });

    try {
      const response = await searchOrders({
        sessionCookie,
        request,
      });

      const summaries = response.orders
        .map((order) => mapSearchOrderSummary(order, sellerKey))
        .filter((summary): summary is NonNullable<typeof summary> => !!summary);

      const syncedAt = new Date().toISOString();
      const upsert = (await ctx.runMutation(
        internal.tcgplayer.mutations.upsertOrderSummaries,
        {
          ownerUserId,
          sellerKey,
          summaries,
          syncedAt,
        },
      )) as {
        upserted: number;
        changedOrderNumbers: string[];
        newOrderNumbers: string[];
      };

      const detailsRefreshed = await refreshOrderDetails({
        ctx,
        sessionCookie,
        ownerUserId,
        sellerKey,
        orderNumbers: upsert.changedOrderNumbers,
        syncedAt,
      });

      return {
        source: "live" as const,
        sellerKey,
        totalOrders: response.totalOrders,
        orders: response.orders,
        ordersUpserted: upsert.upserted,
        changedOrderNumbers: upsert.changedOrderNumbers,
        newOrderNumbers: upsert.newOrderNumbers,
        detailsRefreshed,
      };
    } catch (error) {
      if (!isRetriableTcgplayerError(error)) {
        throw error;
      }

      const stale = (await ctx.runQuery(
        internal.tcgplayer.queries.searchOrderSnapshots,
        {
          ownerUserId,
          sellerKey,
          from: request.from,
          size: request.size,
          orderStatuses: request.filters.orderStatuses,
          fulfillmentTypes: request.filters.fulfillmentTypes,
        },
      )) as {
        totalOrders: number;
        orders: unknown[];
      };

      return {
        source: "stale" as const,
        sellerKey,
        totalOrders: stale.totalOrders,
        orders: stale.orders,
        ordersUpserted: 0,
        changedOrderNumbers: [],
        newOrderNumbers: [],
        detailsRefreshed: 0,
      };
    }
  },
});

export const getOrderDetailAction = action({
  args: {
    orderNumber: v.string(),
    sellerKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GetOrderDetailActionResult> => {
    const ownerUserId = await requireAdminUserId(ctx);
    const sellerKey = resolveSellerKey(args.sellerKey);
    const sessionCookie = getSessionCookieOrThrow();

    try {
      const detail = await getOrderDetail({
        sessionCookie,
        orderNumber: args.orderNumber,
      });

      const canonicalDetail = mapOrderDetail(detail, sellerKey);
      if (!canonicalDetail) {
        throw new Error("TCGPlayer order detail response missing orderNumber");
      }

      await ctx.runMutation(internal.tcgplayer.mutations.upsertOrderDetail, {
        ownerUserId,
        detail: canonicalDetail,
        syncedAt: new Date().toISOString(),
      });

      return {
        source: "live" as const,
        order: detail,
      };
    } catch (error) {
      if (!isRetriableTcgplayerError(error)) {
        throw error;
      }

      const stale = (await ctx.runQuery(
        internal.tcgplayer.queries.getOrderByTcgplayerOrderNumber,
        {
          orderNumber: args.orderNumber,
          ownerUserId,
        },
      )) as Doc<"orders"> | null;

      if (!stale) {
        throw error;
      }

      return {
        source: "stale" as const,
        order: stale,
      };
    }
  },
});

export const exportOrdersAction = action({
  args: {
    sellerKey: v.optional(v.string()),
    searchRange: v.optional(v.string()),
    orderStatuses: v.optional(v.array(v.string())),
    fulfillmentTypes: v.optional(v.array(v.string())),
    sortBy: v.optional(v.array(sortByValidator)),
    from: v.optional(v.number()),
    size: v.optional(v.number()),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);

    const sellerKey = resolveSellerKey(args.sellerKey);
    const sessionCookie = getSessionCookieOrThrow();
    const searchRequestModel = buildSearchRequestModel({
      sellerKey,
      searchRange: args.searchRange,
      orderStatuses: args.orderStatuses,
      fulfillmentTypes: args.fulfillmentTypes,
      sortBy: args.sortBy,
      from: args.from,
      size: args.size,
      defaultSize: 1000,
    });

    const document = await exportOrdersCsv({
      sessionCookie,
      request: {
        searchOrdersRequestModel: searchRequestModel,
        timezoneOffset: args.timezoneOffset,
      },
    });

    return toExportResponse({
      document,
      fallbackFileName: "tcgplayer-orders-export.csv",
      fallbackMimeType: "text/csv",
    });
  },
});

export const exportPullSheetsAction = action({
  args: {
    orderNumbers: v.array(v.string()),
    timezoneOffset: v.number(),
    sortingType: v.optional(v.string()),
    format: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);

    const sessionCookie = getSessionCookieOrThrow();

    const document = await exportPullSheets({
      sessionCookie,
      request: {
        orderNumbers: args.orderNumbers,
        timezoneOffset: args.timezoneOffset,
        sortingType: args.sortingType ?? "ByRelease",
        format: args.format ?? "Default",
      },
    });

    return toExportResponse({
      document,
      fallbackFileName: "tcgplayer-pull-sheets-export.dat",
      fallbackMimeType: "application/octet-stream",
    });
  },
});

export const exportPackingSlipsAction = action({
  args: {
    orderNumbers: v.array(v.string()),
    timezoneOffset: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);

    const sessionCookie = getSessionCookieOrThrow();

    const document = await exportPackingSlips({
      sessionCookie,
      request: {
        orderNumbers: args.orderNumbers,
        timezoneOffset: args.timezoneOffset,
      },
    });

    return toExportResponse({
      document,
      fallbackFileName: "tcgplayer-packing-slips-export.dat",
      fallbackMimeType: "application/octet-stream",
    });
  },
});

export const getPendingPaymentsAction = action({
  args: {
    sellerKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GetPendingPaymentsActionResult> => {
    const ownerUserId = await requireAdminUserId(ctx);
    const sellerKey = resolveSellerKey(args.sellerKey);
    const sessionCookie = getSessionCookieOrThrow();

    try {
      const html = await loadPendingPaymentsHtml({
        sessionCookie,
        cacheBuster: Math.random(),
      });

      const parsed = parsePendingPaymentsHtml(html, sellerKey);
      const resolvedSellerKey = parsed.sellerKey ?? sellerKey;
      const syncedAt = new Date().toISOString();

      await ctx.runMutation(internal.tcgplayer.mutations.upsertPendingPaymentsSnapshot, {
        ownerUserId,
        sellerKey: resolvedSellerKey,
        totalPendingAmountCents: parsed.totalPendingAmountCents,
        channels: parsed.channels,
        rawHtml: parsed.rawHtml,
        syncedAt,
      });

      return {
        source: "live" as const,
        sellerKey: resolvedSellerKey,
        totalPendingAmountCents: parsed.totalPendingAmountCents,
        channels: parsed.channels,
        rawHtml: parsed.rawHtml,
        syncedAt,
      };
    } catch (error) {
      if (!isRetriableTcgplayerError(error)) {
        throw error;
      }

      const stale = (await ctx.runQuery(
        internal.tcgplayer.queries.getLatestPendingPaymentsSnapshot,
        {
          sellerKey,
          ownerUserId,
        },
      )) as Doc<"tcgplayerPendingPayments"> | null;

      if (!stale) {
        throw error;
      }

      return {
        source: "stale" as const,
        sellerKey: stale.sellerKey,
        totalPendingAmountCents: stale.totalPendingAmountCents,
        channels: stale.channels,
        rawHtml: stale.rawHtml,
        syncedAt: stale.syncedAt,
      };
    }
  },
});

export const syncDataAction = action({
  args: {
    sellerKey: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAdminUserId(ctx);
    const sellerKey = resolveSellerKey(args.sellerKey);
    const sessionCookie = getSessionCookieOrThrow();

    const result = await runFullSync({
      ctx,
      sessionCookie,
      sellerKey,
      ownerUserId,
      pageSize: args.pageSize ?? 100,
      maxPages: args.maxPages ?? 100,
    });

    return {
      ...result,
      sellerKey,
    };
  },
});

export const reconcileData = internalAction({
  args: {
    sellerKey: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionCookie = process.env.TCGPLAYER_SESSION_COOKIE;
    const sellerKey = args.sellerKey?.trim().toLowerCase() ?? process.env.TCGPLAYER_SELLER_KEY?.trim().toLowerCase();

    if (!sessionCookie) {
      console.warn("TCGPlayer reconcile skipped: missing TCGPLAYER_SESSION_COOKIE");
      return {
        skipped: true as const,
        reason: "missing_session_cookie" as const,
      };
    }

    if (!sellerKey) {
      console.warn("TCGPlayer reconcile skipped: missing TCGPLAYER_SELLER_KEY");
      return {
        skipped: true as const,
        reason: "missing_seller_key" as const,
      };
    }

    const result = await runFullSync({
      ctx,
      sessionCookie,
      sellerKey,
      pageSize: args.pageSize ?? 100,
      maxPages: args.maxPages ?? 100,
    });

    return {
      skipped: false as const,
      sellerKey,
      ...result,
    };
  },
});
