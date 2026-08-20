"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Item = { id: string; name: string; price: number; personIds: string[] };
type Person = { id: string; name: string };
type Step = "upload" | "review" | "people" | "assign";

const uid = () => Math.random().toString(36).slice(2, 10);

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Scan" },
  { id: "review", label: "Review" },
  { id: "people", label: "People" },
  { id: "assign", label: "Split" },
];

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [items, setItems] = useState<Item[]>([]);
  const [tax, setTax] = useState(0);
  const [service, setService] = useState(0);
  const [total, setTotal] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [newPersonName, setNewPersonName] = useState("");

  async function handleUpload(file: File) {
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OCR failed");
      setImageUrl(data.imageUrl);
      setItems(data.items.map((i: { name: string; price: number }) => ({ ...i, id: uid(), personIds: [] })));
      setTax(data.tax);
      setService(data.service);
      setTotal(data.total);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function addItem() {
    setItems((prev) => [...prev, { id: uid(), name: "", price: 0, personIds: [] }]);
  }

  function addPerson() {
    const name = newPersonName.trim();
    if (!name) return;
    setPeople((prev) => [...prev, { id: uid(), name }]);
    setNewPersonName("");
  }

  function removePerson(id: string) {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setItems((prev) => prev.map((i) => ({ ...i, personIds: i.personIds.filter((pid) => pid !== id) })));
  }

  function toggleAssignment(itemId: string, personId: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              personIds: i.personIds.includes(personId)
                ? i.personIds.filter((id) => id !== personId)
                : [...i.personIds, personId],
            }
          : i
      )
    );
  }

  async function handleSave() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, tax, service, total, items, people }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.push(`/bill/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const itemsSubtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const unassignedCount = items.filter((i) => i.personIds.length === 0).length;
  const expectedTotal = itemsSubtotal + tax + service;
  const totalMismatch = Math.round((total - expectedTotal) * 100) / 100;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <h1 className="text-lg font-bold">Split Bill OCR</h1>
          <ol className="mt-2 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex flex-1 items-center gap-2">
                <div
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= stepIndex ? "bg-accent" : "bg-border"
                  }`}
                />
                <span className={`hidden text-xs sm:inline ${i === stepIndex ? "font-semibold" : "text-muted"}`}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4 pb-28">
        {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-muted">Upload a photo of your receipt to get started.</p>
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center active:bg-surface">
              <span className="text-4xl">🧾</span>
              <span className="font-medium">{loading ? "Reading receipt…" : "Tap to choose a photo"}</span>
              <span className="text-sm text-muted">or take one with your camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Check the detected items</h2>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Item name"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    className="min-h-11 w-24 rounded-lg border border-border bg-surface px-3 py-2"
                    value={item.price}
                    onChange={(e) => updateItem(item.id, { price: parseFloat(e.target.value) || 0 })}
                  />
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove item"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-red-600 active:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="min-h-11 rounded-lg border border-border px-4 text-sm active:bg-surface"
            >
              + Add item
            </button>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-sm">
                Tax
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={tax}
                  onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm">
                Service
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={service}
                  onChange={(e) => setService(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm">
                Total
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"
                  value={total}
                  onChange={(e) => setTotal(parseFloat(e.target.value) || 0)}
                />
              </label>
            </div>
            <p className="text-sm text-muted">Items subtotal: {itemsSubtotal.toFixed(2)}</p>

            {Math.abs(totalMismatch) > 0.01 && (
              <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                Items + tax + service ({expectedTotal.toFixed(2)}) doesn&apos;t match the total ({total.toFixed(2)}) —
                off by {Math.abs(totalMismatch).toFixed(2)}. Check for a missing/extra item, a misread price, or
                another charge (e.g. discount, delivery fee) not reflected above.
              </p>
            )}
          </div>
        )}

        {step === "people" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Who&apos;s splitting this bill?</h2>
            <div className="flex gap-2">
              <input
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
                placeholder="Name"
              />
              <button
                onClick={addPerson}
                className="min-h-11 rounded-lg border border-border px-4 active:bg-surface"
              >
                Add
              </button>
            </div>
            <ul className="space-y-2">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                >
                  {p.name}
                  <button
                    onClick={() => removePerson(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="flex h-8 w-8 items-center justify-center text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === "assign" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Who ordered what?</h2>
            <p className="text-sm text-muted">Tap everyone who shared each item. Tax &amp; service split proportionally.</p>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex justify-between gap-3 font-medium">
                    <span className="min-w-0 break-words">{item.name || "(unnamed item)"}</span>
                    <span className="shrink-0 tabular-nums">{item.price.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {people.map((p) => (
                      <label
                        key={p.id}
                        className={`min-h-9 cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                          item.personIds.includes(p.id)
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={item.personIds.includes(p.id)}
                          onChange={() => toggleAssignment(item.id, p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {unassignedCount > 0 && (
              <p className="text-sm text-amber-600">{unassignedCount} item(s) have no one assigned and won&apos;t be charged to anyone.</p>
            )}
          </div>
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl gap-3 p-4">
          {step === "review" && (
            <button
              onClick={() => setStep("people")}
              disabled={items.length === 0}
              className="min-h-12 flex-1 rounded-lg bg-accent font-medium text-accent-foreground disabled:opacity-40"
            >
              Next: add people
            </button>
          )}
          {step === "people" && (
            <>
              <button
                onClick={() => setStep("review")}
                className="min-h-12 flex-1 rounded-lg border border-border font-medium active:bg-surface"
              >
                Back
              </button>
              <button
                onClick={() => setStep("assign")}
                disabled={people.length === 0}
                className="min-h-12 flex-1 rounded-lg bg-accent font-medium text-accent-foreground disabled:opacity-40"
              >
                Next: assign items
              </button>
            </>
          )}
          {step === "assign" && (
            <>
              <button
                onClick={() => setStep("people")}
                className="min-h-12 flex-1 rounded-lg border border-border font-medium active:bg-surface"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="min-h-12 flex-1 rounded-lg bg-accent font-medium text-accent-foreground disabled:opacity-40"
              >
                {loading ? "Saving…" : "Save & get share link"}
              </button>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
