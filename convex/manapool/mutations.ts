import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stripUndefined(fields: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      patch[key] = value;
    }
  }
  return patch;
}

function extractInventorySnapshotFields(item: unknown, syncedAt: string) {
  const record = isRecord(item) ? item : {};
  const id = toOptionalString(record.id);
  const product = isRecord(record.product) ? record.product : undefined;

  return {
    id,
    fields: {
      ownerUserId: toOptionalString(record.ownerUserId),
      manapoolInventoryId: id,
      productId:
        toOptionalString(record.productId) ?? toOptionalString(product?.id),
      productType:
        toOptionalString(record.productType) ?? toOptionalString(product?.type),
      tcgplayerSku:
        toOptionalNumber(record.tcgsku) ?? toOptionalNumber(record.tcgplayerSku),
      quantity: toOptionalNumber(record.quantity),
      priceCents: toOptionalNumber(record.priceCents),
      effectiveAsOf: toOptionalString(record.effectiveAsOf),
      pricingAnomaly: toOptionalBoolean(record.pricingAnomaly),
      payload: item,
      syncedAt,
    },
  };
}

function extractBulkJobFields(job: unknown, syncedAt: string) {
  const record = isRecord(job) ? job : {};
  const id = toOptionalString(record.id);

  return {
    id,
    fields: {
      ownerUserId: toOptionalString(record.ownerUserId),
      manapoolJobId: id,
      status: toOptionalString(record.status) ?? "unknown",
      isPreview: toOptionalBoolean(record.isPreview),
      downloadUrl: toOptionalString(record.downloadUrl),
      progressPercentage: toOptionalNumber(record.progressPercentage),
      payload: job,
      createdAt: toOptionalString(record.createdAt),
      updatedAt: toOptionalString(record.updatedAt),
      completedAt: toOptionalString(record.completedAt),
      syncedAt,
    },
  };
}

function extractWebhookFields(
  webhook: unknown,
  secret: string | undefined,
  syncedAt: string,
) {
  const record = isRecord(webhook) ? webhook : {};
  const id = toOptionalString(record.id);

  return {
    id,
    fields: {
      ownerUserId: toOptionalString(record.ownerUserId),
      manapoolWebhookId: id,
      topic: toOptionalString(record.topic) ?? "unknown",
      callbackUrl: toOptionalString(record.callbackUrl) ?? "",
      secret,
      payload: webhook,
      syncedAt,
    },
  };
}

function extractOrderFields(
  order: unknown,
  ownerUserId: string | undefined,
  syncedAt: string,
  reports?: unknown[],
) {
  const record = isRecord(order) ? order : {};
  const id = toOptionalString(record.id);

  return {
    id,
    fields: {
      ownerUserId,
      source: "manapool" as const,
      manapoolOrderId: id,
      status:
        toOptionalString(record.latestFulfillmentStatus) ??
        toOptionalString(record.status),
      label: toOptionalString(record.label),
      createdAt: toOptionalString(record.createdAt),
      buyerId: toOptionalString(record.buyerId),
      totalCents: toOptionalNumber(record.totalCents),
      shippingMethod: toOptionalString(record.shippingMethod),
      latestFulfillmentStatus: toOptionalString(record.latestFulfillmentStatus),
      shippingAddress: isRecord(record.shippingAddress)
        ? record.shippingAddress
        : undefined,
      payment: isRecord(record.payment) ? record.payment : undefined,
      fulfillments: Array.isArray(record.fulfillments)
        ? record.fulfillments
        : undefined,
      items: Array.isArray(record.items) ? record.items : undefined,
      reports,
      syncUpdatedAt: syncedAt,
    },
  };
}

export const upsertReadCache = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    cacheKey: v.string(),
    payload: v.any(),
    fetchedAt: v.number(),
    ttlSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const expiresAt = args.fetchedAt + args.ttlSeconds * 1000;

    const existing = await ctx.db
      .query("manapoolReadCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .first();

    const patch = {
      ownerUserId: args.ownerUserId,
      cacheKey: args.cacheKey,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
      expiresAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("manapoolReadCache", patch);
  },
});

export const deleteReadCacheEntries = internalMutation({
  args: {
    keys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    let deleted = 0;

    for (const key of args.keys) {
      const existing = await ctx.db
        .query("manapoolReadCache")
        .withIndex("by_cacheKey", (q) => q.eq("cacheKey", key))
        .collect();

      for (const item of existing) {
        await ctx.db.delete(item._id);
        deleted += 1;
      }
    }

    return { deleted };
  },
});

export const upsertInventorySnapshots = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    inventoryItems: v.array(v.any()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    let upserted = 0;

    for (const item of args.inventoryItems) {
      const snapshot = extractInventorySnapshotFields(item, args.syncedAt);
      if (!snapshot.id) continue;

      const existing = await ctx.db
        .query("manapoolInventoryItems")
        .withIndex("by_manapoolInventoryId", (q) =>
          q.eq("manapoolInventoryId", snapshot.id!),
        )
        .first();

      const fields = stripUndefined({
        ...snapshot.fields,
        ownerUserId: args.ownerUserId ?? snapshot.fields.ownerUserId,
      });

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("manapoolInventoryItems", {
          ...fields,
          manapoolInventoryId: snapshot.id,
          payload: item,
          syncedAt: args.syncedAt,
        });
      }

      upserted += 1;
    }

    return { upserted };
  },
});

export const removeInventorySnapshotByManaPoolId = internalMutation({
  args: {
    manapoolInventoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("manapoolInventoryItems")
      .withIndex("by_manapoolInventoryId", (q) =>
        q.eq("manapoolInventoryId", args.manapoolInventoryId),
      )
      .collect();

    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    return { deleted: existing.length };
  },
});

