# AGENTS.md — DealDesk v2 (Grok Bot Commerce London Hackathon, Sat 26 Sep 2026)

v2 changes (11:30): sellers get their own agent (agent-to-agent negotiation with two secret
limits), DealScore product screening, a negotiation arena view, a results panel, and
milestones reordered so the demo video can be recorded early. Judges score a **2-minute demo
video plus the GitHub repo**; the top five then present live.

You are building a hackathon project with Shubham. **Feature freeze 15:05. Code freeze 16:30.**
Every milestone has a hard time box: when it runs out, ship the simplest working version and
move on. Write all code today, from scratch. After each milestone: `pnpm build` passes → commit
→ `git push` (Vercel deploys `main` to production) → append 3–5 plain-English lines to `NOTES.md`
explaining what you built and why, so Shubham can explain every part. Never print secret values.

## 1. Product

**DealDesk gives each side of a second-hand deal its own AI agent.**
- **Buyer agent:** you describe what you want, your target and your secret limit. It screens
  every listing (not just the first result), asks sellers the questions a careful buyer asks,
  negotiates in parallel, chases, blocks scams, and brings you the best deal to approve with one tap.
- **Seller agent:** the seller sets a secret lowest price and the item's known issues. It answers
  "is it still available?" and condition questions instantly and honestly, negotiates down to
  the floor and no further, and arranges collection. The seller types nothing.
- **Neither agent ever sees the other's limit.** Deterministic engines decide every price; LLMs
  only write the words. Deals land inside the overlap of the two secret limits, or the agents
  walk away without revealing anything.

