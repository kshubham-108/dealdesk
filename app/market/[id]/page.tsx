import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import Chat from "./Chat";

export const dynamic = "force-dynamic";

function yearsSince(dateStr: string | null) {
  if (!dateStr) return null;
  const years = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(years));
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hunt?: string }>;
}) {
  const { id } = await params;
  const { hunt } = await searchParams;
  const supabase = getSupabase();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .eq("source", "sandbox")
    .maybeSingle();

  if (!listing) notFound();

  const years = yearsSince(listing.seller_since);

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 dark:bg-black">
      <main className="w-full max-w-2xl">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-3xl">{listing.emoji}</span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {listing.title}
            </h1>
          </div>
          {listing.seller_mode === "agent" && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              🤖 Seller agent
            </span>
          )}
        </div>

        <p className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          £{listing.asking_price}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {listing.condition} · {listing.location}
        </p>
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{listing.description}</p>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {listing.seller_name}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {listing.seller_rating != null ? (
              <>
                ★ {listing.seller_rating} ({listing.seller_reviews_count} reviews)
              </>
            ) : (
              "No reviews yet"
            )}
            {years != null && <> · member since {years === 0 ? "this year" : `${years}y`}</>}
          </p>
          {listing.seller_reviews?.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {listing.seller_reviews.map((review: string, i: number) => (
                <li key={i}>“{review}”</li>
              ))}
            </ul>
          )}
        </div>

        <Chat listingId={listing.id} huntId={hunt} />
      </main>
    </div>
  );
}
