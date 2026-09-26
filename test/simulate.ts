// Full negotiation simulator for tests: replays the buyer<->seller exchange
// using the real engine (lib/engine.ts) and the real pure seller pricing
// decision (lib/seller.ts's decideSellerOffer), so tests exercise the exact
// code paths the running app uses — not a re-implementation of the rules.
import { decide, type EngineMessage, type DecideResult } from "../lib/engine";
import {
  decideSellerOffer,
  CONDITION_QUESTION_PATTERN,
  SCAM_MESSAGE,
  SOLD_MESSAGE,
} from "../lib/seller";
import type { DemoListing } from "./fixtures";

export interface SimBrief {
  target_price: number;
  max_price: number;
  availability: string | null;
}

export interface SimResult {
  status: string;
  messages: EngineMessage[];
  decisions: DecideResult[];
}

export function simulateNegotiation(
  brief: SimBrief,
  listing: DemoListing,
  opts: { ghostTimeoutS?: number; maxRounds?: number } = {}
): SimResult {
  const ghostTimeoutS = opts.ghostTimeoutS ?? 20;
  const maxRounds = opts.maxRounds ?? 20;

  let status = "new";
  const messages: EngineMessage[] = [];
  const decisions: DecideResult[] = [];
  let lastSellerOffer: number | null = null;
  let sellerRepliesSoFar = 0;
  let start = Date.now();

  for (let round = 0; round < maxRounds; round++) {
    const now = new Date(start + round * (ghostTimeoutS + 1) * 1000);

    const result = decide({
      status,
      brief,
      listing: {
        title: listing.title,
        asking_price: listing.asking_price,
        seller_name: listing.seller_name,
      },
      messages,
      now,
      ghostTimeoutS,
    });

    status = result.status;
    decisions.push(result);

    const buyerActions = new Set(["send", "chase", "request_approval"]);
    if (result.say && buyerActions.has(result.action)) {
      messages.push({
        sender: "buyer_agent",
        body: result.say,
        price: result.offer ?? null,
        created_at: now.toISOString(),
      });
    }

    if (["none", "stop_scam", "close", "walk_away", "request_approval"].includes(result.action)) {
      break;
    }

    if (result.action === "wait") continue;

    if (listing.persona === "human_ghost") continue; // never replies

    const replyNow = new Date(now.getTime() + 1000);

    if (listing.persona === "human_sold") {
      messages.push({ sender: "seller", body: SOLD_MESSAGE, price: null, created_at: replyNow.toISOString() });
      continue;
    }
    if (listing.persona === "human_scammer") {
      messages.push({ sender: "seller", body: SCAM_MESSAGE, price: null, created_at: replyNow.toISOString() });
      continue;
    }

    const buyerMsg = messages[messages.length - 1];
    const buyerOffer = buyerMsg.price;
    const { intent, price } = decideSellerOffer({
      persona: listing.persona,
      askingPrice: listing.asking_price,
      floorPrice: listing.floor_price ?? 0,
      buyerOffer,
      prevSellerOffer: lastSellerOffer,
    });

    const isFirstReply = sellerRepliesSoFar === 0;
    const askedAboutCondition = CONDITION_QUESTION_PATTERN.test(buyerMsg.body);
    const includeDisclosure = (isFirstReply || askedAboutCondition) && !!listing.known_issue;
    sellerRepliesSoFar++;
    if (intent !== "availability") lastSellerOffer = price;

    messages.push({
      sender: "seller",
      body: `seller ${intent} £${price}`,
      price: intent === "availability" ? null : price,
      created_at: replyNow.toISOString(),
      meta: includeDisclosure
        ? { issues: listing.issue_severity ?? "none", issue_text: listing.known_issue }
        : undefined,
    });
  }

  return { status, messages, decisions };
}
