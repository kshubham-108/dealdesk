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

## M1 — Landing, Kerbside, seller side (11:50–12:35)

- Model picks: `LLM_SMART_MODEL=spacexai/grok-4.7` (brief parsing — biggest context window,
  strongest reasoning, structured-output support) and `LLM_FAST_MODEL=spacexai/grok-4.1-fast-non-reasoning`
  (message phrasing — cheapest/fastest model with structured-output support). **Heads up:** the
  gateway's actual vendor prefix today is `spacexai/`, not `xai/` as AGENTS.md's grep pattern
  assumes — xAI's model IDs on the AI Gateway have moved under that prefix. Add both to Vercel's
  env vars.
- Added the `ai` SDK + `zod`. Per the AI Gateway's own guidance, a model ID is just passed as a
  plain string (`model: process.env.LLM_SMART_MODEL`) straight into `generateObject`/`generateText`
  — no separate gateway provider object needed as long as `AI_GATEWAY_API_KEY` is set.
- `lib/brief.ts`: parses the raw brief text into structured fields with `generateObject` + a zod
  schema; falls back to the exact demo values (target £220, max £260, 54cm, etc.) if the model
  isn't configured or parsing fails. This fallback path is what let us test the whole flow
  locally before `AI_GATEWAY_API_KEY` was set.
- `/api/briefs` is one endpoint serving two steps: `{raw_text}` parses and returns fields (no
  DB write) for the editable card; `{raw_text, fields, agent_mode}` inserts the brief row and
  returns its id. The landing page (`app/page.tsx`) shows the pre-filled textarea, a "Review
  brief" step, then the editable card with "Run the hunt" / "Start with Grok Bot".
- Added a minimal `/hunt/[id]` page — just the brief details and a link into Kerbside. The real
  arena (screening strip, negotiation cards, approvals, results) is M3; this only exists so the
  landing page's redirect isn't a dead link.
- `/market` (Kerbside grid) and `/market/[id]` (listing + seller profile + chat) read straight
  from Supabase. The chat is a client component (`Chat.tsx`) polling every 2s; without a `hunt`
  query param it's read-only (no textarea), matching AGENTS.md §10. Kept the required
  `textarea#message-input` / `button#send-button` ids for computer-use.
- `lib/seller.ts` implements §7 exactly: deterministic price (accept if offer ≥ floor, else
  `round5(prev - (prev-offer)*concession)` clamped to floor), honest disclosure on first reply
  or any damage/condition question, LLM phrasing via `LLM_FAST_MODEL` with a template fallback
  whenever the generated text drops the exact £ figure. The floor price is only ever used inside
  this deterministic arithmetic — it's never put in an LLM prompt. `human_ghost` never replies;
  `human_scammer` always sends the same canned scam pitch; `human_sold` always says it's sold.
  Seller-side code deliberately never touches `deals.status` — that belongs to the negotiation
  engine (M2), so it doesn't jump ahead of milestones it doesn't own yet.
- Tested by hand against the real Supabase instance (not just unit-level): opened Frank's
  listing, asked about damage and offered £210 → he disclosed the tyre service honestly and
  countered £235 (matches AGENTS.md §8c's demo table exactly); offering £235 back got an
  instant accept. Also confirmed Sam (scammer) always sends the deposit pitch and Gary (ghost)
  never replies.

**Next:** M2 — `score.ts` (DealScore), `engine.ts` (negotiation ladder), `deals.ts`
(`runDecision`), the vitest suite, and the hunt state API.
