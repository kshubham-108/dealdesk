import type { SupabaseClient } from "@supabase/supabase-js";

export async function getLatestBriefId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("briefs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getHuntState(supabase: SupabaseClient, briefId: string) {
  const { data: brief } = await supabase.from("briefs").select("*").eq("id", briefId).maybeSingle();
  if (!brief) return null;

  const { data: deals } = await supabase.from("deals").select("*, listings(*)").eq("brief_id", briefId);
  const dealIds = (deals ?? []).map((d) => d.id as string);

  const { data: messages } =
    dealIds.length > 0
      ? await supabase.from("messages").select("*").in("deal_id", dealIds).order("created_at")
      : { data: [] };

  const { data: approvals } =
    dealIds.length > 0
      ? await supabase.from("approvals").select("*").in("deal_id", dealIds).order("created_at")
      : { data: [] };

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("brief_id", briefId)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: realListings } = await supabase
    .from("listings")
    .select("*")
    .eq("source", "real")
    .eq("brief_id", briefId);

  const messagesByDeal = new Map<string, Record<string, unknown>[]>();
  for (const m of messages ?? []) {
    const list = messagesByDeal.get(m.deal_id) ?? [];
    list.push(m);
    messagesByDeal.set(m.deal_id, list);
  }

  const dealsOut = (deals ?? []).map((d) => ({
    id: d.id as string,
    listing_id: d.listing_id as string,
    title: d.listings.title as string,
    emoji: d.listings.emoji as string | null,
    asking_price: d.listings.asking_price as number,
    seller_name: d.listings.seller_name as string,
    seller_mode: d.listings.seller_mode as string,
    persona: d.listings.persona as string,
    // Dashboard-only (audience view) — never leaked to the seller side or an LLM prompt.
    floor_price: d.listings.floor_price as number | null,
    known_issue: d.listings.known_issue as string | null,
    issue_severity: d.listings.issue_severity as string,
    seller_rating: d.listings.seller_rating as number | null,
    seller_reviews_count: d.listings.seller_reviews_count as number,
    status: d.status as string,
    deal_score: d.deal_score as number | null,
    score: d.score,
    agreed_price: d.agreed_price as number | null,
    reason_codes: (d.reason_codes ?? []) as string[],
    last_action: d.last_action as string | null,
    first_contact_at: d.first_contact_at as string | null,
    agreed_at: d.agreed_at as string | null,
    messages: messagesByDeal.get(d.id) ?? [],
  }));

  const pendingApprovals = (approvals ?? []).filter((a) => a.status === "pending");
  const agreedDeals = dealsOut.filter((d) => d.status === "agreed_pending_approval");
  const recommended = [...agreedDeals].sort(
    (a, b) => (b.deal_score ?? 0) - (a.deal_score ?? 0) || (a.agreed_price ?? 0) - (b.agreed_price ?? 0)
  )[0];
  const recommendedApproval = recommended
    ? pendingApprovals.find((a) => a.deal_id === recommended.id)
    : undefined;

  return {
    brief,
    deals: dealsOut,
    approvals: approvals ?? [],
    pending_approvals: pendingApprovals,
    recommended_approval_id: recommendedApproval?.id ?? null,
    events: events ?? [],
    real_listings: realListings ?? [],
  };
}

export type HuntState = NonNullable<Awaited<ReturnType<typeof getHuntState>>>;
export type HuntDeal = HuntState["deals"][number];
