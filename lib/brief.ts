import { generateObject } from "ai";
import { z } from "zod";

export const BriefFieldsSchema = z.object({
  item: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  size_token: z.string().nullable(),
  min_condition: z.enum(["like new", "very good", "good", "fair"]),
  location: z.string().nullable(),
  availability: z.string().nullable(),
  target_price: z.number().int().positive(),
  max_price: z.number().int().positive(),
});

export type BriefFields = z.infer<typeof BriefFieldsSchema>;

// The demo brief from the landing page's pre-filled textarea (AGENTS.md §10),
// used whenever LLM parsing is unavailable or fails validation.
export const DEFAULT_BRIEF_FIELDS: BriefFields = {
  item: "road bike",
  keywords: ["bike", "road bike"],
  size_token: "54cm",
  min_condition: "good",
  location: "East London",
  availability: "weekday evenings after 6",
  target_price: 220,
  max_price: 260,
};

export async function parseBrief(rawText: string): Promise<BriefFields> {
  const model = process.env.LLM_SMART_MODEL;
  if (!model) return DEFAULT_BRIEF_FIELDS;

  try {
    const { object } = await generateObject({
      model,
      schema: BriefFieldsSchema,
      prompt: `Extract a structured buying brief from this second-hand-marketplace request. If a field isn't mentioned, use your best reasonable guess from context, or null for size_token/location/availability. min_condition must be one of "like new", "very good", "good", "fair" — pick the closest one. target_price is what the buyer hopes to pay; max_price is their absolute ceiling. If the request states no max price at all, set max_price = round(target_price × 1.18 / 5) × 5 (round to the nearest £5).\n\n"""${rawText}"""`,
    });
    return object;
  } catch {
    return DEFAULT_BRIEF_FIELDS;
  }
}
