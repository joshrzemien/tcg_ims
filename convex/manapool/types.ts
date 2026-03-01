import {
  getOptionalArray,
  getOptionalRecord,
  isRecord,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalString,
} from "../lib/normalize";

export const MANAPOOL_ROLE = "admin" as const;

export type ManaPoolFormat = "json" | "csv";

export type ManaPoolCredentials = {
  email: string;
  accessToken: string;
};

export type SellerReadCacheEnvelope<T> = {
  data: T;
  fetchedAt: number;
};

function camelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function camelizeKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeKeysDeep(item)) as T;
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[camelCaseKey(key)] = camelizeKeysDeep(nestedValue);
    }
    return output as T;
  }

  return value;
}

export {
  getOptionalArray,
  getOptionalRecord,
  isRecord,
  toOptionalBoolean,
  toOptionalNumber,
  toOptionalString,
};
