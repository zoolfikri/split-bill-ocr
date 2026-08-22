// Minimal self-check for the money-math paths. Run with: node --experimental-strip-types src/lib/__tests__/logic.test.mjs
// (kept dependency-free on purpose; swap for a real test runner if the suite grows)
import assert from "node:assert";
import { calculateSplit } from "../splitCalculator.ts";
import { parseReceiptText } from "../receiptParser.ts";

// parseReceiptText: pulls items and totals out of raw OCR text (plain "name price" lines)
{
  const text = ["Fried Rice 25000", "Iced Tea 8000", "Tax 3300", "Service 1650", "Total 37950"].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [
    { name: "Fried Rice", price: 25000 },
    { name: "Iced Tea", price: 8000 },
  ]);
  assert.strictEqual(parsed.tax, 3300);
  assert.strictEqual(parsed.service, 1650);
  assert.strictEqual(parsed.total, 37950);
}

// parseReceiptText: Indonesian-style dot-thousands amounts ("42.000" = 42000, not 42.000)
{
  const text = ["Nasi Goreng 42.000", "Es Teh 8.000", "Grand Total 50.000"].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [
    { name: "Nasi Goreng", price: 42000 },
    { name: "Es Teh", price: 8000 },
  ]);
  assert.strictEqual(parsed.total, 50000);
}

// parseReceiptText: metadata lines (contain ':', trailing digits) must not become items,
// and name/price split across two lines should still pair up.
{
  const text = [
    "No : RPG202608020090",
    "Date : 02-08-2026 22:46",
    "Table : 39",
    "Creamy Salted Egg Chicken Bowl",
    "42.000",
    "Telur Rebus Setengah Matang",
    "7.000",
    "Subtotal : 389.000",
    "Service Charge : 19.450",
    "PB1 : 38.900",
    "Grand Total : 447.350",
  ].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [
    { name: "Creamy Salted Egg Chicken Bowl", price: 42000 },
    { name: "Telur Rebus Setengah Matang", price: 7000 },
  ]);
  assert.strictEqual(parsed.tax, 38900); // PB1
  assert.strictEqual(parsed.service, 19450);
  assert.strictEqual(parsed.total, 447350); // Grand Total, not Subtotal
}

// parseReceiptText: tax/service/total labels split onto their own line from the
// amount (common when Vision reads a wide gap between the label and the number)
// must still be captured, not silently dropped.
{
  const text = [
    "Nasi Goreng",
    "42.000",
    "Service Charge",
    ": 19.450",
    "PB1",
    ": 38.900",
    "Grand Total",
    ": 447.350",
  ].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [{ name: "Nasi Goreng", price: 42000 }]);
  assert.strictEqual(parsed.service, 19450);
  assert.strictEqual(parsed.tax, 38900);
  assert.strictEqual(parsed.total, 447350);
}

// parseReceiptText: "Subtotal" glued together with no colon (common OCR output) must be
// dropped, not leaked into items or mistaken for the grand total.
{
  const text = [
    "Nasi Goreng 42.000",
    "Es Teh 8.000",
    "Subtotal 50.000",
    "PB1 5.000",
    "Grand Total 55.000",
  ].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [
    { name: "Nasi Goreng", price: 42000 },
    { name: "Es Teh", price: 8000 },
  ]);
  assert.strictEqual(parsed.tax, 5000);
  assert.strictEqual(parsed.total, 55000);
}

// parseReceiptText: "<qty> x" on the price line (name on the previous line) must keep
// the real name, not "1 x"/"66 x", and must multiply the unit price by the quantity.
{
  const text = [
    "1 Jam Weekend",
    "1 x 40.000",
    "Time : 21:27 - 22:27",
    "Duration: 01:00",
    "Banana Milk",
    "1 x 20.000",
    "Mineral Water",
    "1 x 10.000",
    "Open Timer",
    "66 x 666",
    "Time : 22:31 - 23:37",
    "Duration(Happy Hour): 01:06",
    "Subtotal",
    "113.956",
    "Pembulatan",
    "44",
    "Total",
    "114.000",
  ].join("\n");
  const parsed = parseReceiptText(text);
  assert.deepStrictEqual(parsed.items, [
    { name: "1 Jam Weekend", price: 40000 },
    { name: "Banana Milk", price: 20000 },
    { name: "Mineral Water", price: 10000 },
    { name: "Open Timer", price: 43956 },
  ]);
  assert.strictEqual(parsed.total, 114000);
}

// calculateSplit: shared item splits evenly, tax/service prorated by subtotal share
{
  const items = [
    { id: "i1", name: "Fried Rice", price: 25000, personIds: ["a"] },
    { id: "i2", name: "Iced Tea", price: 8000, personIds: ["a", "b"] },
  ];
  const people = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }];
  const totals = calculateSplit(items, people, 3300, 1650);

  const alice = totals.find((t) => t.personId === "a");
  const bob = totals.find((t) => t.personId === "b");

  assert.strictEqual(alice.subtotal, 29000); // 25000 + 4000
  assert.strictEqual(bob.subtotal, 4000);
  assert.strictEqual(alice.total, alice.subtotal + alice.taxShare + alice.serviceShare);
  assert.strictEqual(Math.round((alice.taxShare + bob.taxShare) * 100), 330000); // sums back to 3300
}

console.log("ok");
