import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Receipt photos are stored as private blobs, so anyone with the share link gets the
// image through this route instead of a direct blob URL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const bill = await prisma.bill.findUnique({ where: { slug }, select: { imageUrl: true } });
  if (!bill?.imageUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await get(bill.imageUrl, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