export const upsertBulkPriceJob = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    job: v.any(),
    progress: v.optional(v.array(v.any())),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = extractBulkJobFields(args.job, args.syncedAt);
    if (!snapshot.id) {
      throw new Error("Bulk price job missing id");
    }

    const existing = await ctx.db
      .query("manapoolBulkPriceJobs")
      .withIndex("by_manapoolJobId", (q) =>
        q.eq("manapoolJobId", snapshot.id!),
      )
      .first();

    const fields = stripUndefined({
      ...snapshot.fields,
      ownerUserId: args.ownerUserId ?? snapshot.fields.ownerUserId,
      progress: args.progress,
    });

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("manapoolBulkPriceJobs", {
      ...fields,
      manapoolJobId: snapshot.id,
      payload: args.job,
      syncedAt: args.syncedAt,
      status: snapshot.fields.status,
    });
  },
});

export const upsertBulkPriceJobs = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    jobs: v.array(v.any()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    let upserted = 0;

    for (const job of args.jobs) {
      const snapshot = extractBulkJobFields(job, args.syncedAt);
      if (!snapshot.id) continue;

      const existing = await ctx.db
        .query("manapoolBulkPriceJobs")
        .withIndex("by_manapoolJobId", (q) =>
          q.eq("manapoolJobId", snapshot.id!),
        )
        .first();

      const fields = stripUndefined({
        ...snapshot.fields,
        ownerUserId: args.ownerUserId ?? snapshot.fields.ownerUserId,
      });

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("manapoolBulkPriceJobs", {
          ...fields,
          manapoolJobId: snapshot.id,
          payload: job,
          syncedAt: args.syncedAt,
          status: snapshot.fields.status,
        });
      }

      upserted += 1;
    }

    return { upserted };
  },
});

export const upsertWebhook = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    webhook: v.any(),
    secret: v.optional(v.string()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = extractWebhookFields(args.webhook, args.secret, args.syncedAt);
    if (!snapshot.id) {
      throw new Error("Webhook missing id");
    }

    const existing = await ctx.db
      .query("manapoolWebhooks")
      .withIndex("by_manapoolWebhookId", (q) =>
        q.eq("manapoolWebhookId", snapshot.id!),
      )
      .first();

    const fields = stripUndefined({
      ...snapshot.fields,
      ownerUserId: args.ownerUserId ?? snapshot.fields.ownerUserId,
      secret:
        args.secret ??
        (existing ? (toOptionalString(existing.secret) ?? undefined) : undefined),
    });

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("manapoolWebhooks", {
      ...fields,
      manapoolWebhookId: snapshot.id,
      topic: snapshot.fields.topic,
      callbackUrl: snapshot.fields.callbackUrl,
      payload: args.webhook,
      syncedAt: args.syncedAt,
    });
  },
});

export const deleteWebhookByManaPoolId = internalMutation({
  args: {
    manapoolWebhookId: v.string(),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("manapoolWebhooks")
      .withIndex("by_manapoolWebhookId", (q) =>
        q.eq("manapoolWebhookId", args.manapoolWebhookId),
      )
      .collect();

    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }

    return { deleted: docs.length };
  },
});

export const insertWebhookDeliveryIfNew = internalMutation({
  args: {
    deliveryId: v.string(),
    event: v.string(),
    timestamp: v.number(),
    signature: v.string(),
    manapoolOrderId: v.optional(v.string()),
    payload: v.any(),
    processedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("manapoolWebhookDeliveries")
      .withIndex("by_deliveryId", (q) => q.eq("deliveryId", args.deliveryId))
      .first();

    if (existing) {
      return { inserted: false as const, id: existing._id };
    }

    const id = await ctx.db.insert("manapoolWebhookDeliveries", args);
    return { inserted: true as const, id };
  },
});

export const upsertOrderFromManaPool = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    order: v.any(),
    reports: v.optional(v.array(v.any())),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = extractOrderFields(
      args.order,
      args.ownerUserId,
      args.syncedAt,
      args.reports,
    );

    if (!snapshot.id) {
      throw new Error("Order missing id");
    }

    const existing = await ctx.db
      .query("orders")
      .withIndex("by_manapoolOrderId", (q) =>
        q.eq("manapoolOrderId", snapshot.id!),
      )
      .first();

    const fields = stripUndefined(snapshot.fields);

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("orders", {
      ...fields,
      manapoolOrderId: snapshot.id,
      source: "manapool",
    });
  },
});

export const upsertOrdersFromManaPool = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    orders: v.array(v.any()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    let upserted = 0;

    for (const order of args.orders) {
      const snapshot = extractOrderFields(order, args.ownerUserId, args.syncedAt);
      if (!snapshot.id) continue;

      const existing = await ctx.db
        .query("orders")
        .withIndex("by_manapoolOrderId", (q) =>
          q.eq("manapoolOrderId", snapshot.id!),
        )
        .first();

      const fields = stripUndefined(snapshot.fields);

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("orders", {
          ...fields,
          manapoolOrderId: snapshot.id,
          source: "manapool",
        });
      }

      upserted += 1;
    }

    return { upserted };
  },
});

export const upsertOrderReports = internalMutation({
  args: {
    ownerUserId: v.optional(v.string()),
    manapoolOrderId: v.string(),
    reports: v.array(v.any()),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_manapoolOrderId", (q) =>
        q.eq("manapoolOrderId", args.manapoolOrderId),
      )
      .first();

    if (!existing) {
      return {
        updated: false,
      };
    }

    await ctx.db.patch(existing._id, {
      ownerUserId: args.ownerUserId ?? existing.ownerUserId,
      reports: args.reports,
      syncUpdatedAt: args.syncedAt,
    });

    return {
      updated: true,
      orderId: existing._id,
    };
  },
});
