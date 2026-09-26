import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkApiKey, readParams, buildStatusReply } from "@/lib/wa";
import { getHuntState, getLatestBriefId } from "@/lib/huntState";
import { approveDeal } from "@/lib/deals";

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
    return NextResponse.json({ reply: "No hunt running yet." });
  }

  const state = await getHuntState(supabase, briefId);
  if (!state || state.pending_approvals.length === 0) {
    return NextResponse.json({ reply: state ? buildStatusReply(state) : "No hunt running yet." });
  }

  const params = await readParams(req);
  const choice = params.choice;

  let approvalId = state.recommended_approval_id ?? undefined;
  if (choice) {
    const match = state.pending_approvals.find((a) => {
      const deal = state.deals.find((d) => d.id === a.deal_id);
      return deal && deal.seller_name.toLowerCase().includes(choice.toLowerCase());
    });
    if (match) approvalId = match.id;
  }
  if (!approvalId) approvalId = state.pending_approvals[0].id;

  const targetApproval = state.pending_approvals.find((a) => a.id === approvalId);
  const dealBefore = state.deals.find((d) => d.id === targetApproval?.deal_id);

  const result = await approveDeal(supabase, approvalId);
  if (!result.ok || !dealBefore || !targetApproval) {
    const freshState = await getHuntState(supabase, briefId);
    return NextResponse.json({
      reply: freshState ? buildStatusReply(freshState) : "Something went wrong.",
    });
  }

  const reply =
    `Approved: ${dealBefore.title} for £${targetApproval.price}. I've asked ${dealBefore.seller_name} ` +
    `for the postcode and thanked the other sellers.`;

  return NextResponse.json({ reply });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
