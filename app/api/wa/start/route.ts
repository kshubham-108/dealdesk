import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { parseBrief } from "@/lib/brief";
import { checkApiKey, readParams } from "@/lib/wa";
import { runOneTickEnsured, ghostTimeoutSeconds } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = await readParams(req);
  const rawText = params.request;
  if (!rawText) {
    return NextResponse.json({ error: "request is required" }, { status: 400 });
  }

  const fields = await parseBrief(rawText);
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      raw_text: rawText,
      item: fields.item,
      keywords: fields.keywords,
      size_token: fields.size_token,
      min_condition: fields.min_condition,
      location: fields.location,
      availability: fields.availability,
      target_price: fields.target_price,
      max_price: fields.max_price,
      agent_mode: "autopilot",
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("events")
    .insert({ brief_id: data.id, kind: "brief_created", detail: { source: "whatsapp" } });

  await runOneTickEnsured(supabase, data.id, ghostTimeoutSeconds());

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const reply =
    `On it: hunting for ${fields.item} around £${fields.target_price}. I'll screen every listing, ` +
    `message the sellers and haggle for you. Watch live: ${appUrl}/hunt/${data.id}. ` +
    `Ask me "how's it going?" any time.`;

  return NextResponse.json({ reply, hunt_id: data.id });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
