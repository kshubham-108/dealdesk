import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePrice } from "./price";

export type Persona =
  | "agent_fair"
  | "agent_haggler"
  | "agent_firm"
  | "human_ghost"
  | "human_scammer"
  | "human_sold";

export type SellerIntent = "accept" | "counter" | "availability";

const CONCESSION: Partial<Record<Persona, number>> = {
  agent_fair: 0.5,
  agent_firm: 0.1,
  agent_haggler: 0.35,
};

const STYLE: Partial<Record<Persona, string>> = {
  agent_fair: "friendly and warm",
  agent_firm: "terse and businesslike, no small talk",
  agent_haggler: "chatty and informal",
};

const TERMINAL_STATUSES = [
  "walked_away",
  "declined",
  "ghosted",
  "scam_blocked",
  "sold",
  "closed_other",
  "approved",
];

export const SCAM_MESSAGE =
  "Yes available!! Perfect condition, no issues. I'm working offshore so " +
  "can't meet. Pay by bank transfer and I'll send it by courier today, " +
  "just need a £50 deposit to hold it.";

export const SOLD_MESSAGE = "Sorry, it sold this morning!";

export const CONDITION_QUESTION_PATTERN = /damage|fault|condition|issue|scratch|wear|broken/i;
const CONDITION_QUESTION = CONDITION_QUESTION_PATTERN;

const round5 = (x: number) => Math.round(x / 5) * 5;

