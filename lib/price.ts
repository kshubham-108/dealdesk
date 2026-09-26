// Extracts a £ amount from free text, e.g. "Would you take £235?" -> 235.
// Used on both sides of the chat: the buyer's typed offer and the seller's reply.
export function parsePrice(text: string): number | null {
  const match = text.match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const n = parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
