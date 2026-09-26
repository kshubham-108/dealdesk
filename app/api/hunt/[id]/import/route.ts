import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportedListing {
  title: string;
  url?: string;
  platform: string;
  price: number;
  seller_feedback?: string;
}

// Fallback for the real-market scan when Grok Bot / MCP isn't wired up: a
// plain JSON array pasted into the arena's import box. Always source='real'
// — never contacted, only used as a market reference for DealScore's price
// component and the results panel's median comparison.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "expected a JSON array of listings" }, { status: 400 });
  }

  const rows = (body as ImportedListing[])
    .filter((l) => l && typeof l.title === "string" && typeof l.platform === "string" && typeof l.price === "number")
    .map((l) => ({
      source: "real" as const,
      platform: l.platform,
      url: l.url ?? null,
      title: l.title,
      asking_price: l.price,
      seller_feedback: l.seller_feedback ?? null,
      brief_id: id,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "no valid listings found" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("listings").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: rows.length });
}