// Pure pricing decision (AGENTS.md §7) — the only place seller price logic
// lives. Deal-agent personas only; sold/scammer/ghost personas short-circuit
// before this is ever called. Never pass the floor anywhere but here.
export function decideSellerOffer(params: {
  persona: Persona;
  askingPrice: number;
  floorPrice: number;
  buyerOffer: number | null;
  prevSellerOffer: number | null;
}): { intent: SellerIntent; price: number } {
  if (params.buyerOffer == null) {
    return { intent: "availability", price: params.askingPrice };
  }
  if (params.buyerOffer >= params.floorPrice) {
    return { intent: "accept", price: params.buyerOffer };
  }
  const concession = CONCESSION[params.persona] ?? 0.3;
  const prev = params.prevSellerOffer ?? params.askingPrice;
  return {
    intent: "counter",
    price: Math.max(
      params.floorPrice,
      round5(prev - (prev - params.buyerOffer) * concession)
    ),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayS(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Called from after() on the buyer's message route — never awaited by the
// request itself, so it must not throw uncaught. `intent: "approval_confirmed"`
// is the one exception to the terminal-status silence: it's how the seller
// arranges collection right after the buyer approves.
export async function sendSellerReply(
  supabase: SupabaseClient,
  dealId: string,
  buyerMessageBody: string,
  explicitIntent?: "approval_confirmed"
) {
  try {
    await runSellerReply(supabase, dealId, buyerMessageBody, explicitIntent);
  } catch (err) {
    console.error("seller reply failed", dealId, err);
  }
}

async function runSellerReply(
  supabase: SupabaseClient,
  dealId: string,
  buyerMessageBody: string,
  explicitIntent?: "approval_confirmed"
) {
  const { data: deal } = await supabase
    .from("deals")
    .select("*, listings(*)")
    .eq("id", dealId)
    .single();
  if (!deal) return;

  const listing = deal.listings as Record<string, unknown>;
  const persona = listing.persona as Persona;

  if (explicitIntent === "approval_confirmed") {
    if (persona === "human_ghost" || persona === "human_scammer" || persona === "human_sold") return;
    await sleep(randomDelayS(2, 4) * 1000);
    const location = (listing.location as string | null) ?? "the usual spot";
    const body = `Great, I'm around after 6 near ${location}. I'll send the exact address nearer the time.`;
    await insertSellerMessage(supabase, dealId, body, null, "collection", {});
    await logEvent(supabase, deal.brief_id, dealId, "collection_arranged", {});
    return;
  }

  // No reply at all once the deal is terminal or awaiting buyer approval.
  if (deal.status === "agreed_pending_approval" || TERMINAL_STATUSES.includes(deal.status)) {
    return;
  }

  if (persona === "human_ghost") return;

  if (persona === "human_sold") {
    await sleep(randomDelayS(5, 5) * 1000);
    await insertSellerMessage(supabase, dealId, SOLD_MESSAGE, null, "sold", {});
    await logEvent(supabase, deal.brief_id, dealId, "seller_replied", { intent: "sold" });
    return;
  }

  if (persona === "human_scammer") {
    await sleep(randomDelayS(3, 5) * 1000);
    await insertSellerMessage(supabase, dealId, SCAM_MESSAGE, null, "scam", {});
    await logEvent(supabase, deal.brief_id, dealId, "seller_replied", { intent: "scam" });
    return;
  }

  // Seller agents (fair / haggler / firm): deterministic price, LLM wording.
  const { data: priorMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  const priorSellerMsgs = (priorMessages ?? []).filter((m) => m.sender === "seller");
  const isFirstReply = priorSellerMsgs.length === 0;
  const lastSellerPriceMsg = [...priorSellerMsgs].reverse().find((m) => m.price != null);

  const askingPrice = listing.asking_price as number;
  const floor = listing.floor_price as number;
  const buyerOffer = parsePrice(buyerMessageBody);

  const { intent, price } = decideSellerOffer({
    persona,
    askingPrice,
    floorPrice: floor,
    buyerOffer,
    prevSellerOffer: lastSellerPriceMsg ? (lastSellerPriceMsg.price as number) : null,
  });

  const knownIssueText = listing.known_issue as string | null;
  const askedAboutCondition = CONDITION_QUESTION.test(buyerMessageBody);
  const includeDisclosure = (isFirstReply || askedAboutCondition) && !!knownIssueText;

  await sleep(randomDelayS(2, 4) * 1000);

  const template = buildTemplate({ intent, price, knownIssueText, includeDisclosure });
  const body = await phraseWithLLM({
    template,
    persona,
    price,
    intent,
    includeDisclosure,
    knownIssueText,
  });

  const meta = includeDisclosure
    ? { issues: listing.issue_severity, issue_text: knownIssueText }
    : {};

  await insertSellerMessage(
    supabase,
    dealId,
    body,
    intent === "availability" ? null : price,
    intent,
    meta
  );

  if (includeDisclosure) {
    await logEvent(supabase, deal.brief_id, dealId, "issue_disclosed", {
      severity: listing.issue_severity,
    });
  }
  await logEvent(supabase, deal.brief_id, dealId, "seller_replied", { intent, price });
}

function buildTemplate({
  intent,
  price,
  knownIssueText,
  includeDisclosure,
}: {
  intent: "accept" | "counter" | "availability";
  price: number;
  knownIssueText: string | null;
  includeDisclosure: boolean;
}) {
  let msg = "Hi! Yes, it's available.";
  if (includeDisclosure && knownIssueText) {
    msg += ` ${knownIssueText}`;
  }
  if (intent === "accept") {
    msg += ` £${price} works for me.`;
  } else if (intent === "counter") {
    msg += ` I could do £${price}.`;
  }
  return msg;
}

async function phraseWithLLM(args: {
  template: string;
  persona: Persona;
  price: number;
  intent: "accept" | "counter" | "availability";
  includeDisclosure: boolean;
  knownIssueText: string | null;
}) {
  const model = process.env.LLM_FAST_MODEL;
  if (!model) return args.template;

  const style = STYLE[args.persona] ?? "friendly";

  const priceClause =
    args.intent === "accept"
      ? `You are accepting the buyer's offer of exactly £${args.price}.`
      : args.intent === "counter"
        ? `You are countering with exactly £${args.price}.`
        : `You are just confirming the item is available. Do not state any price.`;

  const disclosureClause =
    args.includeDisclosure && args.knownIssueText
      ? ` You must also honestly mention this, in your own words but keeping its meaning: "${args.knownIssueText}"`
      : "";

  try {
    const { text } = await generateText({
      model,
      system:
        `You are a private seller replying to a buyer's message about a second-hand item on a test marketplace. ` +
        `Style: ${style}. Maximum 2 sentences. Start by confirming the item is available. ` +
        `Never mention any price other than the one given. Never invent extra details about the item.`,
      prompt: `${priceClause}${disclosureClause}`,
    });

    const trimmed = text.trim();
    if (!trimmed) return args.template;

    if (args.intent !== "availability" && !trimmed.includes(`£${args.price}`)) {
      return args.template;
    }

    return trimmed;
  } catch {
    return args.template;
  }
}

async function insertSellerMessage(
  supabase: SupabaseClient,
  dealId: string,
  body: string,
  price: number | null,
  intent: string,
  meta: Record<string, unknown>
) {
  await supabase.from("messages").insert({
    deal_id: dealId,
    sender: "seller",
    body,
    price,
    intent,
    meta,
  });
}

async function logEvent(
  supabase: SupabaseClient,
  briefId: string,
  dealId: string,
  kind: string,
  detail: Record<string, unknown>
) {
  await supabase.from("events").insert({ brief_id: briefId, deal_id: dealId, kind, detail });
}
