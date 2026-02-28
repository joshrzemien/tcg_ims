/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as hello from "../hello.js";
import type * as http from "../http.js";
import type * as integrations_easypost from "../integrations/easypost.js";
import type * as order_mutations from "../order/mutations.js";
import type * as shipping_actions from "../shipping/actions.js";
import type * as shipping_mutations from "../shipping/mutations.js";
import type * as shipping_queries from "../shipping/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  hello: typeof hello;
  http: typeof http;
  "integrations/easypost": typeof integrations_easypost;
  "order/mutations": typeof order_mutations;
  "shipping/actions": typeof shipping_actions;
  "shipping/mutations": typeof shipping_mutations;
  "shipping/queries": typeof shipping_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
