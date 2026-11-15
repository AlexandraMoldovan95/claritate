// Tabel pivot: o coloană pe rânduri × o coloană pe coloane, cu totaluri.
// Doar aritmetică, ca restul aplicației. Sumele de bani sunt mereu pe O monedă (fără conversie).

import type { Analysis } from "./analyze.js";
import { monthName } from "./analyze.js";
import type { CleanRecord } from "./clean.js";
import { round2 } from "./clean.js";

export type Measure = "delivered" | "value" | "count" | "qty";
export const MEASURES: { id: Measure; label: string }[] = [
  { id: "delivered", label: "Valoare livrată" },
  { id: "value", label: "Valoare (toate statusurile)" },
  { id: "count", label: "Număr de comenzi" },
  { id: "qty", label: "Cantitate livrată" },
];

export interface PivotSpec { rows: string; cols: string | null; measure: Measure; currency?: string; month?: string }

export interface Pivot {
  spec: PivotSpec;
  rowLabel: string; colLabel: string | null; measureLabel: string;
  currency: string | null;                // moneda sumelor (null la numărare)
  columns: { key: string; label: string }[];
  rows: { key: string; cells: number[]; total: number }[];
  colTotals: number[]; grand: number;
  orders: number;                         // câte comenzi au intrat în pivot
  notes: string[];
}

/** Ce se poate pune pe rânduri/coloane în acest fișier. */
export function pivotDimensions(a: Analysis): { id: string; label: string }[] {
  const dims = a.columns.filter((c) => c.role === "category").map((c) => ({ id: c.name, label: c.name }));
  if (a.meta.hasDate) dims.push({ id: "luna", label: "Lună" });
  if (a.meta.hasStatus) dims.push({ id: "status", label: "Status" });
  if (a.meta.currencies.filter(Boolean).length > 1) dims.push({ id: "moneda", label: "Monedă" });
  return dims;
}

/** Pivotul implicit: Client × Lună, valoare livrată (sau ce există din astea). */
export function defaultPivotSpec(a: Analysis): PivotSpec {
  const dims = pivotDimensions(a).map((d) => d.id);
  const rows = a.meta.customerColumn ?? dims.find((d) => d !== "luna" && d !== "status" && d !== "moneda") ?? dims[0] ?? "status";
  const cols = dims.includes("luna") ? "luna" : dims.includes("status") && rows !== "status" ? "status" : null;
  const measure: Measure = a.meta.hasValue ? "delivered" : "count";
  return { rows, cols, measure };
}

const STATUS_ORDER = ["Livrată", "În curs", "Retur", "Anulată"];
const MAX_COLS = 24;

function dimValue(r: CleanRecord, dim: string): string | null {
  if (dim === "luna") return r.month;
  if (dim === "status") return r.status ?? "(fără status)";
  if (dim === "moneda") return r.currency || "(fără monedă)";
  return dim in r.cats ? r.cats[dim] : null;
}

