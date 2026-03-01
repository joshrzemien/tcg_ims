/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as hello from "../hello.js";
import type * as http from "../http.js";
import type * as integrations_easypost from "../integrations/easypost.js";
import type * as integrations_manapool from "../integrations/manapool.js";
import type * as manapool_actions from "../manapool/actions.js";
import type * as manapool_auth from "../manapool/auth.js";
import type * as manapool_mutations from "../manapool/mutations.js";
import type * as manapool_queries from "../manapool/queries.js";
import type * as manapool_types from "../manapool/types.js";
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
  crons: typeof crons;
  hello: typeof hello;
  http: typeof http;
  "integrations/easypost": typeof integrations_easypost;
  "integrations/manapool": typeof integrations_manapool;
  "manapool/actions": typeof manapool_actions;
  "manapool/auth": typeof manapool_auth;
  "manapool/mutations": typeof manapool_mutations;
  "manapool/queries": typeof manapool_queries;
  "manapool/types": typeof manapool_types;
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
