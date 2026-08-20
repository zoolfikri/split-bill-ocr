export type SplitItem = { id: string; name: string; price: number; personIds: string[] };
export type SplitPerson = { id: string; name: string };

export type PersonTotal = {
  personId: string;
  name: string;
  items: { name: string; share: number }[];
  subtotal: number;
  taxShare: number;
  serviceShare: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateSplit(
  items: SplitItem[],
  people: SplitPerson[],
  tax: number,
  service: number
): PersonTotal[] {
  const subtotalAll = items.reduce((sum, i) => sum + i.price, 0);

  const perPerson = new Map<string, PersonTotal>(
    people.map((p) => [
      p.id,
      { personId: p.id, name: p.name, items: [], subtotal: 0, taxShare: 0, serviceShare: 0, total: 0 },
    ])
  );

  for (const item of items) {
    if (item.personIds.length === 0) continue;
    const share = item.price / item.personIds.length;
    for (const personId of item.personIds) {
      const person = perPerson.get(personId);
      if (!person) continue;
      person.items.push({ name: item.name, share: round2(share) });
      person.subtotal += share;
    }
  }

  for (const person of perPerson.values()) {
    const proportion = subtotalAll > 0 ? person.subtotal / subtotalAll : 0;
    person.taxShare = round2(tax * proportion);
    person.serviceShare = round2(service * proportion);
    person.subtotal = round2(person.subtotal);
    person.total = round2(person.subtotal + person.taxShare + person.serviceShare);
  }

  return Array.from(perPerson.values());
}
