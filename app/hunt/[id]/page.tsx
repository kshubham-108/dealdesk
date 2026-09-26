import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();

  const { data: brief } = await supabase.from("briefs").select("*").eq("id", id).maybeSingle();
  if (!brief) notFound();

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {brief.item}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Mode: {brief.agent_mode === "grokbot" ? "Grok Bot" : "Autopilot"}
        </p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <dl className="grid grid-cols-2 gap-3">
            <dt className="text-zinc-500 dark:text-zinc-400">Target price</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">£{brief.target_price}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Your secret limit</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              £{brief.max_price} <span className="text-xs text-zinc-500">(hidden from sellers)</span>
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Min condition</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{brief.min_condition}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Size</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{brief.size_token ?? "—"}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Location</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{brief.location ?? "—"}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Availability</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{brief.availability ?? "—"}</dd>
          </dl>
        </div>

        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          The full arena (screening, negotiation cards, approvals, results) lands in M3. For now,
          open Kerbside to haggle by hand:
        </p>
        <Link
          href={`/market?hunt=${id}`}
          className="mt-3 inline-block rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Open Kerbside
        </Link>
      </main>
    </div>
  );
}
