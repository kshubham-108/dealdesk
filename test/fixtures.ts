// Mirrors supabase/seed.sql exactly, so tests exercise the real demo hunt
// from AGENTS.md §6/§8c rather than a synthetic approximation.
import type { ScoreBrief, ScoreListing } from "../lib/score";
import type { Persona } from "../lib/seller";

// "Today" for every test in this suite — 2026-09-26, matching the session's
// actual date, so Sam's 2-day-old account and everyone else's tenure land
// exactly where AGENTS.md §8c expects them.
export const NOW = new Date("2026-09-26T12:00:00Z");

export const demoBrief: ScoreBrief = {
  keywords: ["bike", "road bike"],
  size_token: "54cm",
  min_condition: "good",
  max_price: 260,
};

export const demoBriefTarget = 220;
export const demoMarketRef = 220; // brief target — no real listings imported yet

export interface DemoListing extends ScoreListing {
  seller_name: string;
  persona: Persona;
  floor_price: number | null;
  issue_severity: "none" | "minor" | "major";
}

export const frank: DemoListing = {
  title: "Specialized Allez, 54cm, Shimano Sora",
  category: "bike",
  description: "Specialized Allez road bike, 54cm frame with Shimano Sora groupset.",
  condition: "very good",
  asking_price: 260,
  seller_rating: 4.9,
  seller_reviews_count: 48,
  seller_since: "2021-03-01",
  seller_reviews: ["Bike exactly as described, easy collection.", "Friendly and quick to reply."],
  known_issue: "No damage. Serviced in August with new tyres.",
  seller_name: "Frank",
  persona: "agent_fair",
  floor_price: 225,
  issue_severity: "none",
};

export const hana: DemoListing = {
  title: "Canyon Endurace AL, 54cm, Shimano 105",
  category: "bike",
  description: "Canyon Endurace AL endurance road bike, size 54cm, Shimano 105 groupset.",
  condition: "good",
  asking_price: 300,
  seller_rating: 4.7,
  seller_reviews_count: 21,
  seller_since: "2022-05-01",
  seller_reviews: ["Good bike, a few more scuffs than the photos showed.", "Chatty seller, fair price in the end."],
  known_issue: "A small scuff on the top tube, and the brake pads are due for replacing.",
  seller_name: "Hana",
  persona: "agent_haggler",
  floor_price: 240,
  issue_severity: "minor",
};

export const fiona: DemoListing = {
  title: "Giant Contend 2, size M (54cm)",
  category: "bike",
  description: "Giant Contend 2 road bike, size Medium (54cm).",
  condition: "very good",
  asking_price: 285,
  seller_rating: 4.8,
  seller_reviews_count: 35,
  seller_since: "2020-01-15",
  seller_reviews: ["Knows her bikes, firm on price.", "Smooth sale."],
  known_issue: "No issues, it's been garage kept.",
  seller_name: "Fiona",
  persona: "agent_firm",
  floor_price: 275,
  issue_severity: "none",
};

export const gary: DemoListing = {
  title: "Cannondale CAAD Optimo, 54cm",
  category: "bike",
  description: "Cannondale CAAD Optimo road bike, 54cm frame.",
  condition: "good",
  asking_price: 210,
  seller_rating: 3.4,
  seller_reviews_count: 6,
  seller_since: "2023-02-01",
  seller_reviews: ["Never replied to my last message.", "Nice bike but slow to reply."],
  known_issue: null,
  seller_name: "Gary",
  persona: "human_ghost",
  floor_price: 190,
  issue_severity: "none",
};

export const sam: DemoListing = {
  title: "Boardman SLR carbon, 54cm, as new",
  category: "bike",
  description: "Boardman SLR carbon road bike, 54cm, as new condition.",
  condition: "like new",
  asking_price: 120,
  seller_rating: null,
  seller_reviews_count: 0,
  seller_since: "2026-09-24",
  seller_reviews: [],
  known_issue: null,
  seller_name: "Sam",
  persona: "human_scammer",
  floor_price: null,
  issue_severity: "none",
};

export const sally: DemoListing = {
  title: "Ribble Endurance AL, 54cm",
  category: "bike",
  description: "Ribble Endurance AL road bike, 54cm frame.",
  condition: "good",
  asking_price: 230,
  seller_rating: 4.6,
  seller_reviews_count: 12,
  seller_since: "2022-06-01",
  seller_reviews: ["Sold quickly, lovely seller.", "Great communication."],
  known_issue: null,
  seller_name: "Sally",
  persona: "human_sold",
  floor_price: 210,
  issue_severity: "none",
};

export const dave: DemoListing = {
  title: "Trek Domane AL 2, 58cm",
  category: "bike",
  description: "Trek Domane AL 2 endurance road bike, 58cm frame.",
  condition: "good",
  asking_price: 240,
  seller_rating: 4.8,
  seller_reviews_count: 30,
  seller_since: "2021-07-01",
  seller_reviews: ["Great seller."],
  known_issue: "No issues.",
  seller_name: "Dave",
  persona: "agent_fair",
  floor_price: 215,
  issue_severity: "none",
};

export const demoListings = { frank, hana, fiona, gary, sam, sally, dave };
