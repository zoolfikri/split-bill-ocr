"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Assignment = { personId: string; units: number };
type Item = { id: string; name: string; price: number; qty: number; assignments: Assignment[] };
type Person = { id: string; name: string };
type Step = "upload" | "review" | "people" | "assign";

type BillState = {
  step: Step;
  imageUrl?: string;
  items: Item[];
  tax: number;
  service: number;
  total: number;
  people: Person[];
  parsedBy?: string;
  llmError?: string;
  ocrText: string;
};

const DRAFT_KEY = "split-bill-draft";
const uid = () => Math.random().toString(36).slice(2, 10);

const INITIAL_BILL: BillState = {
  step: "upload",
  imageUrl: undefined,
  items: [],
  tax: 0,
  service: 0,
  total: 0,
  people: [],
  parsedBy: undefined,
  llmError: undefined,
  ocrText: "",
};

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Scan" },
  { id: "review", label: "Review" },
  { id: "people", label: "People" },
  { id: "assign", label: "Split" },
];

// Reads an in-progress bill left over from a page reload/close before saving.
function readDraft(): BillState | undefined {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return undefined;
  }
}

export default function Home() {
  const router = useRouter();
  const [bill, setBill] = useState<BillState>(INITIAL_BILL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newPersonName, setNewPersonName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const { step, imageUrl, items, tax, service, total, people, parsedBy, llmError, ocrText } = bill;

  function updateBill(patch: Partial<BillState>) {
    setBill((prev) => ({ ...prev, ...patch }));
  }

  // Restore a draft after mount only — matching the server-rendered (empty) HTML on
  // first paint keeps hydration consistent, since localStorage isn't available server-side.
  // Restoring from localStorage (an external system) is deliberately deferred to after
  // mount, so the first client render matches the server-rendered HTML instead of causing
  // a hydration mismatch.
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setBill(draft);
    }
  }, []);

  // Persist every change so users don't lose the extraction by leaving the page.
  useEffect(() => {
    if (step === "upload" && items.length === 0) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(bill));
  }, [bill, step, items.length]);

  function startNew() {
    localStorage.removeItem(DRAFT_KEY);
    setBill(INITIAL_BILL);
    setNewPersonName("");
    setError("");
  }

  async function handleUpload(file: File) {
    setLoading(true);
    setError("");
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OCR failed");
      updateBill({
        step: "review",
        imageUrl: data.imageUrl,
        items: data.items.map((i: { name: string; price: number; qty?: number }) => ({
          ...i,
          qty: i.qty ?? 1,
          id: uid(),
          assignments: [],
        })),
        tax: data.tax,
        service: data.service,
        total: data.total,
        parsedBy: data.parsedBy,
        llmError: data.llmError,
        ocrText: data.ocrText ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPreviewUrl(undefined);
    } finally {
      setLoading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  function updateItem(id: string, patch: Partial<Item>) {
    updateBill({ items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  function removeItem(id: string) {
    updateBill({ items: items.filter((i) => i.id !== id) });
  }

  function addItem() {
    updateBill({ items: [...items, { id: uid(), name: "", price: 0, qty: 1, assignments: [] }] });
  }

  function addPerson() {
    const name = newPersonName.trim();
    if (!name) return;
    updateBill({ people: [...people, { id: uid(), name }] });
    setNewPersonName("");
  }

  function removePerson(id: string) {
    updateBill({
      people: people.filter((p) => p.id !== id),
      items: items.map((i) => ({ ...i, assignments: i.assignments.filter((a) => a.personId !== id) })),
    });
  }

  function toggleAssignment(itemId: string, personId: string) {
    updateBill({
      items: items.map((i) =>
        i.id === itemId
          ? {
              ...i,
              assignments: i.assignments.some((a) => a.personId === personId)
                ? i.assignments.filter((a) => a.personId !== personId)
                : [...i.assignments, { personId, units: 1 }],
            }
          : i
      ),
    });
  }

  function setAssignmentUnits(itemId: string, personId: string, units: number) {
    const clamped = Math.max(1, Math.round(units) || 1);
    updateBill({
      items: items.map((i) =>
        i.id === itemId
          ? {
              ...i,
              assignments: i.assignments.map((a) =>
                a.personId === personId ? { ...a, units: clamped } : a
              ),
            }
          : i
      ),
    });
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
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/bill/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const itemsSubtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  const unassignedCount = items.filter((i) => i.assignments.length === 0).length;
  const expectedTotal = itemsSubtotal + tax + service;
  const totalMismatch = Math.round((total - expectedTotal) * 100) / 100;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 font-ticket text-lg font-bold tracking-tight">
              <svg viewBox="0 0 64 64" className="h-7 w-7 shrink-0" aria-hidden="true">
                <rect width="64" height="64" rx="14" fill="var(--foreground)" />
                <path
                  d="M18 10 H46 V40 L42 44 L38 40 L34 44 L30 40 L26 44 L22 40 L18 44 Z"
                  fill="var(--background)"
                />
                <line x1="22" y1="18" x2="38" y2="18" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="22" y1="24" x2="42" y2="24" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="22" y1="30" x2="34" y2="30" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="46" cy="45" r="10" fill="var(--accent)" stroke="var(--foreground)" strokeWidth="2" />
                <path
                  d="M41.5 45 L44.5 48 L50.5 41.5"
                  fill="none"
                  stroke="var(--accent-foreground)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Split Bill
            </h1>
            {step !== "upload" && (
              <button
                onClick={startNew}
                className="min-h-8 rounded-full border border-border px-3 text-xs font-medium text-muted active:bg-surface"
              >
                New
              </button>
            )}
          </div>
          <ol className="mt-3 flex items-center">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`font-ticket flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
                      i <= stepIndex
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={`hidden text-[10px] sm:inline ${i === stepIndex ? "font-semibold" : "text-muted"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-1.5 mb-4 h-px flex-1 border-t-2 border-dotted transition-colors sm:mb-3.5 ${
                      i < stepIndex ? "border-accent" : "border-border"
                    }`}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4 pb-28">
        {error && <p className="rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</p>}

        {step === "upload" && (
          <div className="space-y-5 pt-6 text-center">
            <div className="space-y-1">
              <p className="font-ticket text-xs uppercase tracking-[0.2em] text-muted">
                {loading ? "Scanning" : "Ready to scan"}
              </p>
              <p className="text-muted">
                {loading ? "Reading your receipt with AI…" : "Feed in a receipt and I'll pull out the items."}
              </p>
            </div>

            {loading && previewUrl ? (
              <div className="scan-frame relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-accent/50 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote image */}
                <img src={previewUrl} alt="Selected receipt" className="h-full w-full object-cover" />
                <div className="scan-overlay" />
                <span className="absolute left-2 top-2 h-6 w-6 rounded-tl-md border-l-2 border-t-2 border-accent" />
                <span className="absolute right-2 top-2 h-6 w-6 rounded-tr-md border-r-2 border-t-2 border-accent" />
                <span className="absolute bottom-2 left-2 h-6 w-6 rounded-bl-md border-b-2 border-l-2 border-accent" />
                <span className="absolute bottom-2 right-2 h-6 w-6 rounded-br-md border-b-2 border-r-2 border-accent" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border p-6 text-center active:bg-surface">
                  <span className="text-4xl">🖼️</span>
                  <span className="font-medium">Choose photo</span>
                  <span className="text-sm text-muted">from your gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={loading}
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    className="hidden"
                  />
                </label>
                <label className="relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border p-6 text-center active:bg-surface">
                  <span className="text-4xl">📷</span>
                  <span className="font-medium">Take photo</span>
                  <span className="text-sm text-muted">with your camera</span>
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
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <h2 className="font-semibold">Check the detected items</h2>
            {parsedBy && (
              <p className="text-xs text-muted">
                Parsed via {parsedBy === "llm" ? "AI (LLM)" : "regex fallback"}
                {parsedBy === "regex" && llmError && ` — AI error: ${llmError}`}
              </p>
            )}
            {ocrText && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer select-none">Raw OCR text</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-2">
                  {ocrText}
                </pre>
              </details>
            )}
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_2.75rem] gap-2 px-1 text-xs text-muted sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_2.75rem]">
              <span className="text-center">Qty</span>
              <span>Item name</span>
              <span className="text-right">Price</span>
              <span />
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-2 sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_2.75rem]"
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step="1"
                    aria-label="Quantity"
                    className="font-ticket min-h-11 min-w-0 rounded-lg border border-border bg-surface px-1 py-2 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, { qty: parseInt(e.target.value, 10) || 1 })}
                  />
                  <input
                    className="min-h-11 min-w-0 rounded-lg border border-border bg-surface px-3 py-2"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Item name"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    className="font-ticket min-h-11 min-w-0 rounded-lg border border-border bg-surface px-2 py-2 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
              className="min-h-11 rounded-full border border-border px-4 text-sm active:bg-surface"
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
                  onChange={(e) => updateBill({ tax: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => updateBill({ service: parseFloat(e.target.value) || 0 })}
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
                  onChange={(e) => updateBill({ total: parseFloat(e.target.value) || 0 })}
                />
              </label>
            </div>
            <p className="flex items-baseline gap-2 text-sm text-muted">
              Items subtotal
              <span className="leader" />
              <span className="font-ticket text-foreground">{itemsSubtotal.toFixed(2)}</span>
            </p>

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
                className="min-h-11 rounded-full border border-border px-4 active:bg-surface"
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
            <p className="text-sm text-muted">
              Tap everyone who shared each item. Tax &amp; service split proportionally.
            </p>
            <div className="space-y-3">
              {items.map((item) => {
                const assignedUnits = item.assignments.reduce((sum, a) => sum + a.units, 0);
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-baseline gap-2 font-medium">
                      <span className="min-w-0 shrink break-words">
                        {item.qty > 1 && <span className="font-ticket text-muted">{item.qty}× </span>}
                        {item.name || "(unnamed item)"}
                      </span>
                      <span className="leader" />
                      <span className="font-ticket shrink-0">{item.price.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {people.map((p) => {
                        const assignment = item.assignments.find((a) => a.personId === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                              assignment ? "border-accent bg-accent text-accent-foreground" : "border-border"
                            }`}
                          >
                            <button type="button" onClick={() => toggleAssignment(item.id, p.id)}>
                              {p.name}
                            </button>
                            {assignment && item.qty > 1 && (
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step="1"
                                aria-label={`${p.name}'s share of ${item.name || "item"}`}
                                className="font-ticket min-h-6 w-9 rounded-full border border-accent-foreground/30 bg-transparent px-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                value={assignment.units}
                                onChange={(e) =>
                                  setAssignmentUnits(item.id, p.id, parseInt(e.target.value, 10))
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {item.qty > 1 && item.assignments.length > 0 && assignedUnits !== item.qty && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        {assignedUnits} of {item.qty} units assigned
                      </p>
                    )}
                  </div>
                );
              })}
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
              onClick={() => updateBill({ step: "people" })}
              disabled={items.length === 0}
              className="min-h-12 flex-1 rounded-full bg-accent font-medium text-accent-foreground shadow-sm active:brightness-95 disabled:opacity-40"
            >
              Next: add people
            </button>
          )}
          {step === "people" && (
            <>
              <button
                onClick={() => updateBill({ step: "review" })}
                className="min-h-12 flex-1 rounded-full border border-border font-medium active:bg-surface"
              >
                Back
              </button>
              <button
                onClick={() => updateBill({ step: "assign" })}
                disabled={people.length === 0}
                className="min-h-12 flex-1 rounded-full bg-accent font-medium text-accent-foreground shadow-sm active:brightness-95 disabled:opacity-40"
              >
                Next: assign items
              </button>
            </>
          )}
          {step === "assign" && (
            <>
              <button
                onClick={() => updateBill({ step: "people" })}
                className="min-h-12 flex-1 rounded-full border border-border font-medium active:bg-surface"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="min-h-12 flex-1 rounded-full bg-accent font-medium text-accent-foreground shadow-sm active:brightness-95 disabled:opacity-40"
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
