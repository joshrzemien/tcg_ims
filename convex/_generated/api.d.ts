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
import type * as integrations_tcgplayer from "../integrations/tcgplayer.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as manapool_actions from "../manapool/actions.js";
import type * as manapool_auth from "../manapool/auth.js";
import type * as manapool_mutations from "../manapool/mutations.js";
import type * as manapool_queries from "../manapool/queries.js";
import type * as manapool_types from "../manapool/types.js";
import type * as orders_actions from "../orders/actions.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_types from "../orders/types.js";
import type * as shipping_actions from "../shipping/actions.js";
import type * as shipping_mutations from "../shipping/mutations.js";
import type * as shipping_queries from "../shipping/queries.js";
import type * as shipping_types from "../shipping/types.js";
import type * as tcgplayer_actions from "../tcgplayer/actions.js";
import type * as tcgplayer_mutations from "../tcgplayer/mutations.js";
import type * as tcgplayer_queries from "../tcgplayer/queries.js";
import type * as tcgplayer_types from "../tcgplayer/types.js";

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
  "integrations/tcgplayer": typeof integrations_tcgplayer;
  "lib/normalize": typeof lib_normalize;
  "manapool/actions": typeof manapool_actions;
  "manapool/auth": typeof manapool_auth;
  "manapool/mutations": typeof manapool_mutations;
  "manapool/queries": typeof manapool_queries;
  "manapool/types": typeof manapool_types;
  "orders/actions": typeof orders_actions;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "orders/types": typeof orders_types;
  "shipping/actions": typeof shipping_actions;
  "shipping/mutations": typeof shipping_mutations;
  "shipping/queries": typeof shipping_queries;
  "shipping/types": typeof shipping_types;
  "tcgplayer/actions": typeof tcgplayer_actions;
  "tcgplayer/mutations": typeof tcgplayer_mutations;
  "tcgplayer/queries": typeof tcgplayer_queries;
  "tcgplayer/types": typeof tcgplayer_types;
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
