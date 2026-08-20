import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSplit } from "@/lib/splitCalculator";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const bill = await prisma.bill.findUnique({
    where: { slug },
    include: { items: { include: { assignments: true } }, people: true },
  });

  if (!bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const items = bill.items.map((item) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    personIds: item.assignments.map((a) => a.personId),
  }));

  const totals = calculateSplit(items, bill.people, Number(bill.tax), Number(bill.service));

  return NextResponse.json({
    slug: bill.slug,
    imageUrl: bill.imageUrl,
    tax: Number(bill.tax),
    service: Number(bill.service),
    total: Number(bill.total),
    items,
    people: bill.people,
    totals,
  });
}
