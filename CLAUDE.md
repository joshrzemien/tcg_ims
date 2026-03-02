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
