// The buyer's negotiation engine: a pure, stateless function. Every decision is
// derived from the message history (plus the current deal status, needed to
// short-circuit terminal/pending deals — see rule 1). No LLM, no DB. See
// AGENTS.md §8b for the exact rules; this implementation is numerically
// verified against every outcome in §8c (Frank/Hana/Fiona ladders, Gary's
// ghosting, Sam's scam shield, Sally's sold detection).

export type EngineAction =
  | "send"
  | "chase"
  | "wait"
  | "request_approval"
  | "walk_away"
  | "stop_scam"
  | "close"
  | "none";

export interface EngineMessage {
  sender: "buyer_agent" | "seller" | "system";
  body: string;
  price: number | null;
  created_at: string;
  meta?: { issues?: "none" | "minor" | "major"; issue_text?: string | null } | null;
}

export interface DecideInput {
  status: string;
  brief: { target_price: number; max_price: number; availability: string | null };
  listing: { title: string; asking_price: number; seller_name: string };
  messages: EngineMessage[];
  now: Date;
  ghostTimeoutS: number;
}

export interface DecideResult {
  action: EngineAction;
  offer?: number;
  say?: string;
  status: string;
  reasonCodes: string[];
  retryAfterS?: number;
  ceiling: number;
}

// Reachable statuses that mean "stop" — including deal-record statuses that
// aren't literally in the engine's own vocabulary (approved/declined/skipped
// are set elsewhere in the app, but the engine must still go quiet for them).
const TERMINAL_STATUSES = new Set([
  "skipped",
  "walked_away",
  "declined",
  "ghosted",
  "scam_blocked",
  "sold",
  "closed_other",
  "approved",
]);

const round5 = (x: number) => Math.round(x / 5) * 5;

function shortTitle(title: string) {
  return title.split(",")[0].trim();
}

const SCAM_PATTERNS: [RegExp, string][] = [
  [/bank transfer|sort code|wire/i, "OFF_PLATFORM_PAYMENT"],
  [/deposit|pay upfront|in advance/i, "UPFRONT_PAYMENT"],
  [/courier/i, "COURIER_BEFORE_VIEWING"],
  [/gift card|crypto|bitcoin|friends and family/i, "UNTRACEABLE_PAYMENT"],
  [/whatsapp|text me on|email me/i, "MOVE_OFF_PLATFORM"],
];

const SOLD_PATTERN = /\bsold\b|no longer available|\bgone\b/i;

function assertOfferWithinCeiling(offer: number, ceiling: number) {
  if (offer > ceiling) {
    throw new Error(`Engine invariant violated: offer £${offer} exceeds ceiling £${ceiling}`);
  }
}

