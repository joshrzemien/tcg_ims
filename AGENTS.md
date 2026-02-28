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
- Vercel CLI hiccup (Preview env): `vercel env add NAME preview --value "..." --yes --force --non-interactive` may return `action_required` / `git_branch_required`.
- Reliable fallback for Preview env vars: run `vercel env add NAME preview --value "..." --yes --force` interactively and press Enter at the Git branch prompt to target all Preview branches.
- After setting Vercel env vars, verify with `vercel env list` (or `vercel env list | rg NAME`).
- List Vercel env vars: `vercel env list`
- Remove Vercel env var: `vercel env remove NAME <environment>`
- Add/update Convex dev env var: `pnpm exec convex env set NAME value`
- Add/update Convex prod env var: `pnpm exec convex env set NAME value --prod`
- List Convex env vars: `pnpm exec convex env list` and `pnpm exec convex env list --prod`
- Remove Convex env var: `pnpm exec convex env remove NAME` (add `--prod` for prod)
- NEVER commit secrets to git. Keep local-only values in `.env.local` when needed.
- ASK THE USER for explicit approval before adding, removing, or changing any NON-CRITICAL environment variable.
