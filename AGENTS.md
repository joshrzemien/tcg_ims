# Project Instructions

## Tech Stack
- TypeScript
- React
- Vite
- Tailwind CSS
- pnpm
- Vercel
- Convex

## Guardrails
- ASK THE USER for explicit approval before adding ANY DEPENDENCY WHATSOEVER.
- ASK THE USER for explicit approval before MAKING ANY SIGNIFICANT ARCHITECTURAL DECISIONS.
- Keep implementation minimal and only build what is strictly required for the current request.

## Environment Variable Management
- Manage browser/build-time vars in Vercel via CLI (`vercel env ...`), not by hardcoding.
- Manage backend runtime vars in Convex via CLI (`pnpm exec convex env ...`), not by hardcoding.
- Required Vercel env var: `VITE_CONVEX_URL` in `development`, `preview`, and `production`.
- Baseline Convex env var: `CONVEX_FRONTEND_URL` in `dev` and `prod`.
- Add/update Vercel env var: `vercel env add NAME <development|preview|production> --value "..." --yes --force`
- List Vercel env vars: `vercel env list`
- Remove Vercel env var: `vercel env remove NAME <environment>`
- Add/update Convex dev env var: `pnpm exec convex env set NAME value`
- Add/update Convex prod env var: `pnpm exec convex env set NAME value --prod`
- List Convex env vars: `pnpm exec convex env list` and `pnpm exec convex env list --prod`
- Remove Convex env var: `pnpm exec convex env remove NAME` (add `--prod` for prod)
- NEVER commit secrets to git. Keep local-only values in `.env.local` when needed.
- ASK THE USER for explicit approval before adding, removing, or changing any NON-CRITICAL environment variable.
