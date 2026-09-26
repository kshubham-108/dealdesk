import type { SupabaseClient } from "@supabase/supabase-js";

// M1 only needs find-or-create: the negotiation engine (runDecision) that owns
// status transitions arrives in M2 (lib/engine.ts, lib/score.ts).
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
