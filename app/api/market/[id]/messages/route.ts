import { after, NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getOrCreateDeal } from "@/lib/deals";
import { sendSellerReply } from "@/lib/seller";
import { parsePrice } from "@/lib/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Typing indicator caps out after the slowest seller delay (5s) plus LLM
// generation time; this is a display heuristic, not persisted state.
const TYPING_WINDOW_MS = 12000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const huntId = req.nextUrl.searchParams.get("hunt");

  if (!huntId) {
    return NextResponse.json({ messages: [], typing: false });
  }

  const supabase = getSupabase();

  const { data: listing } = await supabase
    .from("listings")
    .select("persona")
    .eq("id", id)
    .maybeSingle();

  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("brief_id", huntId)
    .eq("listing_id", id)
    .maybeSingle();

  if (!deal) {
    return NextResponse.json({ messages: [], typing: false });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("deal_id", deal.id)
    .order("created_at", { ascending: true });

  const last = messages?.[messages.length - 1];
  const typing =
    !!last &&
    last.sender === "buyer_agent" &&
    listing?.persona !== "human_ghost" &&
    Date.now() - new Date(last.created_at).getTime() < TYPING_WINDOW_MS;

  return NextResponse.json({ messages: messages ?? [], typing });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await req.json().catch(() => null);
  const huntId = payload?.hunt_id;
  const messageBody = payload?.body;

  if (typeof huntId !== "string" || typeof messageBody !== "string" || !messageBody.trim()) {
    return NextResponse.json({ error: "hunt_id and body are required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: listing } = await supabase
    .from("listings")
    .select("id")
    .eq("id", id)
    .eq("source", "sandbox")
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: "listing not found" }, { status: 404 });
  }

  const deal = await getOrCreateDeal(supabase, huntId, id);

  const price = parsePrice(messageBody);
  const { data: message, error } = await supabase
    .from("messages")
    .insert({ deal_id: deal.id, sender: "buyer_agent", body: messageBody, price, meta: {} })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!deal.first_contact_at) updates.first_contact_at = new Date().toISOString();
  if (deal.status === "new") updates.status = "contacted";
  await supabase.from("deals").update(updates).eq("id", deal.id);

  await supabase
    .from("events")
    .insert({ brief_id: huntId, deal_id: deal.id, kind: "message_sent", detail: { sender: "buyer_agent", price } });

  after(() => sendSellerReply(supabase, deal.id, messageBody));

  return NextResponse.json({ message });
}
