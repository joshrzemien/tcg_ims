import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  ManaPoolError,
  batchGetSellerInventoryByTcgsku,
  bulkUpsertSellerInventoryByProduct,
  bulkUpsertSellerInventoryByScryfallId,
  bulkUpsertSellerInventoryByTcgplayerId,
  bulkUpsertSellerInventoryByTcgsku,
  countBulkPriceMatches,
  countSellerInventoryAnomalies,
  createBulkPriceJob,
  deleteSellerInventoryByProduct,
  deleteSellerInventoryByScryfallId,
  deleteSellerInventoryByTcgplayerId,
  deleteSellerInventoryByTcgsku,
  deleteWebhook,
  exportBulkPriceJobCsv,
  getBulkPriceJob,
  getInventoryListingById,
  getInventoryListingsByIds,
  getRecentBulkPriceJob,
  getSealedPrices,
  getSellerInventoryByProduct,
  getSellerInventoryByScryfallId,
  getSellerInventoryByTcgplayerId,
  getSellerInventoryByTcgsku,
  getSellerOrder,
  getSellerOrderReports,
  getSinglesPrices,
  getVariantPrices,
  getWebhook,
  listBulkPriceJobs,
  listSellerInventory,
  listSellerInventoryAnomalies,
  listSellerOrders,
  listWebhooks,
  lookupSealed,
  lookupSingles,
  parseWebhookSignatureHeader,
  previewBulkPrice,
  registerWebhook,
  updateSellerInventoryByProduct,
  updateSellerInventoryByScryfallId,
  updateSellerInventoryByTcgplayerId,
  updateSellerInventoryByTcgsku,
  upsertSellerOrderFulfillment,
  verifyWebhookSignature,
  type SellerInventoryScryfallLookup,
  type SellerInventoryTcgplayerLookup,
} from "../integrations/manapool";
import { getOptionalRecord, toOptionalString } from "../lib/normalize";
import { camelizeKeysDeep } from "./types";
import {
  getManaPoolCredentialsOrNull,
  getManaPoolCredentialsOrThrow,
  requireAdminUserId,
} from "./auth";

const WEBHOOK_REPLAY_WINDOW_SECONDS = 5 * 60;
const RECONCILE_PAGE_SIZE = 100;
const RECONCILE_MAX_PAGES = 100;

type CacheCtx = ActionCtx;
type UnknownRecord = Record<string, unknown>;

type WebhookProcessResult =
  | {
      processed: true;
      deduped: boolean;
      ignored?: boolean;
      reason?: string;
    }
  | {
      processed: false;
      reason: string;
      retryable: boolean;
    };

function ensureOneLookupKey(args: {
  scryfallIds?: string[];
  tcgplayerIds?: number[];
  tcgplayerSkuIds?: number[];
  mtgjsonUuids?: string[];
  productIds?: string[];
}) {
  const keys = [
    ["scryfallIds", args.scryfallIds],
    ["tcgplayerIds", args.tcgplayerIds],
    ["tcgplayerSkuIds", args.tcgplayerSkuIds],
    ["mtgjsonUuids", args.mtgjsonUuids],
    ["productIds", args.productIds],
  ].filter(([, value]) => Array.isArray(value) && value.length > 0);

  if (keys.length !== 1) {
    throw new Error("Exactly one lookup ID type must be provided per request");
  }

  const count = (keys[0]?.[1] as unknown[] | undefined)?.length ?? 0;
  if (count > 100) {
    throw new Error("Lookup request max is 100 IDs");
  }
}

function getInventoryItemsFromResponse(payload: unknown): unknown[] {
  const record = getOptionalRecord(payload);
  if (!record) return [];

  const inventory = record.inventory;
  if (Array.isArray(inventory)) return inventory;
  if (getOptionalRecord(inventory)) return [inventory];

  const nestedInventory = getOptionalRecord(record.data)?.inventory;
  if (Array.isArray(nestedInventory)) return nestedInventory;
  if (getOptionalRecord(nestedInventory)) return [nestedInventory];

  return [];
}

