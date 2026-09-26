import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { approveDeal, declineApproval } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const decision = body?.decision;

  if (decision !== "approved" && decision !== "declined") {
    return NextResponse.json({ error: "decision must be 'approved' or 'declined'" }, { status: 400 });
  }

  const supabase = getSupabase();
  const result =
    decision === "approved" ? await approveDeal(supabase, id) : await declineApproval(supabase, id);

  if (!result.ok) {
    return NextResponse.json({ error: "approval not pending" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: decision });
}
