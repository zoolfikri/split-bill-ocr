import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { parseReceiptText } from "@/lib/receiptParser";
import { parseReceiptWithLlm } from "@/lib/llmReceiptParser";
import { consumeDailyOcrQuota, DAILY_OCR_LIMIT } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const quota = await consumeDailyOcrQuota();
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily receipt scan limit reached (${DAILY_OCR_LIMIT}/day). Try again tomorrow.` },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OCR is not configured" }, { status: 500 });
  }

  try {
    const [visionRes, blob] = await Promise.all([
      fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      }),
      put(`receipts/${Date.now()}-${file.name}`, buffer, {
        access: "private",
        contentType: file.type,
      }),
    ]);

    if (!visionRes.ok) {
      return NextResponse.json({ error: "OCR request failed" }, { status: 502 });
    }

    const visionJson = await visionRes.json();
    const text: string = visionJson.responses?.[0]?.fullTextAnnotation?.text ?? "";
    if (visionJson.responses?.[0]?.error) {
      return NextResponse.json({ error: visionJson.responses[0].error.message }, { status: 502 });
    }

    const llmParsed = await parseReceiptWithLlm(text);
    const parsed = llmParsed ?? parseReceiptText(text);
    return NextResponse.json({ ...parsed, imageUrl: blob.url, parsedBy: llmParsed ? "llm" : "regex" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "OCR processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
