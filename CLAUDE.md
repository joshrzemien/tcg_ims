# Project Instructions

## Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Convex (serverless, reactive)
- Auth: Clerk
- Deployment: Vercel (frontend) + Convex (backend)
- Package manager: pnpm

## Convex
- **Actions** CANNOT directly read/write the DB — they must call queries
  and mutations internally.

## Canonical types
The frontend never sees external API types — only our canonical types.

## Freshness requirements
Every dataset from an external source has a freshness requirement. When building or
modifying any feature that involves external data, you MUST clarify with the developer:

1. What is the freshness requirement? (real-time / minutes / hours / daily)
2. What triggers a sync? (cron schedule / user action / workflow start)
3. Is stale data acceptable as a fallback if the external API is unavailable?

## External integrations pattern
External API clients live in `convex/integrations/<service>.ts`. These are pure
TypeScript — they handle HTTP calls and map external responses to our canonical types.
They have no Convex dependencies. Domain actions (`convex/<domain>/actions.ts`) call
these clients and use mutations to persist the normalized data.

Data flow: Integration client → Action (orchestrates) → Mutation (writes) → Query (reads) → UI

## Required behaviors
- Ask the user for explicit approval before:
    - adding dependencies
    - making significant architectural decisions/changes
    - adding non-critical environment variables
- After committing code, always push/deploy updates to Vercel and Convex so hosted environments stay in sync with the latest commit
- Don't read README.md, PRD.md, or planning.md - ask the user for context/clarification instead

## Environment Variable Management
- Manage browser/build-time vars in Vercel via CLI (`vercel env ...`), not by hardcoding.
- Manage backend runtime vars in Convex via CLI (`pnpm exec convex env ...`), not by hardcoding.
- Required Vercel env vars (all in `development`, `preview`, and `production`):
  - `VITE_CONVEX_URL`
  - `VITE_CLERK_PUBLISHABLE_KEY`
- Required Convex env var (dev and prod): `CONVEX_FRONTEND_URL`
- Vercel Preview env gotcha: `vercel env add NAME preview --value "..." --yes --force --non-interactive` may return `action_required` / `git_branch_required`. Workaround: run without `--non-interactive` and press Enter at the Git branch prompt to target all Preview branches.
- Deploy Convex to prod in non-interactive terminals with: `pnpm exec convex deploy -y` (without `-y`, CLI hangs on confirmation prompt).
