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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function getOptionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function getOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
