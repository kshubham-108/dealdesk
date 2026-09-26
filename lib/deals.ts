import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decide, type EngineMessage } from "./engine";
import { dealScore, shouldContact, type Disclosure } from "./score";
import { sendSellerReply } from "./seller";

export async function getOrCreateDeal(
  supabase: SupabaseClient,
  briefId: string,
  listingId: string
) {
  const { data: existing } = await supabase
    .from("deals")
    .select("*")
    .eq("brief_id", briefId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("deals")
    .insert({ brief_id: briefId, listing_id: listingId })
    .select("*")
    .single();

  if (error) throw error;
  return created;
}

const TERMINAL_OR_SKIPPED = new Set([
  "skipped",
  "walked_away",
  "declined",
  "ghosted",
  "scam_blocked",
  "sold",
  "closed_other",
  "approved",
]);

export async function computeMarketRef(
  supabase: SupabaseClient,
  briefId: string,
  targetPrice: number
): Promise<number> {
  const { data: realListings } = await supabase
    .from("listings")
    .select("asking_price")
    .eq("source", "real")
    .eq("brief_id", briefId);

  const prices = (realListings ?? []).map((l) => l.asking_price as number);
  if (prices.length >= 3) {
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }
  return targetPrice;
}

export function currentDisclosure(messages: { sender: string; meta?: { issues?: string } | null }[]): Disclosure {
  const hasMajor = messages.some((m) => m.sender === "seller" && m.meta?.issues === "major");
  if (hasMajor) return "major";
  const hasMinor = messages.some((m) => m.sender === "seller" && m.meta?.issues === "minor");
  if (hasMinor) return "minor";
  return "none";
}

// Screens every sandbox listing not yet screened for this hunt: contact-worthy
// listings become deals in status 'new' (the tick loop then drives them
// through the engine); the rest become 'skipped' with a reason, terminally.
export async function screenListingsForHunt(supabase: SupabaseClient, briefId: string) {
  const { data: brief } = await supabase.from("briefs").select("*").eq("id", briefId).single();
  if (!brief) return;

  const { data: existingDeals } = await supabase
    .from("deals")
    .select("listing_id")
    .eq("brief_id", briefId);
  const alreadyScreened = new Set((existingDeals ?? []).map((d) => d.listing_id as string));

  const { data: listings } = await supabase.from("listings").select("*").eq("source", "sandbox");
  const marketRef = await computeMarketRef(supabase, briefId, brief.target_price);

  for (const listing of listings ?? []) {
    if (alreadyScreened.has(listing.id)) continue;

    const result = dealScore({
      listing,
      brief: {
        keywords: brief.keywords,
        size_token: brief.size_token,
        min_condition: brief.min_condition,
        max_price: brief.max_price,
      },
      marketRef,
    });

    const contact = shouldContact(result);

    const { data: deal } = await supabase
      .from("deals")
      .insert({
        brief_id: briefId,
        listing_id: listing.id,
        status: contact ? "new" : "skipped",
        deal_score: result.total,
        score: result,
      })
      .select("*")
      .single();

    await supabase.from("events").insert({
      brief_id: briefId,
      deal_id: deal?.id,
      kind: contact ? "listing_screened" : "listing_skipped",
      detail: {
        title: listing.title,
        total: result.total,
        skipReason: result.skipReason,
        flags: result.flags,
      },
    });
  }
}

// Runs the engine once for a single deal and persists whatever it decided.
export async function runDecision(
  supabase: SupabaseClient,
  dealId: string,
  ghostTimeoutS: number
) {
  const { data: deal } = await supabase
    .from("deals")
    .select("*, listings(*), briefs(*)")
    .eq("id", dealId)
    .single();
  if (!deal || deal.status === "skipped") return null;

  const listing = deal.listings;
  const brief = deal.briefs;

  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  const messages: EngineMessage[] = (rawMessages ?? []).map((m) => ({
    sender: m.sender,
    body: m.body,
    price: m.price,
    created_at: m.created_at,
    meta: m.meta,
  }));

  const result = decide({
    status: deal.status,
    brief: {
      target_price: brief.target_price,
      max_price: brief.max_price,
      availability: brief.availability,
    },
    listing: {
      title: listing.title,
      asking_price: listing.asking_price,
      seller_name: listing.seller_name,
    },
    messages,
    now: new Date(),
    ghostTimeoutS,
  });

  if (result.action === "none" || result.action === "wait") return result;

  const nowIso = new Date().toISOString();

  if (result.say) {
    await supabase.from("messages").insert({
      deal_id: dealId,
      sender: "buyer_agent",
      body: result.say,
      price: result.offer ?? null,
    });
    await supabase.from("events").insert({
      brief_id: deal.brief_id,
      deal_id: dealId,
      kind: "message_sent",
      detail: { sender: "buyer_agent", price: result.offer ?? null, reasonCodes: result.reasonCodes },
    });

    // Only 'send'/'chase' expect a seller reply — 'request_approval's
    // confirmation message doesn't (the seller hears back on actual approval).
    if (result.action === "send" || result.action === "chase") {
      after(() => sendSellerReply(supabase, dealId, result.say as string));
    }
  }

  const updates: Record<string, unknown> = {
    status: result.status,
    last_action: result.reasonCodes[result.reasonCodes.length - 1] ?? result.action,
    reason_codes: result.reasonCodes,
    updated_at: nowIso,
  };

  if (result.status === "contacted" && !deal.first_contact_at) {
    updates.first_contact_at = nowIso;
  }

  if (result.action === "request_approval") {
    updates.agreed_price = result.offer;
    updates.agreed_at = nowIso;

    const marketRef = await computeMarketRef(supabase, deal.brief_id, brief.target_price);
    const disclosure = currentDisclosure(messages);
    const finalScore = dealScore({
      listing,
      brief: {
        keywords: brief.keywords,
        size_token: brief.size_token,
        min_condition: brief.min_condition,
        max_price: brief.max_price,
      },
      marketRef,
      disclosure,
      agreedPrice: result.offer,
    });
    updates.deal_score = finalScore.total;
    updates.score = finalScore;
  }

  await supabase.from("deals").update(updates).eq("id", dealId);

  if (result.action === "request_approval") {
    await ensureApproval(supabase, deal.brief_id, dealId, result.offer as number);
    await supabase
      .from("events")
      .insert({ brief_id: deal.brief_id, deal_id: dealId, kind: "deal_agreed", detail: { price: result.offer } });
  }

  const eventKindByStatus: Record<string, string> = {
    scam_blocked: "scam_blocked",
    sold: "sold_detected",
    ghosted: "ghosted",
    walked_away: "walked_away",
  };
  const eventKind = eventKindByStatus[result.status];
  if (eventKind) {
    await supabase
      .from("events")
      .insert({ brief_id: deal.brief_id, deal_id: dealId, kind: eventKind, detail: { reasonCodes: result.reasonCodes } });
  }

  return result;
}

export async function ensureApproval(
  supabase: SupabaseClient,
  briefId: string,
  dealId: string,
  price: number
) {
  const { data: existing } = await supabase
    .from("approvals")
    .select("*")
    .eq("deal_id", dealId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("approvals")
    .insert({ deal_id: dealId, price })
    .select("*")
    .single();
  if (error) throw error;

  await supabase
    .from("events")
    .insert({ brief_id: briefId, deal_id: dealId, kind: "approval_requested", detail: { price } });

  return created;
}

// The full on-approve flow: mark this deal approved, tell the seller (which
// triggers their collection reply), close every other still-open deal in the
// hunt, and supersede any other pending approvals.
export async function approveDeal(supabase: SupabaseClient, approvalId: string) {
  const { data: approval } = await supabase.from("approvals").select("*").eq("id", approvalId).single();
  if (!approval || approval.status !== "pending") return { ok: false };

  const { data: deal } = await supabase
    .from("deals")
    .select("*, listings(*), briefs(*)")
    .eq("id", approval.deal_id)
    .single();
  if (!deal) return { ok: false };

  const nowIso = new Date().toISOString();

  await supabase
    .from("approvals")
    .update({ status: "approved", decided_at: nowIso })
    .eq("id", approvalId);

  await supabase
    .from("deals")
    .update({ status: "approved", updated_at: nowIso })
    .eq("id", deal.id);

  const availability = deal.briefs.availability ?? "this week";
  const confirmBody = `Brilliant, Shubham has approved £${approval.price}. He can collect ${availability}. Could you share the postcode?`;

  await supabase.from("messages").insert({
    deal_id: deal.id,
    sender: "buyer_agent",
    body: confirmBody,
    price: approval.price,
    intent: "approval_confirmed",
  });

  after(() => sendSellerReply(supabase, deal.id, confirmBody, "approval_confirmed"));

  await supabase
    .from("events")
    .insert({ brief_id: deal.brief_id, deal_id: deal.id, kind: "approval_approved", detail: { price: approval.price } });

  // Close every other deal still in play for this hunt.
  const { data: otherDeals } = await supabase
    .from("deals")
    .select("*")
    .eq("brief_id", deal.brief_id)
    .neq("id", deal.id);

  for (const other of otherDeals ?? []) {
    if (TERMINAL_OR_SKIPPED.has(other.status)) continue;
    await supabase.from("messages").insert({
      deal_id: other.id,
      sender: "buyer_agent",
      body: "Thanks so much, we've found one elsewhere. Good luck with the sale!",
      intent: "close_other",
    });
    await supabase.from("deals").update({ status: "closed_other", updated_at: nowIso }).eq("id", other.id);
  }

  // Supersede every other pending approval.
  const otherDealIds = (otherDeals ?? []).map((d) => d.id);
  if (otherDealIds.length > 0) {
    await supabase
      .from("approvals")
      .update({ status: "declined", decided_at: nowIso })
      .eq("status", "pending")
      .neq("id", approvalId)
      .in("deal_id", otherDealIds);
  }

  await supabase
    .from("events")
    .insert({ brief_id: deal.brief_id, deal_id: deal.id, kind: "others_closed", detail: {} });

  return { ok: true, deal, approval, confirmBody };
}

export async function declineApproval(supabase: SupabaseClient, approvalId: string) {
  const { data: approval } = await supabase.from("approvals").select("*").eq("id", approvalId).single();
  if (!approval || approval.status !== "pending") return { ok: false };

  const { data: deal } = await supabase.from("deals").select("id, brief_id").eq("id", approval.deal_id).single();
  if (!deal) return { ok: false };

  const nowIso = new Date().toISOString();
  await supabase.from("approvals").update({ status: "declined", decided_at: nowIso }).eq("id", approvalId);
  await supabase.from("deals").update({ status: "declined", updated_at: nowIso }).eq("id", deal.id);

  await supabase
    .from("events")
    .insert({ brief_id: deal.brief_id, deal_id: deal.id, kind: "approval_declined", detail: {} });

  return { ok: true };
}
