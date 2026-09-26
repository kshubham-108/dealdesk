// DealScore: a pure function. No LLM, no DB — every input is passed in.
// See AGENTS.md §8a for the exact rules; the constants here are load-bearing,
// not tunable, since AGENTS.md §8c pins exact expected totals for the demo hunt.

export type Condition = "like new" | "very good" | "good" | "fair";
export type Disclosure = "none" | "minor" | "major";
export type Flag = "NEW_ACCOUNT" | "PRICE_TOO_GOOD" | "MAJOR_ISSUE";
export type SkipReason = "NO_MATCH" | "WRONG_SIZE" | "CONDITION_BELOW_MIN" | "FAR_ABOVE_BUDGET";

export interface ScoreListing {
  title: string;
  category: string | null;
  description: string | null;
  condition: Condition;
  asking_price: number;
  seller_rating: number | null;
  seller_reviews_count: number;
  seller_since: string | null; // ISO date
  seller_reviews: string[];
  known_issue: string | null;
}

export interface ScoreBrief {
  keywords: string[];
  size_token: string | null;
  min_condition: Condition;
  max_price: number;
}

export interface ScoreInput {
  listing: ScoreListing;
  brief: ScoreBrief;
  marketRef: number;
  disclosure?: Disclosure;
  agreedPrice?: number;
  now?: Date;
}

export interface ScoreResult {
  total: number;
  fit: number;
  trust: number;
  condition: number;
  price: number;
  flags: Flag[];
  skipReason?: SkipReason;
}

const CONDITION_RANK: Record<Condition, number> = {
  "like new": 4,
  "very good": 3,
  good: 2,
  fair: 1,
};

const CONDITION_BASE: Record<Condition, number> = {
  "like new": 25,
  "very good": 21,
  good: 17,
  fair: 10,
};

const RED_FLAG_PHRASES = ["no-show", "didn't turn up", "not as described", "never replied", "scam"];

const round = Math.round;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function yearsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

function monthsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function skipResult(reason: SkipReason): ScoreResult {
  return { total: 0, fit: 0, trust: 0, condition: 0, price: 0, flags: [], skipReason: reason };
}

export function isNewAccount(listing: ScoreListing, now: Date): boolean {
  if (listing.seller_reviews_count === 0) return true;
  if (!listing.seller_since) return true;
  return monthsBetween(new Date(listing.seller_since), now) < 1;
}

export function isHighRisk(flags: Flag[]): boolean {
  return flags.length >= 2;
}

function trustScore(listing: ScoreListing, now: Date): number {
  const reviewsCount = listing.seller_reviews_count;
  const ratingTerm =
    reviewsCount > 0 && listing.seller_rating != null ? 15 * (listing.seller_rating / 5) : 0;
  const reviewsTerm = (5 * Math.min(reviewsCount, 50)) / 50;
  const years = listing.seller_since ? yearsBetween(new Date(listing.seller_since), now) : 0;
  const yearsTerm = years >= 1 ? 5 : 1;

  const redFlagCount = (listing.seller_reviews ?? []).filter((review) =>
    RED_FLAG_PHRASES.some((phrase) => review.toLowerCase().includes(phrase))
  ).length;

  const raw = round(ratingTerm + reviewsTerm + yearsTerm) - 6 * redFlagCount;
  return clamp(raw, 0, 25);
}

function conditionScore(condition: Condition, disclosure: Disclosure) {
  const base = CONDITION_BASE[condition] ?? 17;
  if (disclosure === "major") return { score: 0, majorIssue: true };
  if (disclosure === "minor") return { score: base - 5, majorIssue: false };
  return { score: base, majorIssue: false };
}

function priceScore(effectivePrice: number, ref: number) {
  const r = effectivePrice / ref;
  if (r < 0.6) return { score: 0, tooGood: true };
  if (r < 0.9) return { score: 20, tooGood: false };
  if (r < 1.05) return { score: 16, tooGood: false };
  if (r < 1.2) return { score: 10, tooGood: false };
  return { score: 4, tooGood: false };
}

export function dealScore(input: ScoreInput): ScoreResult {
  const now = input.now ?? new Date();
  const { listing, brief, marketRef, agreedPrice } = input;
  const disclosure: Disclosure = input.disclosure ?? "none";

  const haystack = `${listing.title} ${listing.category ?? ""}`.toLowerCase();
  const hasKeyword = brief.keywords.some((k) => haystack.includes(k.toLowerCase()));
  if (!hasKeyword) return skipResult("NO_MATCH");

  if (brief.size_token) {
    const sizeHaystack = `${listing.title} ${listing.description ?? ""}`.toLowerCase();
    if (!sizeHaystack.includes(brief.size_token.toLowerCase())) return skipResult("WRONG_SIZE");
  }

  if (CONDITION_RANK[listing.condition] < CONDITION_RANK[brief.min_condition]) {
    return skipResult("CONDITION_BELOW_MIN");
  }

  if (listing.asking_price > 1.25 * brief.max_price) return skipResult("FAR_ABOVE_BUDGET");

  const fit = 30;
  const trust = trustScore(listing, now);
  const { score: conditionValue, majorIssue } = conditionScore(listing.condition, disclosure);
  const effectivePrice = agreedPrice ?? listing.asking_price;
  const { score: priceValue, tooGood } = priceScore(effectivePrice, marketRef);

  const flags: Flag[] = [];
  if (isNewAccount(listing, now)) flags.push("NEW_ACCOUNT");
  if (tooGood) flags.push("PRICE_TOO_GOOD");
  if (majorIssue) flags.push("MAJOR_ISSUE");

  return {
    total: fit + trust + conditionValue + priceValue,
    fit,
    trust,
    condition: conditionValue,
    price: priceValue,
    flags,
  };
}

export function shouldContact(result: ScoreResult): boolean {
  return !result.skipReason && result.total >= 50;
}
