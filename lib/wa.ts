import type { NextRequest } from "next/server";
import type { HuntState, HuntDeal } from "./huntState";

// §14.5: header x-api-key, or ?key= in the URL.
export function checkApiKey(req: NextRequest): boolean {
  const headerKey = req.headers.get("x-api-key");
  const queryKey = req.nextUrl.searchParams.get("key");
  const key = headerKey ?? queryKey;
  return !!key && key === process.env.MCP_API_KEY;
}

// Reads params from the JSON body (POST) or the query string (GET or POST),
// body taking precedence.
export async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== "key") out[k] = v;
  });
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
    }
  }
  return out;
}

const ONGOING_STATUSES = new Set(["new", "contacted", "negotiating", "agreed_pending_approval"]);

function humanStatus(status: string): string {
  const map: Record<string, string> = {
    walked_away: "no overlap",
    ghosted: "ghosted",
    scam_blocked: "blocked (scam)",
    sold: "sold",
    skipped: "skipped",
    declined: "declined",
    closed_other: "closed",
  };
  return map[status] ?? status;
}

// Top reasons for the recommended deal, e.g. "No issues · 4.9★ (48) · £25 under asking".
// Never the max, a ceiling or a floor.
function topReasons(deal: HuntDeal): string {
  const reasons: string[] = [];

  if (!deal.known_issue || deal.issue_severity === "none") reasons.push("No issues");
  else if (deal.issue_severity === "minor") reasons.push("Minor issue disclosed");

  if (deal.seller_rating != null) reasons.push(`${deal.seller_rating}★ (${deal.seller_reviews_count})`);

  if (deal.agreed_price != null) {
    const diff = deal.asking_price - deal.agreed_price;
    if (diff > 0) reasons.push(`£${diff} under asking`);
    else if (diff < 0) reasons.push(`£${-diff} over asking`);
  }

  return reasons.slice(0, 3).join(" · ");
}

// Built entirely from the database, no LLM — and never the max, a ceiling or a
// seller floor. Capped at 5 short lines for WhatsApp.
export function buildStatusReply(state: HuntState): string {
  const lines: string[] = [];
  const pending = state.pending_approvals;

  if (pending.length > 0) {
    const recommendedApproval =
      pending.find((a) => a.id === state.recommended_approval_id) ?? pending[0];
    const bestDeal = state.deals.find((d) => d.id === recommendedApproval.deal_id);

    if (bestDeal) {
      lines.push(
        `Best deal: ${bestDeal.title} (${bestDeal.seller_name}). Asked £${bestDeal.asking_price} → agreed £${bestDeal.agreed_price}.`
      );
      lines.push(`DealScore ${bestDeal.deal_score}: ${topReasons(bestDeal)}.`);

      const otherAgreed = state.deals.filter(
        (d) => d.status === "agreed_pending_approval" && d.id !== bestDeal.id
      );
      if (otherAgreed.length > 0) {
        lines.push(
          `Also agreed: ${otherAgreed.map((d) => `${d.seller_name} £${d.agreed_price}`).join(", ")}.`
        );
      }

      const settled = state.deals.filter((d) => !ONGOING_STATUSES.has(d.status) && d.status !== "approved");
      if (settled.length > 0) {
        lines.push(
          `Everyone else: ${settled.map((d) => `${d.seller_name} ${humanStatus(d.status)}`).join(", ")}.`
        );
      }

      lines.push(`Reply YES to approve ${bestDeal.seller_name}.`);
    }
  } else {
    const contacted = state.deals.filter((d) => d.status !== "new" && d.status !== "skipped").length;
    const agreed = state.deals.filter(
      (d) => d.status === "approved" || d.status === "agreed_pending_approval"
    ).length;
    const blocked = state.deals.filter((d) => d.status === "scam_blocked").length;
    const negotiating = state.deals.filter(
      (d) => d.status === "negotiating" || d.status === "contacted"
    );

    lines.push(`Still hunting for your ${state.brief.item}.`);
    lines.push(`Contacted ${contacted}, agreed ${agreed}, blocked ${blocked}.`);
    if (negotiating.length > 0) {
      lines.push(`Still negotiating with: ${negotiating.map((d) => d.seller_name).join(", ")}.`);
    }
  }

  return lines.slice(0, 5).join("\n");
}
