import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const createTestOrder = mutation({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db.insert("orders", {
      status: args.status ?? "test",
    });
  },
});