Where each part runs:
- **Grok Bot** (xAI's computer-use teammate) is the buyer's hands on the real web: it scouts real
  eBay/Gumtree listings (read-only) for market prices and seller feedback, and can work Kerbside
  chats itself through the MCP server.
- **Kerbside** (`/market`) is our clearly-labelled test marketplace. Three sellers run DealDesk's
  seller agent; three are simulated problem sellers (a ghost, a scammer, one already sold).
- **Autopilot** runs the buyer agent server-side against all sellers at once. It drives the
  **arena** view that the demo video records.

## 2. Non-negotiable rules

1. **Secret limits stay secret.** The buyer's `max_price` and per-deal `ceiling` never appear in
   any LLM prompt, MCP output, error or reason text, except the final offer at ladder step 3.
   The seller's `floor_price` never reaches the buyer side or any LLM prompt. The dashboard's
   **audience view** shows both limits, labelled "neither agent can see the other's limit".
2. **Deterministic prices.** Buyer engine, seller policy and DealScore are pure functions. LLMs
   only phrase messages and parse the brief. Every phrased message must contain the exact £
   amount decided; otherwise use the template.
3. **No deal without the buyer's approval** (dashboard button or Telegram tap).
4. **First contact discloses AI:** "I'm DealDesk, an AI assistant messaging for Shubham."
5. **Never message real marketplace users.** Real sites are read-only (`source = 'real'`).
6. Secrets only in env vars. Server-only Supabase access with the secret key; RLS on every table,
   no policies; no Supabase client in the browser.
7. Computer-use-friendly Kerbside UI: `textarea#message-input` (aria-label "Message seller"),
   `button#send-button` ("Send"), listing cards as real links.
8. Keep it simple: polling (no websockets), templates as fallbacks, no auth.

## 3. Stack

Next.js 15 App Router, TypeScript, Tailwind, pnpm. `@supabase/supabase-js` (server only).
AI SDK (`ai`) via **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`; model strings from env). Remote
MCP with `mcp-handler` + `@modelcontextprotocol/sdk` + `zod` (Streamable HTTP at `/api/mcp`).
Telegram Bot API via `fetch`. `vitest`. Route handlers: `runtime = 'nodejs'`,
`dynamic = 'force-dynamic'`, `maxDuration = 30` where `after()` (from `next/server`) is used.

Models: `curl -s https://ai-gateway.vercel.sh/v1/models | grep -o '"id":"xai/[^"]*"'`.
`LLM_FAST_MODEL` = newest fast Grok (message phrasing). `LLM_SMART_MODEL` = newest general Grok
(brief parsing). Record the choices in NOTES.md.

Deploy: GitHub → Vercel import; pushes to `main` deploy production at `NEXT_PUBLIC_APP_URL`.
Use only the production URL for Grok Bot and judges (preview URLs sit behind Vercel login).

## 4. Environment variables

```
NEXT_PUBLIC_APP_URL=https://<project>.vercel.app
SUPABASE_URL=
SUPABASE_SECRET_KEY=
AI_GATEWAY_API_KEY=
LLM_FAST_MODEL=
LLM_SMART_MODEL=
MCP_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
GHOST_TIMEOUT_SECONDS=20
```

## 5. Data model — `supabase/schema.sql` (re-runnable)

```sql
drop table if exists events, approvals, messages, deals, listings, briefs cascade;
create extension if not exists pgcrypto;

create table briefs (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  item text not null,
  keywords text[] not null default '{}',        -- e.g. {bike, road bike}
  size_token text,                              -- e.g. '54cm' (hard requirement if set)
  min_condition text not null default 'good',   -- like new | very good | good | fair
  location text,
  availability text,
  target_price int not null,
  max_price int not null,                       -- SECRET
  agent_mode text not null default 'autopilot' check (agent_mode in ('grokbot','autopilot')),
  created_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sandbox','real')),
  platform text not null,                       -- 'Kerbside (test)', 'eBay', 'Gumtree'
  url text,
  title text not null,
  description text,
  category text,
  condition text,
  asking_price int not null,
  location text,
  seller_name text,
  seller_mode text check (seller_mode in ('agent','human')),
  persona text check (persona in ('agent_fair','agent_haggler','agent_firm',
    'human_ghost','human_scammer','human_sold')),
  floor_price int,                              -- SECRET (seller side)
  known_issue text,                             -- seller agents disclose this when asked
  issue_severity text not null default 'none' check (issue_severity in ('none','minor','major')),
  seller_rating numeric(2,1),
  seller_reviews_count int not null default 0,
  seller_since date,
  seller_reviews text[] not null default '{}',
  seller_feedback text,                         -- free text for real listings, e.g. '99.4% positive (1.2k)'
  emoji text,
  brief_id uuid references briefs(id) on delete cascade,   -- real listings belong to a hunt
  created_at timestamptz not null default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  status text not null default 'new' check (status in ('new','skipped','contacted',
    'negotiating','agreed_pending_approval','approved','declined','walked_away','ghosted',
    'scam_blocked','sold','closed_other')),
  deal_score int,
  score jsonb not null default '{}',            -- {fit, trust, condition, price, flags, skipReason}
  agreed_price int,
  last_action text,
  reason_codes text[] not null default '{}',
  first_contact_at timestamptz,
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, listing_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  sender text not null check (sender in ('buyer_agent','seller','system')),
  body text not null,
  price int,                                    -- £ amount proposed/accepted, if any
  intent text,
  meta jsonb not null default '{}',             -- seller replies: {issues, issue_text}
  created_at timestamptz not null default now()
);
create index on messages (deal_id, created_at);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  price int not null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table events (
  id bigserial primary key,
  brief_id uuid not null references briefs(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table briefs enable row level security;
alter table listings enable row level security;
alter table deals enable row level security;
alter table messages enable row level security;
alter table approvals enable row level security;
alter table events enable row level security;
```

Event kinds: `brief_created, listing_screened, listing_skipped, message_sent, seller_replied,
issue_disclosed, ceiling_lowered, chase_sent, scam_blocked, sold_detected, walked_away,
ghosted, deal_agreed, approval_requested, approval_approved, approval_declined, others_closed,
collection_arranged`.

## 6. Seed — `supabase/seed.sql` (Kerbside test listings)

Each sandbox `url` is the path `/market/<id>` (match on path; ignore host and query).
Years on platform are computed from `seller_since` at run time.

| # | emoji | title | condition | asking | floor | persona | seller | rating (reviews) | since | reviews | known issue (severity) | location |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 🚲 | Specialized Allez, 54cm, Shimano Sora | very good | 260 | 225 | agent_fair | Frank | 4.9 (48) | 2021-03-01 | "Bike exactly as described, easy collection." / "Friendly and quick to reply." | "No damage. Serviced in August with new tyres." (none) | Hackney, E8 |
| 2 | 🚲 | Canyon Endurace AL, 54cm, Shimano 105 | good | 300 | 240 | agent_haggler | Hana | 4.7 (21) | 2022-05-01 | "Good bike, a few more scuffs than the photos showed." / "Chatty seller, fair price in the end." | "A small scuff on the top tube, and the brake pads are due for replacing." (minor) | Shoreditch, E1 |
| 3 | 🚲 | Giant Contend 2, size M (54cm) | very good | 285 | 275 | agent_firm | Fiona | 4.8 (35) | 2020-01-15 | "Knows her bikes, firm on price." / "Smooth sale." | "No issues, it's been garage kept." (none) | Bethnal Green, E2 |
| 4 | 🚲 | Cannondale CAAD Optimo, 54cm | good | 210 | 190 | human_ghost | Gary | 3.4 (6) | 2023-02-01 | "Never replied to my last message." / "Nice bike but slow to reply." | – | Mile End, E3 |
| 5 | 🚲 | Boardman SLR carbon, 54cm, as new | like new | 120 | – | human_scammer | Sam | – (0) | 2026-09-24 | – | – | Stratford, E15 |
| 6 | 🚲 | Ribble Endurance AL, 54cm | good | 230 | 210 | human_sold | Sally | 4.6 (12) | 2022-06-01 | "Sold quickly, lovely seller." / "Great communication." | – | Bow, E3 |
| 7 | 🚲 | Trek Domane AL 2, 58cm | good | 240 | 215 | agent_fair | Dave | 4.8 (30) | 2021-07-01 | "Great seller." | "No issues." (none) | Leyton, E10 |
| 8 | 🎮 | PS5 Slim (disc), two controllers | very good | 320 | 285 | agent_fair | Priya | 4.9 (60) | 2020-09-01 | "Fast, friendly, as described." | "No issues." (none) | Whitechapel, E1 |
| 9 | 🪑 | IKEA Alex desk, white | good | 45 | 35 | agent_fair | Tom | 4.5 (9) | 2024-01-10 | "Easy pickup." | "One small mark on the top." (minor) | Stepney, E1 |
| 10 | 🧥 | Carhartt Detroit jacket, size L, vintage | good | 85 | 70 | agent_haggler | Leo | 4.7 (18) | 2023-04-01 | "Great vintage finds." | "Light fading on the collar." (minor) | Dalston, E8 |

Categories: `bike`, `console`, `furniture`, `clothing`. `seller_mode` = `agent` for `agent_*`
personas, `human` otherwise. Descriptions: 1–2 realistic sentences (no issues mentioned).

## 7. Seller side — `lib/seller.ts` (deterministic policy, LLM wording)

Runs after every buyer message on a sandbox deal via `after()`, with a delay: seller agents
2–4 s, `human_sold` 5 s, `human_scammer` 3–5 s, `human_ghost` never replies. No reply at all
when the deal is `agreed_pending_approval` or terminal, except the collection reply below.

`A` = asking, `X` = the buyer's latest £ offer, `prev` = this seller's last counter in the
deal (or `A`), `round5(x) = Math.round(x/5)*5`, concession `c`: fair 0.5, firm 0.1, haggler 0.35.
- `human_sold` → intent `sold`: "Sorry, it sold this morning!"
- `human_scammer` → intent `scam`: "Yes available!! Perfect condition, no issues. I'm working
  offshore so can't meet. Pay by bank transfer and I'll send it by courier today, just need a
  £50 deposit to hold it."
- Seller agents:
  - Price: `X >= floor` → intent `accept`, `price = X`; else intent `counter`,
    `price = max(floor, round5(prev - (prev - X) * c))`. No £ in the buyer message → intent
    `availability`, `price = A`.
  - **Honest disclosure:** in the first reply of a deal, and whenever the buyer asks about damage,
    faults or condition, include `known_issue` and set `meta = {issues: issue_severity,
    issue_text: known_issue}`.
  - Template: "Hi! Yes, it's available. <known_issue> <'I could do £P.' | '£X works for me.'>"
  - After a buyer message with intent `approval_confirmed` → intent `collection`: "Great, I'm
    around after 6 near <location>. I'll send the exact address nearer the time."
- Wording: `generateText` (`LLM_FAST_MODEL`), style per persona (fair friendly, firm terse,
  haggler chatty), max 2 sentences, must keep the exact £ amount and the issue meaning;
  otherwise the template. The floor is never in the prompt.

## 8. Buyer side

### 8a. DealScore — `lib/score.ts` (pure)
`dealScore({ listing, brief, marketRef, disclosure?, agreedPrice? })` →
`{ total, fit, trust, condition, price, flags, skipReason? }`.
- **Fit (30 or skip):** no brief keyword in title/category → skip `NO_MATCH`; `size_token` set
  and not in title+description (case-insensitive) → skip `WRONG_SIZE`; condition rank below
  `min_condition` → skip `CONDITION_BELOW_MIN`; asking > 1.25 × max → skip `FAR_ABOVE_BUDGET`.
  Otherwise 30.
- **Seller trust (0–25):** `round(15 × rating/5 [0 if no reviews] + 5 × min(reviews,50)/50 +
  (years ≥ 1 ? 5 : 1)) − 6 × red-flag reviews`, clamped. Red flags (case-insensitive):
  no-show, didn't turn up, not as described, never replied, scam.
- **Condition (0–25):** like new 25, very good 21, good 17, fair 10; minus 5 if a minor issue was
  disclosed; 0 and flag `MAJOR_ISSUE` if major.
- **Price (0–20):** `ref` = median asking of this hunt's real listings if there are at least 3,
  else the brief target. `r = (agreedPrice ?? asking) / ref`: `< 0.6` → 0 and flag
  `PRICE_TOO_GOOD`; `< 0.9` → 20; `< 1.05` → 16; `< 1.2` → 10; else 4.
- Flags: `NEW_ACCOUNT` (0 reviews or under 1 month), `PRICE_TOO_GOOD`, `MAJOR_ISSUE`.
  Two or more flags → badge **HIGH RISK**.
- Contact if not skipped and total ≥ 50. Recommendation among agreed deals: highest final
  DealScore, then lowest price.

### 8b. Negotiation engine — `lib/engine.ts` (pure, stateless)
`decide({ brief, listing, messages, now, ghostTimeoutS }) → { action, offer?, say?, status,
reasonCodes, retryAfterS?, ceiling }` with `action ∈ send | chase | wait | request_approval |
walk_away | stop_scam | close | none`. Everything is derived from message history.

`T = min(target, max)`, `M = max`, `A = asking`. Ceiling `C = M`, or `M − 15` once the seller has
disclosed a minor issue (code `CEILING_LOWERED`). Opening `O = min(round5(max(0.6A, min(T, 0.8A))), M)`.
Ladder with `O2 = min(O, C)`: `L = [O2, round5(O2+(C−O2)×0.5), round5(O2+(C−O2)×0.8), C]`.
`k` = number of buyer messages containing a £ amount.

Rules in order:
1. Status terminal or `agreed_pending_approval` → `none`.
2. **Scam shield:** any seller message matching (case-insensitive) bank transfer / sort code /
   wire → `OFF_PLATFORM_PAYMENT`; deposit / pay upfront / in advance → `UPFRONT_PAYMENT`;
   courier → `COURIER_BEFORE_VIEWING`; gift card / crypto / bitcoin / friends and family →
   `UNTRACEABLE_PAYMENT`; whatsapp / text me on / email me → `MOVE_OFF_PLATFORM` →
   `stop_scam`, status `scam_blocked`, no reply.
3. Seller says sold / no longer available / gone → `close`, status `sold`, say "No worries, thanks!"
4. No buyer messages → `send` opening, status `contacted`, code `OPENING_OFFER`:
   "Hi <seller>! I'm DealDesk, an AI assistant messaging for Shubham. Is the <short title> still
   available? Any damage, faults or recent servicing he should know about? Would you take £O?
   He can collect <availability>."
5. Last message from the buyer: chases so far = consecutive buyer messages since the last seller
   message − 1. Waited ≥ `ghostTimeoutS`: fewer than 2 chases → `chase` (`CHASE_1/2`): "Hi again,
   just checking the <short title> is still available? Happy to collect <availability>." (no £);
   otherwise `close`, status `ghosted`. Not waited long enough → `wait` with `retryAfterS`.
6. Last message from the seller:
   - Disclosure `major` → `walk_away` (`MAJOR_ISSUE`): "Thanks for being upfront. That's more work
     than he's after, so we'll pass."
   - `S` = the seller's £ amount. `S == null` → `send` `L[k-1]` again (or the opening if `k = 0`).
   - Agree if `S <= C` and (`S <= L[k-1]` or (`k <= 3` and `S <= L[k]`)) → `request_approval`,
     status `agreed_pending_approval`, code `ACCEPT_WITHIN_LIMIT`, say "Great, let me just
     confirm with Shubham and I'll come straight back to you."
   - Seller accepted an earlier offer that is now above `C` → `walk_away` (`CEILING_DROPPED`).
   - `k <= 3` → `send` `L[k]`, status `negotiating`, code `COUNTER_STEP_<k>`: "Thanks! Could you
     do £L[k]?"; final step: "£C is the best I can do. Could that work?"
   - Otherwise → `walk_away` (`OVER_BUDGET`): "Thanks, that's beyond my budget so I'll leave it.
     Good luck with the sale!"
7. **Invariants:** every offer ≤ the ceiling in force when it is made (so always ≤ M); every
   agreement ≤ the current ceiling. Throw if violated.

### 8c. Expected demo outcomes (target £220, max £260, no real listings yet so `ref` = £220)

| listing | screening | negotiation | outcome |
|---|---|---|---|
| Frank, agent | 86, contact | £210 → £235, accepted | **agreed £235** (asked £260) |
| Hana, agent | 72, contact | £220 → £270 (discloses scuff: ceiling £245) / £235 → £260 / £240 → accepts | agreed £240, final score 73 |
| Fiona, agent | 78, contact | £220 → £280 / £240 → £275 / £250 → £275 / £260 → £275 | walked away, no overlap (floor £275 > limit £260) |
| Gary, human | 73, contact | opening £170, two chases | ghosted |
| Sam, human | 56, **HIGH RISK** (new account, price too good) | opening £95, asks for bank transfer + courier + deposit | scam blocked |
| Sally, human | 83, contact | opening £185 | sold |
| Dave (58cm) | skipped: WRONG_SIZE | – | never contacted |

Fiona's ladder is £220, £240, £250, £260. Recommended deal: Frank (score 86, £235) over Hana
(73, £240).

`lib/deals.ts`: `runDecision(dealId)` loads state, runs `decide`, persists status, reason codes,
last action, agreed price, timestamps and score changes, and writes events on changes.

## 9. Remote MCP server — `app/api/[transport]/route.ts`

`${APP_URL}/api/mcp`, header `x-api-key: MCP_API_KEY` required (401 otherwise). Tools:
1. `get_brief({ hunt_id? })` → latest `grokbot` brief (or the given one): item, keywords,
   size_token, min_condition, location, availability, target_price, `market_url`
   (`APP_URL/market?hunt=<id>`), rules. Never the max.
2. `log_listing({ hunt_id, url, title, platform, asking_price, source, condition?, location?,
   seller_feedback? })` → `{ listing_id, deal_id?, verdict: contact | skip | reference_only,
   deal_score?, flags?, reason }`. `source='real'` → stored for the market reference, never
   contacted. Sandbox → matched by URL path, scored, deal created.
3. `next_move({ deal_id })` → `runDecision` output without `ceiling`. The description says: type
   `say` into that listing's chat exactly (light rephrasing allowed; £ amounts identical).
4. `request_approval({ deal_id })` → requires `agreed_pending_approval`; idempotent; creates
   the approval, sends Telegram, returns `{ approval_id, status }`.
5. `get_status({ hunt_id })` → per deal: title, status, deal_score, flags, last offer, seller
   price, market_url; pending approvals; a one-line summary.

## 10. Pages and APIs

- `/` Landing: "DealDesk — an AI agent for each side of a second-hand deal." Textarea pre-filled:
  "Road bike for commuting and weekend rides, 54cm frame, good condition. Collect in East London
  this week, weekday evenings after 6. Hoping to pay about £220, absolute max £260."
  `POST /api/briefs` → `generateObject` + zod (`LLM_SMART_MODEL`) → fields in §5; fallback to
  those demo values → editable card → **"Run the hunt"** (autopilot) and **"Start with Grok Bot"**
  (grokbot) → `/hunt/<id>`.
- `/market?hunt=<id>` Kerbside grid with banner "Kerbside is a test marketplace: sellers are
  simulated". Cards: emoji, title, £asking, condition, seller name, ★ rating (reviews),
  "🤖 Seller agent" badge for agent sellers. Search box filters by keyword. Links keep `hunt`.
- `/market/<id>?hunt=<id>` Listing: details; seller profile (rating, reviews count, member since,
  review snippets); chat (poll 2 s, "typing…" indicator); `textarea#message-input`,
  `button#send-button`. `POST /api/market/<id>/messages { hunt_id, body }` → deal if missing →
  store (parse £) → event → seller reply via `after()`. Without `hunt`, chat is read-only.
- `/hunt/<id>` **Arena** (poll `GET /api/hunt/<id>/state` every 1.5 s):
  - Header: brief; "Your secret limit £260 (hidden from sellers)"; toggle **Audience view**
    (shows seller floors; label "neither agent can see the other's limit").
  - **Screening strip:** every listing with DealScore, breakdown on hover/tap (fit, trust,
    condition, price), flags (HIGH RISK badge), skipped ones greyed with the reason.
  - **Negotiation cards**, one per contacted deal: status chip, seller type (🤖 agent / 👤
    person), and a **deal-zone bar**: asking price, the buyer's limit and the seller's floor as
    lock markers, the overlap shaded green (or "no overlap" in red), buyer offers as blue dots,
    seller counters as green dots, the agreed price as a star. Click to open the **split chat**:
    buyer agent on the left, seller on the right.
  - **Timeline** of events, newest first.
  - **Approval card:** recommended deal first with its reasons ("No issues · 4.9★ (48) · £25 under
    asking"), other agreed deals below; Approve / Decline buttons.
  - **Results panel** (appears when every deal is settled): listings screened / skipped (with
    reasons) / contacted; messages sent by the buyer agent and by seller agents; chases; scams
    blocked; walk-aways; time from first message to first agreement and total hunt time (mm:ss);
    best deal (asked → agreed, saved £ and %; vs market median if known); "Your effort: 1 brief +
    1 tap"; "Agent sellers typed 0 messages".
  - **Real market scan** panel: real listings (platform, price, seller feedback, link), median.
    Plus **Import real listings**: a textarea accepting a JSON array
    `[{title, url, platform, price, seller_feedback}]` (fallback if MCP fails).
  - Buttons: Run hunt (autopilot), Open Kerbside (grokbot), Reset hunt.
- `POST /api/autopilot/tick { hunt_id }`: first call screens every sandbox listing matching the
  keywords (creates deals, stores scores, marks skips); each call runs `runDecision` once per
  open deal and performs `send`/`chase` (same function as the market API) and `request_approval`.
  The arena calls it every 2.5 s, sequentially, until every deal is terminal, skipped or
  `agreed_pending_approval`.
- Approvals: `POST /api/approvals/<id> { decision }` (dashboard); `POST /api/telegram` webhook
  (check `X-Telegram-Bot-Api-Secret-Token`; `callback_query` data `approve:<id>` /
  `decline:<id>`; `answerCallbackQuery`; `editMessageText`); `GET /api/telegram/setup?key=<MCP_API_KEY>`
  calls `setWebhook` with `secret_token`. Telegram text: "🚲 Best deal: <title> (<seller>). Asked
  £A → agreed £S. DealScore <n>: <top reasons>. Approve?"
- **On approve:** deal `approved`; buyer message (intent `approval_confirmed`): "Brilliant,
  Shubham has approved £S. He can collect <availability>. Could you share the postcode?" →
  seller collection reply. Every other open deal gets "Thanks so much, we've found one elsewhere.
  Good luck with the sale!" (intent `close_other`) → `closed_other`; other pending approvals →
  `declined` (Telegram message edited); event `others_closed`. **On decline:** others continue.
- `POST /api/hunt/<id>/reset` deletes the hunt's deals, messages, approvals, events and real listings.

## 11. Tests (`vitest`) — README evidence

1. Opening offer within [60% of asking, target], never above asking.
2. Property test, 10,000 random negotiations (asking ≤ 1.25 × max, random floors, personas and
   minor issues): no offer above max, no agreement above the ceiling.
3. Leak test: for a full demo hunt, no `get_brief`, `log_listing`, `get_status` or pre-final
   `next_move` output contains the max or the ceiling, and nothing on the buyer side contains a
   seller floor. Use max £261 in this test so it can't collide with other amounts.
4. Scam shield: one case per code; the engine never replies to a scammer.
5. Chase → chase → ghosted; `wait` returns the remaining seconds.
6. Sold → close. Major issue → walk away.
7. Statelessness: identical decisions when called twice with no new messages.
8. The §8c table: outcomes, Dave skipped (WRONG_SIZE), Sam HIGH RISK, Hana's ceiling lowered to
   £245, Frank recommended.

## 12. Milestones (hard stops)

- **M0 11:30–11:50** Scaffold, `/api/health` (Supabase + listing count), schema + seed (Shubham
  runs them in the SQL editor), NOTES.md, push → production live.
- **M1 11:50–12:35** Landing + brief parsing; Kerbside grid, listing page with seller profile,
  chat; seller side (§7). Check: Shubham haggles with Frank by hand and Frank discloses honestly.
- **M2 12:35–13:10** `score.ts`, `engine.ts`, `deals.ts`, all tests, state API.
- **M3 13:10–13:50** Arena (screening strip, deal-zone bars, split chat, timeline, approval card
  with dashboard buttons, results panel), the full on-approve flow (collection, close others,
  supersede approvals), autopilot, import box, reset. **This is the video.** First full run by 13:50.
- **M4 13:50–14:30** MCP server (5 tools) passing Inspector; Shubham connects Grok Bot and
  records the real-market scout.
- **M5 14:30–15:05** Telegram approvals (reusing the M3 on-approve flow), then polish what looks rough on camera.
- **15:05 FEATURE FREEZE.**
- **M6 15:05–16:15** README: problem; what it does for buyers and sellers; video link;
  screenshot of the arena; mermaid diagram (Grok Bot ↔ MCP ↔ engines ↔ Kerbside / Telegram /
  arena); DealScore and engine rules; tests and results tables; what is simulated and why; next
  steps. Shubham records the video meanwhile. Submit by 16:20.

Out of scope today: payments, logins on real marketplaces, messaging real users, voice,
WhatsApp, accounts, a second Grok Bot as the seller.

## 13. Definition of done

On the production URL, "Run the hunt" screens seven bikes (Dave skipped, Sam flagged), runs six
negotiations in about two minutes with the outcomes in §8c, recommends Frank, and on approval
arranges collection and closes the others politely. The results panel shows real numbers from
that run. Tests green. README and NOTES.md complete. Grok Bot's real-market scout feeds the
market reference (via MCP or the import box).