export function buildPivot(a: Analysis, records: CleanRecord[], spec: PivotSpec): { pivot?: Pivot; error?: string } {
  const dims = pivotDimensions(a);
  const known = new Set(dims.map((d) => d.id));
  if (!known.has(spec.rows)) return { error: `Nu pot pune „${spec.rows}” pe rânduri.` };
  if (spec.cols && !known.has(spec.cols)) return { error: `Nu pot pune „${spec.cols}” pe coloane.` };
  if (spec.cols === spec.rows) return { error: "Rândurile și coloanele trebuie să fie diferite." };
  const measure = MEASURES.find((m) => m.id === spec.measure) ? spec.measure : "count";
  const notes: string[] = [];

  let rs = records;
  if (spec.month) rs = rs.filter((r) => r.month === spec.month);
  const money = measure === "delivered" || measure === "value";
  if ((measure === "delivered" || measure === "qty") && a.meta.hasStatus) rs = rs.filter((r) => r.status === "Livrată");
  else if (measure === "delivered" && !a.meta.hasStatus) notes.push("Fișierul nu are coloană de status: am luat toate comenzile ca livrate.");

  // banii se adună doar pe o monedă; dacă pivotul e chiar pe monedă, nu filtrăm
  let currency: string | null = null;
  if (money && spec.rows !== "moneda" && spec.cols !== "moneda") {
    const curs = [...new Set(records.map((r) => r.currency))];
    currency = spec.currency !== undefined && curs.includes(spec.currency) ? spec.currency : curs[0] ?? "";
    if (curs.length > 1) notes.push(`Sume în ${currency || "fără monedă"}; celelalte monede sunt în pivoturi separate (fără conversie).`);
    rs = rs.filter((r) => r.currency === currency);
  }

  const measureOf = (r: CleanRecord): number | null =>
    measure === "count" ? 1 : measure === "qty" ? r.quantity : r.value;

  const cells = new Map<string, Map<string, number>>();
  const colSum = new Map<string, number>();
  let orders = 0;
  for (const r of rs) {
    const x = measureOf(r);
    if (x === null) continue;
    const rk = dimValue(r, spec.rows);
    const ck = spec.cols ? dimValue(r, spec.cols) : "Total";
    if (rk === null || ck === null) continue;
    orders++;
    const row = cells.get(rk) ?? new Map<string, number>();
    row.set(ck, (row.get(ck) ?? 0) + x);
    cells.set(rk, row);
    colSum.set(ck, (colSum.get(ck) ?? 0) + x);
  }

  // ordinea coloanelor: luni cronologic, status în ordinea obișnuită, restul după total
  let colKeys = [...colSum.keys()];
  if (spec.cols === "luna") colKeys.sort();
  else if (spec.cols === "status") colKeys.sort((x, y) => ((STATUS_ORDER.indexOf(x) + 1) || 99) - ((STATUS_ORDER.indexOf(y) + 1) || 99));
  else colKeys.sort((x, y) => colSum.get(y)! - colSum.get(x)! || x.localeCompare(y, "ro"));
  // prea multe coloane → primele după total + „Altele” (luni: ultimele 24)
  let other: Set<string> | null = null;
  if (colKeys.length > MAX_COLS) {
    if (spec.cols === "luna") {
      other = new Set(colKeys.slice(0, colKeys.length - (MAX_COLS - 1)));
      colKeys = colKeys.slice(-(MAX_COLS - 1));
      notes.push(`Lunile mai vechi sunt adunate în „Altele”.`);
    } else {
      other = new Set(colKeys.slice(MAX_COLS - 1));
      colKeys = colKeys.slice(0, MAX_COLS - 1);
      notes.push(`Afișez primele ${MAX_COLS - 1} coloane după total; restul sunt în „Altele”.`);
    }
  }
  const OTHER = "\u0000altele";
  const columns = colKeys.map((k) => ({ key: k, label: spec.cols === "luna" && /^\d{4}-\d{2}$/.test(k) ? monthName(k) : k }));
  if (other) spec.cols === "luna" ? columns.unshift({ key: OTHER, label: "Altele" }) : columns.push({ key: OTHER, label: "Altele" });

  const fix = (n: number) => measure === "count" || measure === "qty" ? Math.round(n * 1000) / 1000 : round2(n);
  const rows = [...cells.entries()].map(([key, m]) => {
    const vals = columns.map((c) => c.key === OTHER ? [...m.entries()].filter(([k]) => other!.has(k)).reduce((s, [, v]) => s + v, 0) : m.get(c.key) ?? 0);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    return { key: spec.rows === "luna" && /^\d{4}-\d{2}$/.test(key) ? monthName(key) : key, sortKey: key, cells: vals.map(fix), total: fix(total) };
  });
  if (spec.rows === "luna") rows.sort((x, y) => x.sortKey.localeCompare(y.sortKey));
  else if (spec.rows === "status") rows.sort((x, y) => ((STATUS_ORDER.indexOf(x.sortKey) + 1) || 99) - ((STATUS_ORDER.indexOf(y.sortKey) + 1) || 99));
  else rows.sort((x, y) => y.total - x.total || x.key.localeCompare(y.key, "ro"));

  const colTotals = columns.map((_, i) => fix(rows.reduce((s, r) => s + r.cells[i], 0)));
  const grand = fix(rows.reduce((s, r) => s + r.total, 0));
  const label = (id: string | null) => id ? dims.find((d) => d.id === id)?.label ?? id : null;
  if (spec.month) notes.unshift(`Doar ${monthName(spec.month)}.`);

  return {
    pivot: {
      spec: { ...spec, measure },
      rowLabel: label(spec.rows)!, colLabel: label(spec.cols), measureLabel: MEASURES.find((m) => m.id === measure)!.label,
      currency, columns, rows: rows.map(({ key, cells, total }) => ({ key, cells, total })), colTotals, grand, orders, notes,
    },
  };
}

/** Pivotul ca CSV (separator „;” + BOM, pentru Excel în română). */
export function pivotCsv(p: Pivot): string {
  const esc = (v: string) => /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const num = (n: number) => String(n).replace(".", ",");
  const head = [`${p.rowLabel} \\ ${p.colLabel ?? ""}`.trim(), ...p.columns.map((c) => c.label), "Total"];
  const lines = [head, ...p.rows.map((r) => [r.key, ...r.cells.map(num), num(r.total)]), ["Total", ...p.colTotals.map(num), num(p.grand)]];
  return "﻿" + lines.map((l) => l.map(esc).join(";")).join("\r\n");
}
