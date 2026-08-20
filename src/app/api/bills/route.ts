import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";

type SaveItem = { name: string; price: number; personIds: string[] };
type SavePerson = { id: string; name: string };
type SaveBody = {
  imageUrl?: string;
  tax: number;
  service: number;
  total: number;
  items: SaveItem[];
  people: SavePerson[];
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SaveBody;

  if (!body.items?.length || !body.people?.length) {
    return NextResponse.json({ error: "At least one item and one person are required" }, { status: 400 });
  }

  const slug = nanoid(10);

  const bill = await prisma.bill.create({
    data: {
      slug,
      imageUrl: body.imageUrl,
      tax: body.tax || 0,
      service: body.service || 0,
      total: body.total || 0,
      people: { create: body.people.map((p) => ({ name: p.name })) },
    },
    include: { people: true },
  });

  const personIdByClientId = new Map(bill.people.map((p, i) => [body.people[i].id, p.id]));

  for (const item of body.items) {
    await prisma.item.create({
      data: {
        billId: bill.id,
        name: item.name,
        price: item.price,
        assignments: {
          create: item.personIds
            .map((clientId) => personIdByClientId.get(clientId))
            .filter((id): id is string => Boolean(id))
            .map((personId) => ({ personId })),
        },
      },
    });
  }

  return NextResponse.json({ slug });
}
