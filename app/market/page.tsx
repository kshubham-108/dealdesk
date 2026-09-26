import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ hunt?: string; q?: string }>;
}) {
  const { hunt, q } = await searchParams;
  const supabase = getSupabase();

  let query = supabase.from("listings").select("*").eq("source", "sandbox").order("created_at");
  if (q?.trim()) {
    query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);
  }
  const { data: listings } = await query;

  const huntSuffix = hunt ? `?hunt=${hunt}` : "";

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <main className="w-full max-w-4xl">
        <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          Kerbside is a test marketplace: sellers are simulated.
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Kerbside
        </h1>

        <form action="/market" method="GET" className="mt-4 flex gap-2">
          {hunt && <input type="hidden" name="hunt" value={hunt} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search listings…"
            className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Search
          </button>
        </form>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {(listings ?? []).map((listing) => (
            <Link
              key={listing.id}
              href={`/market/${listing.id}${huntSuffix}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">{listing.emoji}</span>
                {listing.seller_mode === "agent" && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                    🤖 Seller agent
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {listing.title}
              </h2>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                £{listing.asking_price}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{listing.condition}</p>
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                {listing.seller_name}
                {listing.seller_rating != null && (
                  <>
                    {" "}
                    · ★ {listing.seller_rating} ({listing.seller_reviews_count})
                  </>
                )}
              </p>
            </Link>
          ))}
        </div>

        {(listings ?? []).length === 0 && (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">No listings match that search.</p>
        )}
      </main>
    </div>
  );
}
