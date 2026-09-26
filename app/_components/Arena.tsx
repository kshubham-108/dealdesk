"use client";

import { useEffect, useRef, useState } from "react";
import { DealZoneBar } from "./DealZoneBar";

type Msg = { id: string; sender: string; body: string; price: number | null; created_at: string };
type Deal = {
  id: string;
  listing_id: string;
  title: string;
  emoji: string | null;
  asking_price: number;
  seller_name: string;
  seller_mode: string;
  persona: string;
  floor_price: number | null;
  status: string;
  deal_score: number | null;
  score: { fit?: number; trust?: number; condition?: number; price?: number; flags?: string[]; skipReason?: string } | null;
  agreed_price: number | null;
  messages: Msg[];
};
type Approval = { id: string; deal_id: string; price: number; status: string };
type RealListing = { id: string; title: string; url: string | null; platform: string; asking_price: number; seller_feedback: string | null };
type Results = {
  ready: boolean;
  screened: number;
  skipped: { title: string; reason: string | null }[];
  contacted: number;
  messagesFromBuyer: number;
  messagesFromSeller: number;
  chases: number;
  scamsBlocked: number;
  walkAways: number;
  timeToFirstAgreement: string | null;
  totalHuntTime: string;
  bestDeal: { title: string; seller: string; asking: number; agreed: number; savedAmount: number; savedPercent: number } | null;
};
type HuntStateJson = {
  brief: { id: string; item: string; target_price: number; max_price: number; location: string | null; availability: string | null };
  deals: Deal[];
  pending_approvals: Approval[];
  recommended_approval_id: string | null;
  real_listings: RealListing[];
  results: Results;
};

