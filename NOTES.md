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

## Amendments v3 + backend (13:50–14:45)

Plan change: Telegram is out, WhatsApp (via a "Wassist" agent hitting our REST endpoints) is in;
the MCP server is now optional since Grok Bot can feed real listings through the arena's import
box instead. Appended as §14 to AGENTS.md/CLAUDE.md — full details there.

- `supabase/migrations/001_v3.sql`: adds `briefs.tick_lock_until` and `briefs.source` ('web' |
  'whatsapp'). **Needs to be run in the Supabase SQL editor before any of this works** — the new
  columns don't exist in production yet.
- `lib/score.ts` (DealScore) and `lib/engine.ts` (the negotiation ladder) are pure functions —
  no DB, no LLM, so they're fully unit-testable. Every constant in them was reverse-engineered
  by hand from AGENTS.md §8a/§8b and cross-checked against §8c's exact numbers before being
  written down (e.g. Frank scores exactly 86, opens at exactly £210, agrees at exactly £235).
  **Found and fixed a real rounding bug** while writing the 10,000-run property test:
  `round5()` can round a value that's mathematically below a non-multiple-of-5 ceiling up past
  it (e.g. `round5(103) = 105` when the ceiling is £104) — only surfaces with random,
  non-round-number max prices, never with the fixed demo data. Fixed by clamping each ladder
  rung to the ceiling.
- `lib/seller.ts` was refactored to pull the seller's pricing decision out into a pure
  `decideSellerOffer()` (accept/counter math, no DB/LLM/delay), so the property test and the
  §8c outcome tests replay the *exact same* pricing code the running app uses — not a
  reimplementation that could quietly drift from it. Also added the collection reply (the one
  exception to "no reply once approved") and `SCAM_MESSAGE`/`SOLD_MESSAGE`/
  `CONDITION_QUESTION_PATTERN` as named exports so tests can reuse them.
- `lib/deals.ts` grew `runDecision` (runs the engine once for a deal and persists whatever it
  decided — messages, status, reason codes, score), `screenListingsForHunt` (the initial
  DealScore pass that creates 'new'/'skipped' deals), `ensureApproval`, and the full on-approve
  flow (`approveDeal`/`declineApproval`: marks the deal approved, sends the collection message,
  closes every other open deal with a polite decline, supersedes other pending approvals).
- `lib/autopilot.ts`: `tryAcquireTickLock` implements §14.4's lock exactly (claim
  `tick_lock_until` only where it's null or in the past; no row updated → `{skipped:true}`) so
  the arena poller, `/api/wa/start` and `/api/wa/status` can all trigger ticks without ever
  double-sending a message.
- `lib/wa.ts`: WhatsApp reply text is built entirely from the database (title, seller, asking
  vs. agreed, DealScore + up to 3 top reasons, other outcomes) — no LLM, and structurally unable
  to leak the max/ceiling/floor since those fields are never read by this code path.
- Routes added: `GET /api/hunt/<id>/state`, `GET /api/hunt/latest`, `POST /api/autopilot/tick`
  (locked), `POST /api/approvals/<id>`, and `/api/wa/{start,status,approve}` (accept GET or POST,
  auth via `x-api-key` header or `?key=`, params from JSON body or query string).
- **Tests (`pnpm test`, 33 passing):** opening-offer bounds; the 10,000-run property test (no
  offer above max, no agreement above the ceiling — this is what caught the rounding bug above);
  a leak test using max £261 (chosen so it can't collide with any other demo number) confirming
  £261 only ever appears in the sanctioned final-rung line; one case per scam code; chase→chase→
  ghosted plus `wait`'s remaining-seconds; sold→close; major-issue→walk-away; statelessness;
  and the full §8c table (Frank agreed £235, Hana agreed £240 with ceiling lowered to £245, Fiona
  walks away, Gary ghosted, Sam scam-blocked, Sally sold, Dave skipped WRONG_SIZE).
  Deliberately did *not* write a naive "seller floor never appears in buyer messages" substring
  test — `decide()`'s own input type has no floor_price field at all (a structural guarantee,
  not a runtime one), and a negotiation that converges exactly at the floor is the *correct*
  outcome, not a leak; a substring check would flag Hana's real agreed-£240-at-floor outcome as
  a false positive.

**Next:** verify the whole flow against production via curl (`/api/wa/start` → repeated
`/api/autopilot/tick` → `/api/wa/status` → `/api/wa/approve`), then the arena UI (M3).
