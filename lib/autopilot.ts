import type { SupabaseClient } from "@supabase/supabase-js";
import { screenListingsForHunt, runDecision } from "./deals";

const LOCK_DURATION_MS = 4000;

// §14.4: concurrent drivers (arena poller, WhatsApp status/start, a second
// browser tab) must never double-send. Whoever flips tick_lock_until from
// null/past into the future owns this tick; everyone else gets {skipped:true}.
export async function tryAcquireTickLock(
  supabase: SupabaseClient,
  briefId: string
): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();

  const { data, error } = await supabase
    .from("briefs")
    .update({ tick_lock_until: lockUntil })
    .eq("id", briefId)
    .or(`tick_lock_until.is.null,tick_lock_until.lt.${now.toISOString()}`)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function runOneTick(
  supabase: SupabaseClient,
  briefId: string,
  ghostTimeoutS: number
): Promise<{ skipped: boolean; ran?: number }> {
  const acquired = await tryAcquireTickLock(supabase, briefId);
  if (!acquired) return { skipped: true };

  const { data: existingDeals } = await supabase.from("deals").select("id").eq("brief_id", briefId);
  if (!existingDeals || existingDeals.length === 0) {
    await screenListingsForHunt(supabase, briefId);
  }

  const { data: openDeals } = await supabase
    .from("deals")
    .select("id")
    .eq("brief_id", briefId)
    .neq("status", "skipped");

  let ran = 0;
  for (const deal of openDeals ?? []) {
    await runDecision(supabase, deal.id, ghostTimeoutS);
    ran++;
  }

  return { skipped: false, ran };
}

export function ghostTimeoutSeconds(): number {
  const raw = process.env.GHOST_TIMEOUT_SECONDS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 20;
}
