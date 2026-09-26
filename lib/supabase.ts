import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the Supabase secret key — never import this from
// client components. RLS is enabled with no policies, so only this key can
// read/write.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
