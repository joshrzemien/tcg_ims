import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhooks/easypost",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const signature = request.headers.get("X-Hmac-Signature") ?? "";

    try {
      await ctx.runAction(
        internal.shipping.actions.processTrackingWebhook,
        { rawBody, signature },
      );
      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return new Response("Webhook error", { status: 500 });
    }
  }),
});

http.route({
  path: "/webhooks/manapool",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const event = request.headers.get("X-ManaPool-Event") ?? "";
    const timestamp = request.headers.get("X-ManaPool-Timestamp") ?? "";
    const signature = request.headers.get("X-ManaPool-Signature") ?? "";

    try {
      const result = await ctx.runAction(
        internal.manapool.actions.processOrderCreatedWebhook,
        { rawBody, event, timestamp, signature },
      );
      if (result.processed) {
        return new Response("OK", { status: 200 });
      }
      return new Response(`Webhook rejected: ${result.reason}`, { status: 500 });
    } catch (err) {
      console.error("ManaPool webhook processing error:", err);
      return new Response("Webhook error", { status: 500 });
    }
  }),
});

export default http;
