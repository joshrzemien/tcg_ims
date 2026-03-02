import type { ManaPoolCredentials } from "../integrations/manapool";
import { isRecord } from "../lib/normalize";

declare const process: { env: Record<string, string | undefined> };
const MANAPOOL_ROLE = "admin";

function getNestedClaim(
  source: unknown,
  path: readonly string[],
): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function getUserRole(identity: unknown): string | undefined {
  const candidates: Array<readonly string[]> = [
    ["publicMetadata", "role"],
    ["sessionClaims", "publicMetadata", "role"],
    ["claims", "publicMetadata", "role"],
  ];

  for (const path of candidates) {
    const value = getNestedClaim(identity, path);
    if (typeof value === "string") return value;
  }
  return undefined;
}

export async function requireAdminUserId(ctx: {
  auth: {
    getUserIdentity: () => Promise<{ subject?: unknown } | null>;
  };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const subject = identity.subject;
  if (typeof subject !== "string" || subject.length === 0) {
    throw new Error("Authenticated identity missing subject");
  }

  const role = getUserRole(identity);
  if (role !== MANAPOOL_ROLE) {
    throw new Error("Not authorized: admin role required");
  }

  return subject;
}

export function getManaPoolCredentialsOrThrow(): ManaPoolCredentials {
  const email = process.env.MANAPOOL_EMAIL;
  const accessToken = process.env.MANAPOOL_ACCESS_TOKEN;

  if (!email) {
    throw new Error("MANAPOOL_EMAIL not set");
  }
  if (!accessToken) {
    throw new Error("MANAPOOL_ACCESS_TOKEN not set");
  }

  return { email, accessToken };
}

export function getManaPoolCredentialsOrNull(): ManaPoolCredentials | null {
  const email = process.env.MANAPOOL_EMAIL;
  const accessToken = process.env.MANAPOOL_ACCESS_TOKEN;

  if (!email || !accessToken) return null;
  return { email, accessToken };
}
