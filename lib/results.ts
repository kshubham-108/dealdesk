import type { HuntState } from "./huntState";

const OPEN_STATUSES = new Set(["new", "contacted", "negotiating"]);
const SETTLED_STATUSES = new Set([
  "agreed_pending_approval",
  "approved",
  "declined",
  "walked_away",
  "ghosted",
  "scam_blocked",
  "sold",
  "closed_other",
]);

function fmtDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function isHuntSettled(state: HuntState): boolean {
  // An empty deals array means screening hasn't run yet, not that the hunt
  // is done — .every() on [] is vacuously true, which would stop the
  // autopilot loop before it ever starts.
  return state.deals.length > 0 && state.deals.every((d) => !OPEN_STATUSES.has(d.status));
}

export interface ResultsSummary {
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
  bestDeal: {
    title: string;
    seller: string;
    asking: number;
    agreed: number;
    savedAmount: number;
    savedPercent: number;
    vsMarketMedian: number | null;
  } | null;
}

export function computeResults(state: HuntState): ResultsSummary {
  const ready = isHuntSettled(state);

  const skipped = state.deals
    .filter((d) => d.status === "skipped")
    .map((d) => ({ title: d.title, reason: (d.score as { skipReason?: string })?.skipReason ?? null }));

  const contacted = state.deals.filter((d) => d.status !== "skipped").length;

  let messagesFromBuyer = 0;
  let messagesFromSeller = 0;
  for (const d of state.deals) {
    for (const m of d.messages as { sender: string }[]) {
      if (m.sender === "buyer_agent") messagesFromBuyer++;
      else if (m.sender === "seller") messagesFromSeller++;
    }
  }

  const chases = state.events.filter((e) => {
    const codes = (e.detail as { reasonCodes?: string[] })?.reasonCodes ?? [];
    return codes.some((c) => c.startsWith("CHASE_"));
  }).length;

  const scamsBlocked = state.deals.filter((d) => d.status === "scam_blocked").length;
  const walkAways = state.deals.filter((d) => d.status === "walked_away").length;

  const firstContactTimes = state.deals
    .map((d) => d.first_contact_at)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime());
  const agreedTimes = state.deals
    .map((d) => d.agreed_at)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime());

  const timeToFirstAgreement =
    firstContactTimes.length > 0 && agreedTimes.length > 0
      ? fmtDuration(Math.min(...agreedTimes) - Math.min(...firstContactTimes))
      : null;

  const allTimes = [
    new Date(state.brief.created_at).getTime(),
    ...state.deals.flatMap((d) => (d.messages as { created_at: string }[]).map((m) => new Date(m.created_at).getTime())),
  ];
  const latest = allTimes.length > 0 ? Math.max(...allTimes) : Date.now();
  const totalHuntTime = fmtDuration(latest - new Date(state.brief.created_at).getTime());

  const agreedDeals = state.deals.filter((d) => SETTLED_STATUSES.has(d.status) && d.agreed_price != null);
  const best = [...agreedDeals].sort(
    (a, b) => (b.deal_score ?? 0) - (a.deal_score ?? 0) || (a.agreed_price ?? 0) - (b.agreed_price ?? 0)
  )[0];

  const medianReal =
    state.real_listings.length >= 3
      ? (() => {
          const prices = state.real_listings.map((l) => (l as { asking_price: number }).asking_price).sort((a, b) => a - b);
          const mid = Math.floor(prices.length / 2);
          return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
        })()
      : null;

  const bestDeal = best
    ? {
        title: best.title,
        seller: best.seller_name,
        asking: best.asking_price,
        agreed: best.agreed_price as number,
        savedAmount: best.asking_price - (best.agreed_price as number),
        savedPercent: Math.round(((best.asking_price - (best.agreed_price as number)) / best.asking_price) * 100),
        vsMarketMedian: medianReal != null ? (best.agreed_price as number) - medianReal : null,
      }
    : null;

  return {
    ready,
    screened: state.deals.length,
    skipped,
    contacted,
    messagesFromBuyer,
    messagesFromSeller,
    chases,
    scamsBlocked,
    walkAways,
    timeToFirstAgreement,
    totalHuntTime,
    bestDeal,
  };
}
