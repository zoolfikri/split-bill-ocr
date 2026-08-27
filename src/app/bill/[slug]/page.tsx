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
      <div className="space-y-1 text-center">
        <p className="font-ticket text-xs uppercase tracking-[0.2em] text-muted">🧾 Receipt split</p>
        <h1 className="font-ticket text-2xl font-bold">{Number(bill.total).toFixed(2)}</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Who owes what</h2>
        <div className="space-y-2">
          {totals.map((person) => (
            <details key={person.personId} className="group rounded-xl border border-border bg-surface open:pb-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
                <span className="min-w-0 break-words font-medium">{person.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-ticket text-lg font-bold text-accent">{person.total.toFixed(2)}</span>
                  <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </span>
              </summary>
              <ul className="space-y-1 px-4 pb-3 text-sm text-muted">
                {person.items.map((i, idx) => (
                  <li key={idx} className="flex items-baseline gap-2">
                    <span className="min-w-0 shrink break-words">{i.name}</span>
                    <span className="leader" />
                    <span className="font-ticket shrink-0">{i.share.toFixed(2)}</span>
                  </li>
                ))}
                <li className="flex items-baseline gap-2">
                  <span className="min-w-0 shrink break-words">Tax share</span>
                  <span className="leader" />
                  <span className="font-ticket shrink-0">{person.taxShare.toFixed(2)}</span>
                </li>
                <li className="flex items-baseline gap-2">
                  <span className="min-w-0 shrink break-words">Service share</span>
                  <span className="leader" />
                  <span className="font-ticket shrink-0">{person.serviceShare.toFixed(2)}</span>
                </li>
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Full receipt</h2>
        <div className="overflow-hidden rounded-xl border border-border shadow-sm">
          <div className="torn-edge" />
          <div className="bg-surface p-4">
            <ul className="divide-y divide-dotted divide-border text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex items-baseline gap-2 py-2">
                  <span className="min-w-0 shrink break-words">{item.name}</span>
                  <span className="leader" />
                  <span className="font-ticket shrink-0">{item.price.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2 text-sm text-muted">
              <div className="flex items-baseline gap-2">
                <span>Tax</span>
                <span className="leader" />
                <span className="font-ticket shrink-0">{tax.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span>Service</span>
                <span className="leader" />
                <span className="font-ticket shrink-0">{service.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-2 text-base font-semibold text-foreground">
                <span>Total</span>
                <span className="leader" />
                <span className="font-ticket shrink-0">{Number(bill.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="torn-edge torn-edge-bottom" />
        </div>
      </section>
    </main>
  );
}