async function upsertInventoryFromResponse(
  ctx: CacheCtx,
  ownerUserId: string,
  payload: unknown,
) {
  const inventoryItems = getInventoryItemsFromResponse(payload);
  if (inventoryItems.length === 0) return;

  await ctx.runMutation(internal.manapool.mutations.upsertInventorySnapshots, {
    ownerUserId,
    inventoryItems,
    syncedAt: new Date().toISOString(),
  });
}

function getJobsFromListResponse(payload: unknown): unknown[] {
  const record = getOptionalRecord(payload);
  if (!record) return [];

  const jobs = record.jobs;
  if (Array.isArray(jobs)) return jobs;

  const nestedJobs = getOptionalRecord(record.data)?.jobs;
  return Array.isArray(nestedJobs) ? nestedJobs : [];
}

function getJobAndProgress(
  payload: unknown,
): { job: unknown | null; progress: unknown[] | undefined } {
  const record = getOptionalRecord(payload);
  if (!record) return { job: null, progress: undefined };

  const job = record.job ?? null;
  const progress = Array.isArray(record.progress) ? record.progress : undefined;

  return { job, progress };
}

async function upsertJobFromPayload(
  ctx: CacheCtx,
  ownerUserId: string,
  payload: unknown,
) {
  const { job, progress } = getJobAndProgress(payload);
  if (!job) return;

  await ctx.runMutation(internal.manapool.mutations.upsertBulkPriceJob, {
    ownerUserId,
    job,
    progress,
    syncedAt: new Date().toISOString(),
  });
}

function extractOrder(payload: unknown): unknown | null {
  return findOrderInPayload(payload);
}

function looksLikeOrder(record: UnknownRecord): boolean {
  if (!toOptionalString(record.id)) return false;

  return (
    typeof record.status === "string" ||
    typeof record.latestFulfillmentStatus === "string" ||
    Array.isArray(record.items) ||
    Array.isArray(record.fulfillments)
  );
}

