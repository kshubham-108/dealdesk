# NOTES

Plain-English log of what got built and why, milestone by milestone.

## M0 — Scaffold (11:30–11:50)

- Scaffolded Next.js 15 (App Router, TypeScript, Tailwind, pnpm) with `create-next-app`.
  It refuses to write into a non-empty folder, so we generated it into `./tmp-app` and moved
  everything up into the repo root, keeping AGENTS.md, CLAUDE.md and `.env.local` untouched.
  `create-next-app` currently defaults to Next 16, so we pinned `next`/`eslint-config-next`
  back to 15.5.26 to match the stack in AGENTS.md.
- Added `@supabase/supabase-js` and a server-only helper (`lib/supabase.ts`) that builds a
  client from `SUPABASE_URL` + `SUPABASE_SECRET_KEY`. This must never be imported into a
  client component — RLS is on with no policies, so only the secret key can read/write.
- Added `/api/health` (`app/api/health/route.ts`): counts rows in `listings` and returns
  `{ ok, listings }`. This is our smoke test that env vars + Supabase + schema are wired up
  correctly before we build anything on top.
- Wrote `supabase/schema.sql` and `supabase/seed.sql` exactly per AGENTS.md §5/§6. Both are
  re-runnable: schema drops and recreates all six tables, seed clears existing sandbox
  listings before inserting the ten Kerbside test listings (7 bikes, a PS5, a desk, a jacket).
  Seed listings use fixed UUIDs so their `/market/<id>` URLs are stable across reseeds.
- `.env.local` was created with every variable name from AGENTS.md §4 and empty values
  (never overwritten — Shubham had already started pasting in Supabase keys by the time this
  ran). No values are ever printed to logs or committed.
- Fixed two scaffold rough edges so `pnpm build` is clean: `create-next-app`'s generated
  `eslint.config.mjs` assumed Next 16's flat-array ESLint exports, which don't exist in 15.5.26
  (it uses the old `extends` shape), so we switched to the standard Next 15 `FlatCompat`
  pattern; and a stray `package-lock.json` in the Windows user's home directory (outside this
  repo) was confusing Next's workspace-root detection, fixed by pinning
  `outputFileTracingRoot` in `next.config.ts`.

**Next:** Shubham needs to run `supabase/schema.sql` then `supabase/seed.sql` in the Supabase
SQL editor, and finish filling in `.env.local`. Then M1: landing page + brief parsing +
Kerbside grid/chat + seller side.
