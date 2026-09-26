import { describe, it, expect } from "vitest";
import { decide, type EngineMessage } from "../lib/engine";
import type { Persona } from "../lib/seller";
import { demoListings } from "./fixtures";
import { simulateNegotiation, type SimBrief } from "./simulate";
import type { DemoListing } from "./fixtures";

const demoNegotiationBrief: SimBrief = {
  target_price: 220,
  max_price: 260,
  availability: "weekday evenings after 6",
};

describe("opening offer", () => {
  it("is within [60% of asking, target] and never above asking", () => {
    for (const listing of Object.values(demoListings)) {
      const brief = { target_price: 220, max_price: 260, availability: "this week" };
      const r = decide({
        status: "new",
        brief,
        listing: { title: listing.title, asking_price: listing.asking_price, seller_name: listing.seller_name },
        messages: [],
        now: new Date(),
        ghostTimeoutS: 20,
      });
      expect(r.action).toBe("send");
      const A = listing.asking_price;
      const T = Math.min(brief.target_price, brief.max_price);
      expect(r.offer).toBeGreaterThanOrEqual(0.6 * A - 1e-9);
      expect(r.offer).toBeLessThanOrEqual(T + 1e-9);
      expect(r.offer).toBeLessThanOrEqual(A);
    }
  });
});

describe("property: 10,000 random negotiations", () => {
  it("never offers above max, never agrees above the ceiling", () => {
    const personas: Persona[] = ["agent_fair", "agent_haggler", "agent_firm"];

    for (let i = 0; i < 10000; i++) {
      const max = 100 + Math.floor(Math.random() * 400);
      const target = Math.round(max * (0.5 + Math.random() * 0.4));
      let asking = Math.round(max * (0.7 + Math.random() * 0.5));
      if (asking > 1.25 * max) asking = Math.round(1.25 * max);
      const floor = Math.round(asking * (0.6 + Math.random() * 0.35));
      const persona = personas[Math.floor(Math.random() * personas.length)];
      const hasMinorIssue = Math.random() < 0.3;

      const listing: DemoListing = {
        title: "Random Test Item",
        category: "bike",
        description: "",
        condition: "good",
        asking_price: asking,
        seller_rating: 4.5,
        seller_reviews_count: 10,
        seller_since: "2022-01-01",
        seller_reviews: [],
        known_issue: hasMinorIssue ? "Minor cosmetic scuff." : null,
        seller_name: "RandomSeller",
        persona,
        floor_price: floor,
        issue_severity: hasMinorIssue ? "minor" : "none",
      };

      const brief: SimBrief = { target_price: target, max_price: max, availability: "this week" };

      const sim = simulateNegotiation(brief, listing, { maxRounds: 15 });
      for (const d of sim.decisions) {
        if (d.offer != null) {
          expect(d.offer, `offer above max for run ${i}`).toBeLessThanOrEqual(max);
        }
        if (d.action === "request_approval") {
          expect(d.offer, `agreement above ceiling for run ${i}`).toBeLessThanOrEqual(d.ceiling);
        }
      }
    }
  });
});

describe("leak test — max/ceiling never leak (max £261 to avoid collisions)", () => {
  // Note on the seller's floor: it's deliberately NOT checked here by scanning
  // message text for the floor's numeric value. decide()'s own input type
  // (DecideInput) has no floor_price field at all, so the engine cannot leak
  // it — that's a structural guarantee, not a runtime one. And a negotiation
  // that *converges* at the floor (the buyer's independently-computed ladder
  // rung happens to equal it) is the correct, expected outcome, not a leak;
  // a substring check would flag that convergence as a false positive.
  const brief: SimBrief = { target_price: 221, max_price: 261, availability: "weekday evenings after 6" };

  for (const [name, listing] of Object.entries(demoListings)) {
    it(`${name}: £261 only ever appears in the sanctioned final-offer line`, () => {
      const sim = simulateNegotiation(brief, listing, { maxRounds: 15 });
      for (const d of sim.decisions) {
        const text = `${d.say ?? ""} ${d.reasonCodes.join(" ")}`;
        if (text.includes("261")) {
          expect(d.say).toBe("£261 is the best I can do. Could that work?");
        }
      }
    });
  }
});

describe("scam shield — one case per code", () => {
  const brief = { target_price: 220, max_price: 260, availability: "this week" };
  const listing = { title: "Test Item", asking_price: 200, seller_name: "Scammer" };

  const cases: [string, string][] = [
    ["Please pay by bank transfer to this sort code.", "OFF_PLATFORM_PAYMENT"],
    ["I just need a small deposit to hold it, pay upfront please.", "UPFRONT_PAYMENT"],
    ["I'll send it by courier tomorrow.", "COURIER_BEFORE_VIEWING"],
    ["Can you pay with a gift card instead?", "UNTRACEABLE_PAYMENT"],
    ["Just whatsapp me directly to sort payment.", "MOVE_OFF_PLATFORM"],
  ];

  for (const [body, code] of cases) {
    it(`detects ${code} and never replies`, () => {
      const messages: EngineMessage[] = [
        {
          sender: "buyer_agent",
          body: "Hi! Is it available? Would you take £180?",
          price: 180,
          created_at: new Date(0).toISOString(),
        },
        { sender: "seller", body, price: null, created_at: new Date(1000).toISOString() },
      ];
      const result = decide({
        status: "contacted",
        brief,
        listing,
        messages,
        now: new Date(2000),
        ghostTimeoutS: 20,
      });
      expect(result.action).toBe("stop_scam");
      expect(result.status).toBe("scam_blocked");
      expect(result.reasonCodes).toEqual([code]);
      expect(result.say).toBeUndefined();
    });
  }
});