export function Arena({ huntId, mode }: { huntId?: string; mode: "fixed" | "latest" }) {
  const [state, setState] = useState<HuntStateJson | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const tickingRef = useRef(false);
  const settledRef = useRef(false);

  const currentHuntId = mode === "fixed" ? huntId : state?.brief?.id;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const url = mode === "latest" ? "/api/hunt/latest" : `/api/hunt/${huntId}/state`;
      const res = await fetch(url);
      if (cancelled) return;
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setNotFound(false);
      setState(data);
      settledRef.current = !!data.results?.ready;
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [huntId, mode]);

  // Auto-drives the autopilot loop until every deal settles.
  useEffect(() => {
    if (!currentHuntId) return;
    let cancelled = false;

    async function tick() {
      if (tickingRef.current || settledRef.current) return;
      tickingRef.current = true;
      try {
        await fetch("/api/autopilot/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hunt_id: currentHuntId }),
        });
      } finally {
        tickingRef.current = false;
      }
    }

    const interval = setInterval(() => {
      if (!cancelled) tick();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentHuntId]);

  async function handleApprove(approvalId: string, decision: "approved" | "declined") {
    await fetch(`/api/approvals/${approvalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
  }

  async function handleImport() {
    if (!currentHuntId) return;
    try {
      const parsed = JSON.parse(importText);
      const res = await fetch(`/api/hunt/${currentHuntId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setImportMsg(res.ok ? `Imported ${data.imported} listings.` : data.error);
    } catch {
      setImportMsg("That doesn't look like valid JSON.");
    }
  }

  async function handleReset() {
    if (!currentHuntId) return;
    await fetch(`/api/hunt/${currentHuntId}/reset`, { method: "POST" });
    setState(null);
  }

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white">
        <p className="text-zinc-500">No hunt yet — start one from the landing page.</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white">
        <p className="text-zinc-500">Loading…</p>
      </div>
    );
  }

  const { brief, deals, pending_approvals, recommended_approval_id, real_listings, results } = state;
  const contactedDeals = deals.filter((d) => d.status !== "skipped");
  const skippedDeals = deals.filter((d) => d.status === "skipped");
  const recommendedApproval = pending_approvals.find((a) => a.id === recommended_approval_id);
  const otherApprovals = pending_approvals.filter((a) => a.id !== recommended_approval_id);

  return (
    <div className="min-h-full bg-white px-6 py-8 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{brief.item}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Target £{brief.target_price} · {brief.location ?? "—"} · {brief.availability ?? "—"}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold text-indigo-600">Your secret limit £{brief.max_price}</span>
            <span className="text-zinc-400"> · neither agent can see the other&apos;s limit</span>
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Screening</h2>
          <div className="flex flex-wrap gap-3">
            {contactedDeals.map((d) => (
              <ScreeningChip key={d.id} deal={d} />
            ))}
            {skippedDeals.map((d) => (
              <ScreeningChip key={d.id} deal={d} skipped />
            ))}
            {deals.length === 0 && <p className="text-sm text-zinc-400">Screening listings…</p>}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Negotiations</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {contactedDeals.map((d) => (
              <NegotiationCard key={d.id} deal={d} buyerLimit={brief.max_price} />
            ))}
          </div>
        </section>

        {pending_approvals.length > 0 && (
          <section className="mb-8 rounded-xl border-2 border-indigo-600 bg-indigo-50 p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700">Approve a deal</h2>
            <div className="space-y-2">
              {recommendedApproval && (
                <ApprovalRow
                  approval={recommendedApproval}
                  deal={deals.find((d) => d.id === recommendedApproval.deal_id)}
                  recommended
                  onDecide={handleApprove}
                />
              )}
              {otherApprovals.map((a) => (
                <ApprovalRow key={a.id} approval={a} deal={deals.find((d) => d.id === a.deal_id)} onDecide={handleApprove} />
              ))}
            </div>
          </section>
        )}

        {results?.ready && (
          <section className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Results</h2>
            <ResultsPanel results={results} />
          </section>
        )}

        <section className="mb-8 rounded-xl border border-zinc-200 p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Real market scan</h2>
          {real_listings.length === 0 ? (
            <p className="text-sm text-zinc-400">No real listings imported yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {real_listings.map((l) => (
                <li key={l.id}>
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      {l.title}
                    </a>
                  ) : (
                    <span>{l.title}</span>
                  )}{" "}
                  — £{l.asking_price} on {l.platform}
                  {l.seller_feedback && ` (${l.seller_feedback})`}
                </li>
              ))}
            </ul>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-700">Import real listings (JSON)</summary>
            <textarea
              className="mt-2 w-full rounded-lg border border-zinc-300 p-2 font-mono text-xs"
              rows={4}
              placeholder='[{"title":"...","url":"...","platform":"eBay","price":250,"seller_feedback":"99% positive"}]'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button
              type="button"
              onClick={handleImport}
              className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Import
            </button>
            {importMsg && <p className="mt-1 text-xs text-zinc-500">{importMsg}</p>}
          </details>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500"
          >
            Reset hunt
          </button>
        </div>

        <footer className="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          Kerbside is a test marketplace · sellers are simulated · Built with Grok Bot, Wassist, Supabase and Vercel
        </footer>
      </div>
    </div>
  );
}

