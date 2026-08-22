export type ParsedItem = { name: string; price: number };
export type ParsedReceipt = {
  items: ParsedItem[];
  tax: number;
  service: number;
  total: number;
};

// A trailing number: either grouped in 3s ("42.000", "1,234.56") or a bare run of digits.
// Requires whitespace/line-start right before it, so digits glued to letters
// ("PB1", receipt no. "RPG202608020090") or embedded in a time ("22:46") don't match.
const PRICE_RE = /(?:^|\s)(\d{1,3}(?:[.,]\d{3})+|\d+)\s*$/;
const MIN_PRICE = 100; // filters out quantities/table numbers ("1", "39") that aren't real prices

// Matches "Subtotal", "Sub Total", "Sub-Total" etc. Checked before KEYWORD_ORDER because
// "Subtotal" (glued, no space) has no word boundary before "total" and would otherwise
// fall through the "total" keyword match and get pushed onto items as a phantom line.
const SUBTOTAL_RE = /\bsub[\s-]*total\b/;

const KEYWORD_ORDER: { pattern: RegExp; field: keyof Omit<ParsedReceipt, "items"> }[] = [
  { pattern: /\bgrand\s*total\b/, field: "total" },
  { pattern: /\b(tax|vat|ppn|pb1)\b/, field: "tax" },
  { pattern: /\bservice\b/, field: "service" },
  { pattern: /\bsvc\b/, field: "service" },
  { pattern: /\b(total|amount)\b/, field: "total" },
];

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  const groups = cleaned.split(/[.,]/);
  // Every group after the first is exactly 3 digits => thousands separators, not a decimal.
  const isThousandsGrouped = groups.length > 1 && groups.slice(1).every((g) => g.length === 3);
  const normalized = isThousandsGrouped ? groups.join("") : cleaned.replace(/,/g, "");
  return Math.round((parseFloat(normalized) || 0) * 100) / 100;
}

function matchKeyword(label: string): keyof Omit<ParsedReceipt, "items"> | undefined {
  const lower = label.toLowerCase();
  return KEYWORD_ORDER.find(({ pattern }) => pattern.test(lower))?.field;
}

// ponytail: line-by-line regex heuristic, not a real receipt grammar. Swap for
// a layout-aware parser (Vision's bounding boxes / a table model) if accuracy
// on real-world receipts turns out too low.
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const totals: Partial<Record<keyof Omit<ParsedReceipt, "items">, number>> = {};
  let pendingLabel = "";

  for (const line of lines) {
    const priceMatch = line.match(PRICE_RE);

    if (!priceMatch) {
      // No price on this line yet: it might be a name/keyword label whose price
      // (or amount) arrives on the next line — e.g. "Service Charge :" then "19.450".
      pendingLabel = line;
      continue;
    }

    const price = toNumber(priceMatch[1]);
    const inlineLabel = line.slice(0, priceMatch.index).trim().replace(/[:\-.]+$/, "");
    const label = (inlineLabel || pendingLabel).replace(/[:\-.]+$/, "").trim();
    pendingLabel = "";

    if (price < MIN_PRICE) continue;

    // Subtotal is neither a line item nor the grand total (it's the pre-tax/service sum) —
    // drop it so it doesn't leak into items or get mistaken for the total.
    if (SUBTOTAL_RE.test(label.toLowerCase()) || SUBTOTAL_RE.test(line.toLowerCase())) continue;

    const keywordField = matchKeyword(label) ?? matchKeyword(line);
    if (keywordField) {
      totals[keywordField] = price;
      continue;
    }

    // Metadata rows ("No : RPG202608020090") aren't items even if the price looks real.
    if (!label || line.includes(":")) continue;

    items.push({ name: label, price });
  }

  return {
    items,
    tax: totals.tax ?? 0,
    service: totals.service ?? 0,
    total: totals.total ?? items.reduce((sum, i) => sum + i.price, 0),
  };
}
