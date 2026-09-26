import { describe, it, expect } from "vitest";
import { dealScore, isHighRisk, shouldContact } from "../lib/score";
import { demoBrief, demoMarketRef, NOW, demoListings } from "./fixtures";

// Every number here is pinned by AGENTS.md §8c. These aren't approximations —
// they were derived by hand from §8a's formula and cross-checked against the
// running app before being written down.
describe("dealScore — §8c demo hunt", () => {
  it("Frank: 86, contact", () => {
    const r = dealScore({ listing: demoListings.frank, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(86);
    expect(shouldContact(r)).toBe(true);
  });

  it("Hana: 72 at screening, contact", () => {
    const r = dealScore({ listing: demoListings.hana, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(72);
    expect(shouldContact(r)).toBe(true);
  });

  it("Hana: final score 73 after agreeing £240 with the scuff disclosed", () => {
    const r = dealScore({
      listing: demoListings.hana,
      brief: demoBrief,
      marketRef: demoMarketRef,
      disclosure: "minor",
      agreedPrice: 240,
      now: NOW,
    });
    expect(r.total).toBe(73);
  });

  it("Fiona: 78, contact", () => {
    const r = dealScore({ listing: demoListings.fiona, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(78);
    expect(shouldContact(r)).toBe(true);
  });

  it("Gary: 73, contact (later ghosts, unrelated to screening)", () => {
    const r = dealScore({ listing: demoListings.gary, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(73);
    expect(shouldContact(r)).toBe(true);
  });

  it("Sam: 56, HIGH RISK (new account + price too good)", () => {
    const r = dealScore({ listing: demoListings.sam, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(56);
    expect(r.flags).toContain("NEW_ACCOUNT");
    expect(r.flags).toContain("PRICE_TOO_GOOD");
    expect(isHighRisk(r.flags)).toBe(true);
  });

  it("Sally: 83, contact", () => {
    const r = dealScore({ listing: demoListings.sally, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.total).toBe(83);
    expect(shouldContact(r)).toBe(true);
  });

  it("Dave (58cm): skipped WRONG_SIZE, never contacted", () => {
    const r = dealScore({ listing: demoListings.dave, brief: demoBrief, marketRef: demoMarketRef, now: NOW });
    expect(r.skipReason).toBe("WRONG_SIZE");
    expect(shouldContact(r)).toBe(false);
  });

  it("Frank stays the recommendation over Hana: higher final score", () => {
    const frankFinal = dealScore({
      listing: demoListings.frank,
      brief: demoBrief,
      marketRef: demoMarketRef,
      agreedPrice: 235,
      now: NOW,
    });
    const hanaFinal = dealScore({
      listing: demoListings.hana,
      brief: demoBrief,
      marketRef: demoMarketRef,
      disclosure: "minor",
      agreedPrice: 240,
      now: NOW,
    });
    expect(frankFinal.total).toBeGreaterThan(hanaFinal.total);
  });
});
