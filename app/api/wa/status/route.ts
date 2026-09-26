import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkApiKey, buildStatusReply } from "@/lib/wa";
import { getHuntState, getLatestBriefId } from "@/lib/huntState";
import { runOneTickEnsured, ghostTimeoutSeconds } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const briefId = await getLatestBriefId(supabase);
  if (!briefId) {
    return NextResponse.json({
      reply: "No hunt running yet. Tell me what you're looking for to start one.",
    });
  }

  await runOneTickEnsured(supabase, briefId, ghostTimeoutSeconds());

  const state = await getHuntState(supabase, briefId);
  if (!state) {
    return NextResponse.json({
      reply: "No hunt running yet. Tell me what you're looking for to start one.",
    });
  }

  return NextResponse.json({
    reply: buildStatusReply(state),
    pending_approvals: state.pending_approvals,
    recommended_approval_id: state.recommended_approval_id,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