function findOrderInPayload(value: unknown, depth = 0): UnknownRecord | null {
  if (depth > 4) return null;

  const record = getOptionalRecord(value);
  if (!record) return null;

  if (looksLikeOrder(record)) {
    return record;
  }

  const directOrder = getOptionalRecord(record.order);
  if (directOrder) {
    return directOrder;
  }

  const dataOrder = getOptionalRecord(getOptionalRecord(record.data)?.order);
  if (dataOrder) {
    return dataOrder;
  }

  for (const nestedValue of Object.values(record)) {
    if (Array.isArray(nestedValue)) continue;
    const found = findOrderInPayload(nestedValue, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractOrders(payload: unknown): unknown[] {
  const record = getOptionalRecord(payload);
  if (!record) return [];

  const orders = record.orders;
  if (Array.isArray(orders)) return orders;

  const nestedOrders = getOptionalRecord(record.data)?.orders;
  return Array.isArray(nestedOrders) ? nestedOrders : [];
}

function extractReports(payload: unknown): unknown[] {
  const record = getOptionalRecord(payload);
  if (!record) return [];

  if (Array.isArray(record.reports)) return record.reports;
  const nestedReports = getOptionalRecord(record.data)?.reports;
  return Array.isArray(nestedReports) ? nestedReports : [];
}

async function upsertOrderPayload(
  ctx: CacheCtx,
  ownerUserId: string,
  payload: unknown,
) {
  const order = extractOrder(payload);
  if (!order) return;

  await ctx.runMutation(internal.manapool.mutations.upsertOrderFromManaPool, {
    ownerUserId,
    order,
    syncedAt: new Date().toISOString(),
  });
}

async function requireAdminAndCredentials(ctx: {
  auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> };
}): Promise<{ ownerUserId: string; credentials: ReturnType<typeof getManaPoolCredentialsOrThrow> }> {
  const ownerUserId = await requireAdminUserId(ctx);
  const credentials = getManaPoolCredentialsOrThrow();
  return { ownerUserId, credentials };
}

const inventoryLookupValidator = v.union(
  v.object({ type: v.literal("tcgsku"), sku: v.number() }),
  v.object({
    type: v.literal("product"),
    productType: v.string(),
    productId: v.string(),
  }),
  v.object({
    type: v.literal("scryfall"),
    scryfallId: v.string(),
    languageId: v.optional(v.string()),
    finishId: v.optional(v.string()),
    conditionId: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("tcgplayer"),
    tcgplayerId: v.number(),
    languageId: v.optional(v.string()),
    finishId: v.optional(v.string()),
    conditionId: v.optional(v.string()),
  }),
);

export const getSinglesPricesAction = action({
  args: {
    format: v.optional(v.union(v.literal("json"), v.literal("csv"))),
  },
  handler: async (_ctx, args) => {
    return await getSinglesPrices(args.format ?? "json");
  },
});

export const getSealedPricesAction = action({
  args: {
    format: v.optional(v.union(v.literal("json"), v.literal("csv"))),
  },
  handler: async (_ctx, args) => {
    return await getSealedPrices(args.format ?? "json");
  },
});

export const getVariantPricesAction = action({
  args: {
    format: v.optional(v.union(v.literal("json"), v.literal("csv"))),
  },
  handler: async (_ctx, args) => {
    return await getVariantPrices(args.format ?? "json");
  },
});

export const lookupSinglesAction = action({
  args: {
    scryfallIds: v.optional(v.array(v.string())),
    tcgplayerIds: v.optional(v.array(v.number())),
    tcgplayerSkuIds: v.optional(v.array(v.number())),
    mtgjsonUuids: v.optional(v.array(v.string())),
    productIds: v.optional(v.array(v.string())),
    languages: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    ensureOneLookupKey(args);
    return await lookupSingles(args);
  },
});

export const lookupSealedAction = action({
  args: {
    tcgplayerIds: v.optional(v.array(v.number())),
    mtgjsonUuids: v.optional(v.array(v.string())),
    productIds: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    ensureOneLookupKey(args);
    return await lookupSealed(args);
  },
});

export const getListingsByIdsAction = action({
  args: {
    ids: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    if (args.ids.length === 0) {
      throw new Error("ids cannot be empty");
    }
    return await getInventoryListingsByIds(args.ids);
  },
});

export const getListingByIdAction = action({
  args: {
    id: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getInventoryListingById(args.id);
  },
});

export const listSellerInventoryAction = action({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await listSellerInventory(credentials, args);

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const batchUpsertByTcgskuAction = action({
  args: {
    items: v.array(
      v.object({
        tcgplayerSku: v.number(),
        priceCents: v.number(),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    if (args.items.length === 0 || args.items.length > 2000) {
      throw new Error("items must be between 1 and 2000");
    }

    const response = await bulkUpsertSellerInventoryByTcgsku(
      credentials,
      args.items.map((item) => ({
        tcgplayer_sku: item.tcgplayerSku,
        price_cents: item.priceCents,
        quantity: item.quantity,
      })),
    );

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const batchUpsertByProductAction = action({
  args: {
    items: v.array(
      v.object({
        productType: v.string(),
        productId: v.string(),
        priceCents: v.number(),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    if (args.items.length === 0 || args.items.length > 2000) {
      throw new Error("items must be between 1 and 2000");
    }

    const response = await bulkUpsertSellerInventoryByProduct(
      credentials,
      args.items.map((item) => ({
        product_type: item.productType,
        product_id: item.productId,
        price_cents: item.priceCents,
        quantity: item.quantity,
      })),
    );

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const batchUpsertByScryfallIdAction = action({
  args: {
    items: v.array(
      v.object({
        scryfallId: v.string(),
        languageId: v.string(),
        finishId: v.string(),
        conditionId: v.string(),
        priceCents: v.number(),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    if (args.items.length === 0 || args.items.length > 2000) {
      throw new Error("items must be between 1 and 2000");
    }

    const response = await bulkUpsertSellerInventoryByScryfallId(
      credentials,
      args.items.map((item) => ({
        scryfall_id: item.scryfallId,
        language_id: item.languageId,
        finish_id: item.finishId,
        condition_id: item.conditionId,
        price_cents: item.priceCents,
        quantity: item.quantity,
      })),
    );

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const batchUpsertByTcgplayerIdAction = action({
  args: {
    items: v.array(
      v.object({
        tcgplayerId: v.number(),
        languageId: v.string(),
        finishId: v.optional(v.union(v.string(), v.null())),
        conditionId: v.optional(v.union(v.string(), v.null())),
        priceCents: v.number(),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    if (args.items.length === 0 || args.items.length > 2000) {
      throw new Error("items must be between 1 and 2000");
    }

    const response = await bulkUpsertSellerInventoryByTcgplayerId(
      credentials,
      args.items.map((item) => ({
        tcgplayer_id: item.tcgplayerId,
        language_id: item.languageId,
        finish_id: item.finishId ?? null,
        condition_id: item.conditionId ?? null,
        price_cents: item.priceCents,
        quantity: item.quantity,
      })),
    );

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const getSellerInventoryItemAction = action({
  args: {
    lookup: inventoryLookupValidator,
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    let response: unknown;
    switch (args.lookup.type) {
      case "tcgsku":
        response = await getSellerInventoryByTcgsku(credentials, args.lookup.sku);
        break;
      case "product":
        response = await getSellerInventoryByProduct(
          credentials,
          args.lookup.productType,
          args.lookup.productId,
        );
        break;
      case "scryfall": {
        const lookup: SellerInventoryScryfallLookup = {
          scryfallId: args.lookup.scryfallId,
          languageId: args.lookup.languageId,
          finishId: args.lookup.finishId,
          conditionId: args.lookup.conditionId,
        };
        response = await getSellerInventoryByScryfallId(credentials, lookup);
        break;
      }
      case "tcgplayer": {
        const lookup: SellerInventoryTcgplayerLookup = {
          tcgplayerId: args.lookup.tcgplayerId,
          languageId: args.lookup.languageId,
          finishId: args.lookup.finishId,
          conditionId: args.lookup.conditionId,
        };
        response = await getSellerInventoryByTcgplayerId(credentials, lookup);
        break;
      }
    }

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const upsertSellerInventoryItemAction = action({
  args: {
    lookup: inventoryLookupValidator,
    priceCents: v.number(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    const setBody = {
      priceCents: args.priceCents,
      quantity: args.quantity,
    };

    let response: unknown;

    switch (args.lookup.type) {
      case "tcgsku":
        response = await updateSellerInventoryByTcgsku(
          credentials,
          args.lookup.sku,
          setBody,
        );
        break;
      case "product":
        response = await updateSellerInventoryByProduct(
          credentials,
          args.lookup.productType,
          args.lookup.productId,
          setBody,
        );
        break;
      case "scryfall":
        response = await updateSellerInventoryByScryfallId(
          credentials,
          {
            scryfallId: args.lookup.scryfallId,
            languageId: args.lookup.languageId,
            finishId: args.lookup.finishId,
            conditionId: args.lookup.conditionId,
          },
          setBody,
        );
        break;
      case "tcgplayer":
        response = await updateSellerInventoryByTcgplayerId(
          credentials,
          {
            tcgplayerId: args.lookup.tcgplayerId,
            languageId: args.lookup.languageId,
            finishId: args.lookup.finishId,
            conditionId: args.lookup.conditionId,
          },
          setBody,
        );
        break;
    }

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const deleteSellerInventoryItemAction = action({
  args: {
    lookup: inventoryLookupValidator,
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);

    let response: unknown;
    switch (args.lookup.type) {
      case "tcgsku":
        response = await deleteSellerInventoryByTcgsku(credentials, args.lookup.sku);
        break;
      case "product":
        response = await deleteSellerInventoryByProduct(
          credentials,
          args.lookup.productType,
          args.lookup.productId,
        );
        break;
      case "scryfall":
        response = await deleteSellerInventoryByScryfallId(credentials, {
          scryfallId: args.lookup.scryfallId,
          languageId: args.lookup.languageId,
          finishId: args.lookup.finishId,
          conditionId: args.lookup.conditionId,
        });
        break;
      case "tcgplayer":
        response = await deleteSellerInventoryByTcgplayerId(credentials, {
          tcgplayerId: args.lookup.tcgplayerId,
          languageId: args.lookup.languageId,
          finishId: args.lookup.finishId,
          conditionId: args.lookup.conditionId,
        });
        break;
    }

    const inventoryItems = getInventoryItemsFromResponse(response);
    for (const item of inventoryItems) {
      const record = getOptionalRecord(item);
      const id = toOptionalString(record?.id);
      if (!id) continue;
      await ctx.runMutation(internal.manapool.mutations.removeInventorySnapshotByManaPoolId, {
        manapoolInventoryId: id,
      });
    }

    return response;
  },
});

export const batchGetTcgskuInventoryAction = action({
  args: {
    skus: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    if (args.skus.length === 0 || args.skus.length > 500) {
      throw new Error("skus must be between 1 and 500");
    }

    const response = await batchGetSellerInventoryByTcgsku(credentials, args.skus);

    await upsertInventoryFromResponse(ctx, ownerUserId, response);
    return response;
  },
});

export const listInventoryAnomaliesAction = action({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    return await listSellerInventoryAnomalies(credentials, args);
  },
});

export const countInventoryAnomaliesAction = action({
  args: {},
  handler: async (ctx) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    return await countSellerInventoryAnomalies(credentials);
  },
});

export const createBulkPricingJobAction = action({
  args: {
    filters: v.any(),
    pricing: v.any(),
    isPreview: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    const response = await createBulkPriceJob(credentials, {
      filters: args.filters,
      pricing: args.pricing,
      isPreview: args.isPreview,
    });

    const record = getOptionalRecord(response);
    const jobId = toOptionalString(record?.jobId);
    if (jobId) {
      await ctx.runMutation(internal.manapool.mutations.upsertBulkPriceJob, {
        ownerUserId,
        job: {
          id: jobId,
          status: "pending",
          isPreview: args.isPreview ?? false,
        },
        syncedAt: new Date().toISOString(),
      });
    }

    return response;
  },
});

export const countBulkPricingAction = action({
  args: {
    filters: v.any(),
    pricing: v.any(),
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    return await countBulkPriceMatches(credentials, {
      filters: args.filters,
      pricing: args.pricing,
    });
  },
});

export const previewBulkPricingAction = action({
  args: {
    filters: v.any(),
    pricing: v.any(),
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    return await previewBulkPrice(credentials, {
      filters: args.filters,
      pricing: args.pricing,
    });
  },
});

export const listBulkPricingJobsAction = action({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await listBulkPriceJobs(credentials, args);

    await ctx.runMutation(internal.manapool.mutations.upsertBulkPriceJobs, {
      ownerUserId,
      jobs: getJobsFromListResponse(response),
      syncedAt: new Date().toISOString(),
    });

    return response;
  },
});

export const getBulkPricingJobAction = action({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await getBulkPriceJob(credentials, args.jobId);

    await upsertJobFromPayload(ctx, ownerUserId, response);
    return response;
  },
});

export const getRecentBulkPricingJobAction = action({
  args: {},
  handler: async (ctx) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await getRecentBulkPriceJob(credentials);

    const recent = getOptionalRecord(response);
    const jobId = toOptionalString(recent?.jobId);
    if (jobId) {
      try {
        const details = await getBulkPriceJob(credentials, jobId);
        await upsertJobFromPayload(ctx, ownerUserId, details);
      } catch (err) {
        if (!(err instanceof ManaPoolError)) {
          console.error("Unexpected recent job detail fetch error", err);
        }
      }
    }

    return response;
  },
});

export const exportBulkPricingJobCsvAction = action({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    return await exportBulkPriceJobCsv(credentials, args.jobId);
  },
});

export const listSellerOrdersAction = action({
  args: {
    since: v.optional(v.string()),
    isUnfulfilled: v.optional(v.union(v.literal("true"), v.literal("false"))),
    isFulfilled: v.optional(v.union(v.literal("true"), v.literal("false"))),
    hasFulfillments: v.optional(v.union(v.literal("true"), v.literal("false"))),
    label: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await listSellerOrders(credentials, args);

    const orders = extractOrders(response);
    if (orders.length > 0) {
      await ctx.runMutation(internal.manapool.mutations.upsertOrdersFromManaPool, {
        ownerUserId,
        orders,
        syncedAt: new Date().toISOString(),
      });
    }

    return response;
  },
});

export const getSellerOrderAction = action({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await getSellerOrder(credentials, args.orderId);

    await upsertOrderPayload(ctx, ownerUserId, response);
    return response;
  },
});

export const upsertSellerOrderFulfillmentAction = action({
  args: {
    orderId: v.string(),
    status: v.union(
      v.literal("error"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("refunded"),
      v.literal("replaced"),
    ),
    trackingCompany: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    inTransitAt: v.optional(v.string()),
    estimatedDeliveryAt: v.optional(v.string()),
    deliveredAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    const response = await upsertSellerOrderFulfillment(credentials, args.orderId, {
      status: args.status,
      trackingCompany: args.trackingCompany,
      trackingNumber: args.trackingNumber,
      trackingUrl: args.trackingUrl,
      inTransitAt: args.inTransitAt,
      estimatedDeliveryAt: args.estimatedDeliveryAt,
      deliveredAt: args.deliveredAt,
    });

    try {
      const refreshed = await getSellerOrder(credentials, args.orderId);
      await upsertOrderPayload(ctx, ownerUserId, refreshed);
    } catch (err) {
      console.error("Failed to refresh order after fulfillment update", err);
    }

    return response;
  },
});

export const getSellerOrderReportsAction = action({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await getSellerOrderReports(credentials, args.orderId);

    const reports = extractReports(response);
    if (reports.length > 0) {
      await ctx.runMutation(internal.manapool.mutations.upsertOrderReports, {
        ownerUserId,
        manapoolOrderId: args.orderId,
        reports,
        syncedAt: new Date().toISOString(),
      });
    }

    return response;
  },
});

export const listWebhooksAction = action({
  args: {
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await listWebhooks(credentials, args.topic);

    const record = getOptionalRecord(response);
    const webhooks = Array.isArray(record?.webhooks) ? record.webhooks : [];
    for (const webhook of webhooks) {
      await ctx.runMutation(internal.manapool.mutations.upsertWebhook, {
        ownerUserId,
        webhook,
        syncedAt: new Date().toISOString(),
      });
    }

    return response;
  },
});

export const getWebhookAction = action({
  args: {
    webhookId: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);
    const response = await getWebhook(credentials, args.webhookId);

    await ctx.runMutation(internal.manapool.mutations.upsertWebhook, {
      ownerUserId,
      webhook: response,
      syncedAt: new Date().toISOString(),
    });

    return response;
  },
});

export const registerWebhookAction = action({
  args: {
    topic: v.literal("order_created"),
    callbackUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { ownerUserId, credentials } = await requireAdminAndCredentials(ctx);

    const response = await registerWebhook(credentials, {
      topic: args.topic,
      callbackUrl: args.callbackUrl,
    });

    const record = getOptionalRecord(response);
    await ctx.runMutation(internal.manapool.mutations.upsertWebhook, {
      ownerUserId,
      webhook: response,
      secret: toOptionalString(record?.secret),
      syncedAt: new Date().toISOString(),
    });

    return response;
  },
});

export const deleteWebhookAction = action({
  args: {
    webhookId: v.string(),
  },
  handler: async (ctx, args) => {
    const { credentials } = await requireAdminAndCredentials(ctx);
    await deleteWebhook(credentials, args.webhookId);

    await ctx.runMutation(internal.manapool.mutations.deleteWebhookByManaPoolId, {
      manapoolWebhookId: args.webhookId,
    });

    return { deleted: true as const };
  },
});

export const processOrderCreatedWebhook = internalAction({
  args: {
    rawBody: v.string(),
    event: v.string(),
    timestamp: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args): Promise<WebhookProcessResult> => {
    if (args.event !== "order_created") {
      return {
        processed: false,
        reason: "unsupported_event",
        retryable: false,
      };
    }

    try {
      const timestamp = Number.parseInt(args.timestamp, 10);
      if (!Number.isFinite(timestamp)) {
        return { processed: false, reason: "invalid_timestamp", retryable: false };
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestamp) > WEBHOOK_REPLAY_WINDOW_SECONDS) {
        return { processed: false, reason: "stale_timestamp", retryable: false };
      }

      const webhooks = await ctx.runQuery(internal.manapool.queries.listWebhooksByTopic, {
        topic: "order_created",
      });

      const secrets = webhooks
        .map((webhook: { secret?: unknown; ownerUserId?: unknown }) => ({
          secret: toOptionalString(webhook.secret),
          ownerUserId: toOptionalString(webhook.ownerUserId),
        }))
        .filter(
          (
            value: {
              secret: string | undefined;
              ownerUserId: string | undefined;
            },
          ): value is { secret: string; ownerUserId: string | undefined } =>
            !!value.secret,
        );

      if (secrets.length === 0) {
        console.error("ManaPool webhook secret missing for order_created topic");
        return { processed: false, reason: "missing_secret", retryable: true };
      }

      let valid = false;
      let matchedOwnerUserId: string | undefined;
      for (const candidate of secrets) {
        const secretValid = await verifyWebhookSignature({
          secret: candidate.secret,
          timestampHeader: args.timestamp,
          signatureHeader: args.signature,
          rawBody: args.rawBody,
        });
        if (secretValid) {
          valid = true;
          matchedOwnerUserId = candidate.ownerUserId;
          break;
        }
      }

      if (!valid) {
        return { processed: false, reason: "invalid_signature", retryable: false };
      }

      const parsedSig = parseWebhookSignatureHeader(args.signature);
      const signatureKey =
        parsedSig.v1.length > 0
          ? [...parsedSig.v1].sort().join(".")
          : "missing";
      const dedupeId = `${args.event}:${timestamp}:${signatureKey}`;

      let parsed: unknown;
      try {
        parsed = camelizeKeysDeep(JSON.parse(args.rawBody));
      } catch {
        return { processed: false, reason: "invalid_json", retryable: false };
      }

      const payload = getOptionalRecord(parsed);
      const order = findOrderInPayload(payload);
      const orderId = toOptionalString(order?.id);

      if (!payload || !order || !orderId) {
        return { processed: false, reason: "missing_order", retryable: false };
      }

      // TODO(test): Verify webhook dedupe + retryability status mapping for all failure reasons.
      const dedupe = await ctx.runMutation(
        internal.manapool.mutations.insertWebhookDeliveryIfNew,
        {
          deliveryId: dedupeId,
          event: args.event,
          timestamp,
          signature: args.signature,
          manapoolOrderId: orderId,
          payload,
          processedAt: new Date().toISOString(),
        },
      );

      if (!dedupe.inserted) {
        return { processed: true, deduped: true };
      }

      await ctx.runMutation(internal.manapool.mutations.upsertOrderFromManaPool, {
        ownerUserId: matchedOwnerUserId,
        order,
        syncedAt: new Date().toISOString(),
      });

      return { processed: true, deduped: false };
    } catch (err) {
      console.error("ManaPool order_created webhook processing failed", err);
      return { processed: false, reason: "internal_error", retryable: true };
    }
  },
});

export const reconcileSellerData = internalAction({
  args: {},
  handler: async (ctx) => {
    const credentials = getManaPoolCredentialsOrNull();
    if (!credentials) {
      console.warn("ManaPool reconcile skipped: missing credentials");
      return { skipped: true as const, reason: "missing_credentials" };
    }

    const syncedAt = new Date().toISOString();

    let ordersUpserted = 0;
    let jobsUpserted = 0;
    let webhooksUpserted = 0;

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      for (let page = 0; page < RECONCILE_MAX_PAGES; page += 1) {
        const offset = page * RECONCILE_PAGE_SIZE;
        const ordersResponse = await listSellerOrders(credentials, {
          since,
          limit: RECONCILE_PAGE_SIZE,
          offset,
        });

        const orders = extractOrders(ordersResponse);
        if (orders.length === 0) break;

        const result = await ctx.runMutation(
          internal.manapool.mutations.upsertOrdersFromManaPool,
          {
            orders,
            syncedAt,
          },
        );
        ordersUpserted += result.upserted;

        if (orders.length < RECONCILE_PAGE_SIZE) break;
      }

      if (ordersUpserted === 0) {
        console.info("ManaPool reconcile orders: no orders found in sync window");
      }
    } catch (err) {
      console.error("ManaPool reconcile orders failed", err);
    }

    try {
      for (let page = 0; page < RECONCILE_MAX_PAGES; page += 1) {
        const offset = page * RECONCILE_PAGE_SIZE;
        const jobsResponse = await listBulkPriceJobs(credentials, {
          limit: RECONCILE_PAGE_SIZE,
          offset,
        });
        const jobs = getJobsFromListResponse(jobsResponse);
        if (jobs.length === 0) break;

        const result = await ctx.runMutation(
          internal.manapool.mutations.upsertBulkPriceJobs,
          {
            jobs,
            syncedAt,
          },
        );
        jobsUpserted += result.upserted;

        if (jobs.length < RECONCILE_PAGE_SIZE) break;
      }

      if (jobsUpserted === 0) {
        console.info("ManaPool reconcile jobs: no jobs found");
      }
    } catch (err) {
      console.error("ManaPool reconcile jobs failed", err);
    }

    try {
      const activeJobs = await ctx.runQuery(internal.manapool.queries.listActiveBulkPriceJobs, {});
      for (const active of activeJobs.slice(0, 20)) {
        const jobId = toOptionalString(active.manapoolJobId);
        if (!jobId) continue;

        try {
          const details = await getBulkPriceJob(credentials, jobId);
          const detail = getJobAndProgress(details);
          if (!detail.job) continue;

          await ctx.runMutation(internal.manapool.mutations.upsertBulkPriceJob, {
            job: detail.job,
            progress: detail.progress,
            syncedAt,
          });
        } catch (err) {
          console.error(`ManaPool reconcile failed for active job ${jobId}`, err);
        }
      }
    } catch (err) {
      console.error("ManaPool reconcile active job refresh failed", err);
    }

    try {
      const webhooksResponse = await listWebhooks(credentials, "order_created");
      const record = getOptionalRecord(webhooksResponse);
      const webhooks = Array.isArray(record?.webhooks) ? record.webhooks : [];

      for (const webhook of webhooks) {
        await ctx.runMutation(internal.manapool.mutations.upsertWebhook, {
          webhook,
          syncedAt,
        });
        webhooksUpserted += 1;
      }
    } catch (err) {
      console.error("ManaPool reconcile webhooks failed", err);
    }

    return {
      skipped: false as const,
      ordersUpserted,
      jobsUpserted,
      webhooksUpserted,
    };
  },
});
