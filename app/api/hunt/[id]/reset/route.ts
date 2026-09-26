import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();

  // Deleting deals cascades to their messages and approvals.
  await supabase.from("deals").delete().eq("brief_id", id);
  await supabase.from("events").delete().eq("brief_id", id);
  await supabase.from("listings").delete().eq("source", "real").eq("brief_id", id);
  await supabase.from("briefs").update({ tick_lock_until: null }).eq("id", id);

  return NextResponse.json({ ok: true });
}
