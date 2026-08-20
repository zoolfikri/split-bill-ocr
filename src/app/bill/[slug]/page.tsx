import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calculateSplit } from "@/lib/splitCalculator";

export default async function BillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const bill = await prisma.bill.findUnique({
    where: { slug },
    include: { items: { include: { assignments: true } }, people: true },
  });

  if (!bill) notFound();

  const items = bill.items.map((item) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    personIds: item.assignments.map((a) => a.personId),
  }));

  const tax = Number(bill.tax);
  const service = Number(bill.service);
  const totals = calculateSplit(items, bill.people, tax, service);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4 pb-10 sm:p-6">
      <h1 className="text-xl font-bold">Bill split</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Who owes what</h2>
        <div className="space-y-2">
          {totals.map((person) => (
            <details key={person.personId} className="group rounded-xl border border-border bg-surface open:pb-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
                <span className="min-w-0 break-words font-medium">{person.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-lg font-bold tabular-nums text-accent">{person.total.toFixed(2)}</span>
                  <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </span>
              </summary>
              <ul className="space-y-1 px-4 pb-3 text-sm text-muted">
                {person.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{i.name}</span>
                    <span className="shrink-0 tabular-nums">{i.share.toFixed(2)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">Tax share</span>
                  <span className="shrink-0 tabular-nums">{person.taxShare.toFixed(2)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">Service share</span>
                  <span className="shrink-0 tabular-nums">{person.serviceShare.toFixed(2)}</span>
                </li>
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Full receipt</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <ul className="divide-y divide-border text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 break-words">{item.name}</span>
                <span className="shrink-0 tabular-nums">{item.price.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm text-muted">
            <div className="flex justify-between gap-3">
              <span>Tax</span>
              <span className="tabular-nums">{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Service</span>
              <span className="tabular-nums">{service.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-3 text-base font-semibold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">{Number(bill.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
