import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getHuntState } from "@/lib/huntState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();
  const state = await getHuntState(supabase, id);
  if (!state) return NextResponse.json({ error: "hunt not found" }, { status: 404 });
  return NextResponse.json(state);
}
