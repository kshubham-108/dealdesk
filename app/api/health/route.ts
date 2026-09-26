import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from("listings")
      .select("*", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, listings: count ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, listings: 0, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