function ScreeningChip({ deal, skipped }: { deal: Deal; skipped?: boolean }) {
  const score = deal.score ?? {};
  const flags = score.flags ?? [];
  const highRisk = flags.length >= 2;

  return (
    <div
      className={`w-40 rounded-lg border p-3 text-xs ${skipped ? "border-zinc-200 bg-zinc-50 opacity-60" : "border-zinc-200 bg-white"}`}
      title={
        skipped
          ? undefined
          : `Fit ${score.fit ?? 0} · Trust ${score.trust ?? 0} · Condition ${score.condition ?? 0} · Price ${score.price ?? 0}`
      }
    >
      <p className="truncate font-medium">{deal.title}</p>
      {skipped ? (
        <p className="mt-1 text-zinc-500">Skipped: {score.skipReason}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{deal.deal_score}</p>
          {highRisk && (
            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              HIGH RISK
            </span>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-600",
  contacted: "bg-blue-100 text-blue-700",
  negotiating: "bg-blue-100 text-blue-700",
  agreed_pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  walked_away: "bg-zinc-200 text-zinc-600",
  ghosted: "bg-zinc-200 text-zinc-600",
  scam_blocked: "bg-red-100 text-red-700",
  sold: "bg-zinc-200 text-zinc-600",
  closed_other: "bg-zinc-200 text-zinc-600",
  declined: "bg-zinc-200 text-zinc-600",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  negotiating: "Negotiating",
  agreed_pending_approval: "Agreed — pending",
  approved: "Approved",
  walked_away: "Walked away",
  ghosted: "Ghosted",
  scam_blocked: "Scam blocked",
  sold: "Sold",
  closed_other: "Closed",
  declined: "Declined",
};

function NegotiationCard({ deal, buyerLimit }: { deal: Deal; buyerLimit: number }) {
  const buyerOffers = deal.messages
    .filter((m) => m.sender === "buyer_agent" && m.price != null)
    .map((m) => ({ price: m.price as number, key: m.id }));
  const sellerOffers = deal.messages
    .filter((m) => m.sender === "seller" && m.price != null)
    .map((m) => ({ price: m.price as number, key: m.id }));
  const lastMessage = deal.messages[deal.messages.length - 1];

  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{deal.seller_name}</span>
          <span className="text-xs">{deal.seller_mode === "agent" ? "🤖" : "👤"}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[deal.status] ?? "bg-zinc-100 text-zinc-600"}`}>
          {STATUS_LABEL[deal.status] ?? deal.status}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-zinc-500">{deal.title}</p>

      <DealZoneBar
        asking={deal.asking_price}
        buyerLimit={buyerLimit}
        sellerFloor={deal.floor_price}
        buyerOffers={buyerOffers}
        sellerOffers={sellerOffers}
        agreedPrice={deal.agreed_price}
      />

      {lastMessage && (
        <p className="mt-3 truncate text-xs italic text-zinc-500">
          {lastMessage.sender === "seller" ? "Them: " : "You: "}
          {lastMessage.body}
        </p>
      )}
    </div>
  );
}

function ApprovalRow({
  approval,
  deal,
  recommended,
  onDecide,
}: {
  approval: Approval;
  deal: Deal | undefined;
  recommended?: boolean;
  onDecide: (id: string, decision: "approved" | "declined") => void;
}) {
  if (!deal) return null;
  const saved = deal.asking_price - approval.price;

  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg p-3 ${recommended ? "bg-white" : ""}`}>
      <div>
        {recommended && <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Recommended</p>}
        <p className="font-medium">
          {deal.title} — {deal.seller_name}
        </p>
        <p className="text-xs text-zinc-500">
          Asked £{deal.asking_price} → agreed £{approval.price} (saved £{saved}) · DealScore {deal.deal_score}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onDecide(approval.id, "approved")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDecide(approval.id, "declined")}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function ResultsPanel({ results }: { results: Results }) {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
      <Stat label="Screened" value={results.screened} />
      <Stat label="Contacted" value={results.contacted} />
      <Stat label="Messages sent" value={results.messagesFromBuyer} />
      <Stat label="Chases" value={results.chases} />
      <Stat label="Scams blocked" value={results.scamsBlocked} />
      <Stat label="Walk-aways" value={results.walkAways} />
      <Stat label="Time to first deal" value={results.timeToFirstAgreement ?? "—"} />
      <Stat label="Total hunt time" value={results.totalHuntTime} />

      {results.bestDeal && (
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Best deal</p>
          <p className="text-lg font-bold">
            {results.bestDeal.title} — £{results.bestDeal.asking} → £{results.bestDeal.agreed} (saved £
            {results.bestDeal.savedAmount}, {results.bestDeal.savedPercent}%)
          </p>
        </div>
      )}

      {results.skipped.length > 0 && (
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Skipped</p>
          <p className="text-xs text-zinc-600">{results.skipped.map((s) => `${s.title} (${s.reason})`).join(", ")}</p>
        </div>
      )}

      <div className="col-span-2 text-xs text-zinc-400 sm:col-span-4">
        Your effort: 1 brief + 1 tap · Agent sellers typed 0 messages
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-2xl font-bold text-indigo-600">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
