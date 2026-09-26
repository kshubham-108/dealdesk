import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { BriefFieldsSchema, parseBrief } from "@/lib/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two-phase endpoint:
//  - { raw_text }                        -> parse only, returns { fields } (no DB write)
//  - { raw_text, fields, agent_mode }     -> creates the brief, returns { id }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawText = body?.raw_text;

  if (typeof rawText !== "string" || !rawText.trim()) {
    return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  }

  if (!body.agent_mode) {
    const fields = await parseBrief(rawText);
    return NextResponse.json({ fields });
  }

  if (!["autopilot", "grokbot"].includes(body.agent_mode)) {
    return NextResponse.json({ error: "agent_mode must be autopilot or grokbot" }, { status: 400 });
  }

  const editedFields = BriefFieldsSchema.safeParse(body.fields);
  const fields = editedFields.success ? editedFields.data : await parseBrief(rawText);

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
      agent_mode: body.agent_mode,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("events").insert({ brief_id: data.id, kind: "brief_created", detail: {} });

  return NextResponse.json({ id: data.id });
}
