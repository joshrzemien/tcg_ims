import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getWebhookByTopic = internalQuery({
  args: {
    topic: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manapoolWebhooks")
      .withIndex("by_topic", (q) => q.eq("topic", args.topic))
      .order("desc")
      .first();
  },
});

export const listWebhooksByTopic = internalQuery({
  args: {
    topic: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manapoolWebhooks")
      .withIndex("by_topic", (q) => q.eq("topic", args.topic))
      .order("desc")
      .collect();
  },
});

export const getWebhookByManaPoolId = internalQuery({
  args: {
    manapoolWebhookId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manapoolWebhooks")
      .withIndex("by_manapoolWebhookId", (q) =>
        q.eq("manapoolWebhookId", args.manapoolWebhookId),
      )
      .first();
  },
});

export const listActiveBulkPriceJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("manapoolBulkPriceJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const processing = await ctx.db
      .query("manapoolBulkPriceJobs")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    return [...pending, ...processing];
  },
});

export const getOrderByManaPoolId = internalQuery({
  args: {
    manapoolOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_manapoolOrderId", (q) =>
        q.eq("manapoolOrderId", args.manapoolOrderId),
      )
      .first();
  },
});
