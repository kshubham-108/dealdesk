import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { runOneTick, ghostTimeoutSeconds } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const huntId = body?.hunt_id;

  if (typeof huntId !== "string" || !huntId) {
    return NextResponse.json({ error: "hunt_id is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const result = await runOneTick(supabase, huntId, ghostTimeoutSeconds());

  return NextResponse.json(result);
}
