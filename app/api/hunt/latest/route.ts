import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getHuntState, getLatestBriefId } from "@/lib/huntState";
import { computeResults } from "@/lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();
  const briefId = await getLatestBriefId(supabase);
  if (!briefId) return NextResponse.json({ error: "no hunt yet" }, { status: 404 });

  const state = await getHuntState(supabase, briefId);
  if (!state) return NextResponse.json({ error: "no hunt yet" }, { status: 404 });

  return NextResponse.json({ ...state, results: computeResults(state) });
}
