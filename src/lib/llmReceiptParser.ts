import type { ParsedReceipt } from "@/lib/receiptParser";

const API_URL = "https://9router.zool.asia/v1/chat/completions";
const MODEL = "kr/glm-5";

const SYSTEM_PROMPT = `You extract structured data from OCR text of a restaurant/cafe receipt.
Return ONLY a JSON object, no prose, no markdown fences, matching exactly this shape:
{"items": [{"name": string, "price": number, "qty": number}], "tax": number, "service": number, "total": number}

Rules:
- "items" excludes subtotal, tax, service charge, rounding, and the grand total — only actual purchased items/services.
- If a line has "<qty> x <unit price>" (e.g. "66 x 666"), "qty" is that quantity and the item's "price" is qty * unit price (the line total), not the unit price alone.
- If no quantity is shown for an item, "qty" is 1.
- Numbers use "." or "," as thousands separators (e.g. "42.000" means 42000), not decimals, unless the value clearly has cents.
- "tax" covers VAT/PPN/PB1. "service" covers service charge/svc. Use 0 if absent.
- "total" is the grand total actually charged. If no explicit total line exists, sum the items, tax, and service.
- Output valid JSON only.`;

function isValidParsedReceipt(value: unknown): value is ParsedReceipt {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.items)) return false;
  if (
    !v.items.every(
      (i) =>
        i &&
        typeof i === "object" &&
        typeof (i as Record<string, unknown>).name === "string" &&
        typeof (i as Record<string, unknown>).price === "number" &&
        Number.isFinite((i as Record<string, unknown>).price as number) &&
        (typeof (i as Record<string, unknown>).qty === "undefined" ||
          (typeof (i as Record<string, unknown>).qty === "number" &&
            Number.isFinite((i as Record<string, unknown>).qty as number)))
    )
  ) {
    return false;
  }
  return (
    typeof v.tax === "number" &&
    Number.isFinite(v.tax) &&
    typeof v.service === "number" &&
    Number.isFinite(v.service) &&
    typeof v.total === "number" &&
    Number.isFinite(v.total)
  );
}

function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object in LLM response");
  return JSON.parse(candidate.slice(start, end + 1));
}

// Best-effort structured extraction via an LLM. Returns null (never throws) on any
// failure — missing key, network error, bad JSON, wrong shape — so callers can fall
// back to the regex-based parseReceiptText. Failures are logged (not thrown) so they
// show up in Vercel's runtime logs instead of failing silently.
export async function parseReceiptWithLlm(text: string): Promise<ParsedReceipt | null> {
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[llmReceiptParser] NINE_ROUTER_API_KEY not set, skipping LLM parse");
    return null;
  }
  if (!text.trim()) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.error("[llmReceiptParser] request failed", res.status, await res.text());
      return null;
    }

    const json = await res.json();
    const content: unknown = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.error("[llmReceiptParser] no message content in response", JSON.stringify(json));
      return null;
    }

    const parsed = extractJson(content);
    if (!isValidParsedReceipt(parsed)) {
      console.error("[llmReceiptParser] response failed shape validation", JSON.stringify(parsed));
      return null;
    }
    return { ...parsed, items: parsed.items.map((i) => ({ ...i, qty: i.qty ?? 1 })) };
  } catch (error) {
    console.error("[llmReceiptParser] threw", error instanceof Error ? error.message : error);
    return null;
  }
}
