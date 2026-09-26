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

// /api/autopilot/tick keeps the plain skip-on-contention behaviour (that's
// the point of the lock for a poller that will just try again in 2.5s). The
// WhatsApp endpoints promise the human a tick happened before they reply, so
// they use this instead: retry through transient lock contention rather than
// silently no-op.
export async function runOneTickEnsured(
  supabase: SupabaseClient,
  briefId: string,
  ghostTimeoutS: number,
  maxAttempts = 5
): Promise<{ skipped: boolean; ran?: number }> {
  let result: { skipped: boolean; ran?: number } = { skipped: true };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    result = await runOneTick(supabase, briefId, ghostTimeoutS);
    if (!result.skipped) return result;
    await new Promise((resolve) => setTimeout(resolve, 300 + attempt * 200));
  }
  return result;
}

export function ghostTimeoutSeconds(): number {
  const raw = process.env.GHOST_TIMEOUT_SECONDS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 20;
}