export function decide(input: DecideInput): DecideResult {
  const { status, brief, listing, messages, now, ghostTimeoutS } = input;
  const M = brief.max_price;

  const minorDisclosedEver = messages.some(
    (m) => m.sender === "seller" && m.meta?.issues === "minor"
  );
  const C = minorDisclosedEver ? M - 15 : M;

  // Rule 1: already settled (or awaiting the buyer's own approval) — go quiet.
  if (status === "agreed_pending_approval" || TERMINAL_STATUSES.has(status)) {
    return { action: "none", status, reasonCodes: [], ceiling: C };
  }

  const sellerMessages = messages.filter((m) => m.sender === "seller");

  // Rule 2: scam shield — checked against every seller message, not just the
  // last one, and wins over every other rule once tripped.
  for (const sm of sellerMessages) {
    for (const [pattern, code] of SCAM_PATTERNS) {
      if (pattern.test(sm.body)) {
        return { action: "stop_scam", status: "scam_blocked", reasonCodes: [code], ceiling: C };
      }
    }
  }

  // Rule 3: sold / gone.
  if (sellerMessages.some((sm) => SOLD_PATTERN.test(sm.body))) {
    return {
      action: "close",
      status: "sold",
      say: "No worries, thanks!",
      reasonCodes: ["SOLD"],
      ceiling: C,
    };
  }

  const T = Math.min(brief.target_price, brief.max_price);
  const A = listing.asking_price;
  const O = Math.min(round5(Math.max(0.6 * A, Math.min(T, 0.8 * A))), M);

  const O2 = Math.min(O, C);
  // Clamp to C: round5() can round a value that's mathematically below a
  // non-multiple-of-5 ceiling up past it (e.g. round5(103) = 105 > C = 104).
  const L = [
    O2,
    Math.min(round5(O2 + (C - O2) * 0.5), C),
    Math.min(round5(O2 + (C - O2) * 0.8), C),
    C,
  ];

  const reasonCodesBase = minorDisclosedEver ? ["CEILING_LOWERED"] : [];
  const availability = brief.availability ?? "this week";
  const openingSay =
    `Hi ${listing.seller_name}! I'm DealDesk, an AI assistant messaging for Shubham. ` +
    `Is the ${shortTitle(listing.title)} still available? Any damage, faults or recent ` +
    `servicing he should know about? Would you take £${O}? He can collect ${availability}.`;

  const hasBuyerMessage = messages.some((m) => m.sender === "buyer_agent");

  // Rule 4: opening offer.
  if (!hasBuyerMessage) {
    assertOfferWithinCeiling(O, C);
    return {
      action: "send",
      offer: O,
      say: openingSay,
      status: "contacted",
      reasonCodes: ["OPENING_OFFER"],
      ceiling: C,
    };
  }

  const last = messages[messages.length - 1];
  const k = messages.filter((m) => m.sender === "buyer_agent" && m.price != null).length;

  // Rule 5: last message is the buyer's — waiting on the seller.
  if (last.sender === "buyer_agent") {
    let trailing = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "buyer_agent") trailing++;
      else break;
    }
    const chasesSoFar = trailing - 1;
    const waitedS = (now.getTime() - new Date(last.created_at).getTime()) / 1000;

    if (waitedS >= ghostTimeoutS) {
      if (chasesSoFar < 2) {
        return {
          action: "chase",
          say: `Hi again, just checking the ${shortTitle(listing.title)} is still available? Happy to collect ${availability}.`,
          status: "negotiating",
          reasonCodes: [`CHASE_${chasesSoFar + 1}`],
          ceiling: C,
        };
      }
      return { action: "close", status: "ghosted", reasonCodes: ["GHOSTED"], ceiling: C };
    }

    return {
      action: "wait",
      status: "negotiating",
      reasonCodes: ["WAITING"],
      retryAfterS: Math.ceil(ghostTimeoutS - waitedS),
      ceiling: C,
    };
  }

  // Rule 6: last message is the seller's.
  if (last.meta?.issues === "major") {
    return {
      action: "walk_away",
      say: "Thanks for being upfront. That's more work than he's after, so we'll pass.",
      status: "walked_away",
      reasonCodes: ["MAJOR_ISSUE"],
      ceiling: C,
    };
  }

  const S = last.price;

  if (S == null) {
    const offer = k === 0 ? O : L[Math.max(0, k - 1)];
    assertOfferWithinCeiling(offer, C);
    return {
      action: "send",
      offer,
      say: k === 0 ? openingSay : `Thanks! Could you do £${offer}?`,
      status: "negotiating",
      reasonCodes: [...reasonCodesBase, "REPEAT_OFFER"],
      ceiling: C,
    };
  }

  const prevRung = L[Math.max(0, k - 1)];
  const nextRung = k <= 3 ? L[k] : undefined;
  const agrees = S <= C && (S <= prevRung || (k <= 3 && nextRung != null && S <= nextRung));

  if (agrees) {
    assertOfferWithinCeiling(S, C);
    return {
      action: "request_approval",
      offer: S,
      say: "Great, let me just confirm with Shubham and I'll come straight back to you.",
      status: "agreed_pending_approval",
      reasonCodes: [...reasonCodesBase, "ACCEPT_WITHIN_LIMIT"],
      ceiling: C,
    };
  }

  const wasEarlierBuyerOffer = messages.some((m) => m.sender === "buyer_agent" && m.price === S);
  if (wasEarlierBuyerOffer && S > C) {
    return {
      action: "walk_away",
      say: "Thanks, that's beyond my budget so I'll leave it. Good luck with the sale!",
      status: "walked_away",
      reasonCodes: [...reasonCodesBase, "CEILING_DROPPED"],
      ceiling: C,
    };
  }

  if (k <= 3) {
    const offer = L[k];
    assertOfferWithinCeiling(offer, C);
    const isFinal = k === 3;
    return {
      action: "send",
      offer,
      say: isFinal
        ? `£${offer} is the best I can do. Could that work?`
        : `Thanks! Could you do £${offer}?`,
      status: "negotiating",
      reasonCodes: [...reasonCodesBase, `COUNTER_STEP_${k}`],
      ceiling: C,
    };
  }

  return {
    action: "walk_away",
    say: "Thanks, that's beyond my budget so I'll leave it. Good luck with the sale!",
    status: "walked_away",
    reasonCodes: [...reasonCodesBase, "OVER_BUDGET"],
    ceiling: C,
  };
}