describe("chase -> chase -> ghosted, and wait", () => {
  const brief = { target_price: 220, max_price: 260, availability: "this week" };
  const listing = { title: "Test Bike", asking_price: 250, seller_name: "Ghost" };

  it("waits, then chases twice, then gives up", () => {
    const messages: EngineMessage[] = [];
    let status = "new";
    let now = new Date(0);

    let r = decide({ status, brief, listing, messages, now, ghostTimeoutS: 20 });
    expect(r.action).toBe("send");
    messages.push({ sender: "buyer_agent", body: r.say!, price: r.offer ?? null, created_at: now.toISOString() });
    status = r.status;

    // Too soon — should wait, not chase.
    now = new Date(now.getTime() + 5000);
    r = decide({ status, brief, listing, messages, now, ghostTimeoutS: 20 });
    expect(r.action).toBe("wait");
    expect(r.retryAfterS).toBe(15);

    now = new Date(now.getTime() + 16000); // total 21s since last message
    r = decide({ status, brief, listing, messages, now, ghostTimeoutS: 20 });
    expect(r.action).toBe("chase");
    expect(r.reasonCodes).toEqual(["CHASE_1"]);
    messages.push({ sender: "buyer_agent", body: r.say!, price: null, created_at: now.toISOString() });
    status = r.status;

    now = new Date(now.getTime() + 21000);
    r = decide({ status, brief, listing, messages, now, ghostTimeoutS: 20 });
    expect(r.action).toBe("chase");
    expect(r.reasonCodes).toEqual(["CHASE_2"]);
    messages.push({ sender: "buyer_agent", body: r.say!, price: null, created_at: now.toISOString() });
    status = r.status;

    now = new Date(now.getTime() + 21000);
    r = decide({ status, brief, listing, messages, now, ghostTimeoutS: 20 });
    expect(r.action).toBe("close");
    expect(r.status).toBe("ghosted");
  });
});

describe("sold and major-issue termination", () => {
  const brief = { target_price: 220, max_price: 260, availability: "this week" };
  const listing = { title: "Test Bike", asking_price: 230, seller_name: "Seller" };

  it("seller says sold -> close", () => {
    const messages: EngineMessage[] = [
      { sender: "buyer_agent", body: "Would you take £200?", price: 200, created_at: new Date(0).toISOString() },
      { sender: "seller", body: "Sorry, it sold this morning!", price: null, created_at: new Date(1000).toISOString() },
    ];
    const r = decide({ status: "contacted", brief, listing, messages, now: new Date(2000), ghostTimeoutS: 20 });
    expect(r.action).toBe("close");
    expect(r.status).toBe("sold");
    expect(r.say).toBe("No worries, thanks!");
  });

  it("seller discloses a major issue -> walk away", () => {
    const messages: EngineMessage[] = [
      { sender: "buyer_agent", body: "Would you take £200?", price: 200, created_at: new Date(0).toISOString() },
      {
        sender: "seller",
        body: "Actually it has a cracked frame.",
        price: null,
        created_at: new Date(1000).toISOString(),
        meta: { issues: "major", issue_text: "Cracked frame" },
      },
    ];
    const r = decide({ status: "contacted", brief, listing, messages, now: new Date(2000), ghostTimeoutS: 20 });
    expect(r.action).toBe("walk_away");
    expect(r.status).toBe("walked_away");
    expect(r.reasonCodes).toEqual(["MAJOR_ISSUE"]);
  });
});

describe("statelessness", () => {
  it("identical decisions when called twice with no new messages", () => {
    const brief = { target_price: 220, max_price: 260, availability: "this week" };
    const listing = { title: "Test Bike", asking_price: 250, seller_name: "Seller" };
    const messages: EngineMessage[] = [
      { sender: "buyer_agent", body: "Would you take £200?", price: 200, created_at: new Date(0).toISOString() },
    ];
    const input = { status: "contacted", brief, listing, messages, now: new Date(30000), ghostTimeoutS: 20 };

    const r1 = decide(input);
    const r2 = decide(input);
    expect(r2).toEqual(r1);
  });
});

describe("§8c full demo hunt outcomes", () => {
  it("Frank: opens £210, agrees at £235", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.frank);
    expect(sim.status).toBe("agreed_pending_approval");
    const opening = sim.decisions[0];
    expect(opening.offer).toBe(210);
    const last = sim.decisions[sim.decisions.length - 1];
    expect(last.offer).toBe(235);
  });

  it("Hana: agrees at £240, ceiling lowered to £245 after disclosure", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.hana);
    expect(sim.status).toBe("agreed_pending_approval");
    const last = sim.decisions[sim.decisions.length - 1];
    expect(last.offer).toBe(240);
    expect(
      sim.decisions.some((d) => d.reasonCodes.includes("CEILING_LOWERED") && d.ceiling === 245)
    ).toBe(true);
  });

  it("Fiona: walks away, no overlap (floor £275 > limit £260)", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.fiona);
    expect(sim.status).toBe("walked_away");
    expect(sim.decisions[sim.decisions.length - 1].reasonCodes).toContain("OVER_BUDGET");
  });

  it("Gary: ghosted after two chases", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.gary);
    expect(sim.status).toBe("ghosted");
  });

  it("Sam: scam blocked", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.sam);
    expect(sim.status).toBe("scam_blocked");
  });

  it("Sally: sold", () => {
    const sim = simulateNegotiation(demoNegotiationBrief, demoListings.sally);
    expect(sim.status).toBe("sold");
  });
});
