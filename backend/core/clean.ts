// Curățare deterministă — fără model. Ordinea pașilor e cea din CLAUDE.md.

import type { Column } from "./detect.js";
import {
  detectDateOrder, detectDecimalSep, isNullish, normalizeCurrency,
  normalizeStatus, parseDate, parseNumber, textKey, tidy, type DecimalSep, type DateOrder,
} from "./normalize.js";

export interface CleanRecord {
  line: number;                    // linia din fișier (1-based), pentru raport
  id: string | null;
  date: string | null;             // YYYY-MM-DD
  month: string | null;            // YYYY-MM
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  value: number | null;            // cantitate × preț, sau sumă
  currency: string;                // "" dacă fișierul nu are monedă
  status: string | null;           // Livrată / Retur / Anulată / În curs / altceva
  cats: Record<string, string>;    // numele coloanei → forma afișată (canonică)
  nums: Record<string, number>;    // alte coloane numerice
  conflict: boolean;               // ID duplicat cu conținut diferit
}

export interface RemovedRow { line: number; reason: "gol" | "total" | "duplicat"; preview: string }

export interface CleanReport {
  linesAfterHeader: number;
  empty: number;
  totals: number;
  duplicates: number;
  kept: number;
  conflicts: { id: string; lines: number[] }[];
  noValue: number;              // rânduri păstrate, dar fără valoare numerică
  invalidDates: number;
  repairedNumbers: number;      // „1.841,86” → 1841.86 etc.
  mergedVariants: { column: string; canonical: string; variants: string[] }[];
  statusVariants: { raw: string; normalized: string }[];
  unknownStatuses: string[];
  noIdColumn: boolean;
  removed: RemovedRow[];        // primele 50, pentru detalii în interfață
}

const TOTAL_RE = /^(total|subtotal|sub total|totaluri|sumar|grand total|total general|total partial|sum|suma totala)\b/;

export function cleanRows(
  dataRows: { cells: string[]; line: number }[],
  cols: Column[],
): { records: CleanRecord[]; report: CleanReport } {
  const byRole = (role: Column["role"]) => cols.find((c) => c.role === role);
  const idCol = byRole("id"), dateCol = byRole("date"), qtyCol = byRole("quantity");
  const priceCol = byRole("unit_price"), amountCol = byRole("amount");
  const curCol = byRole("currency"), statusCol = byRole("status");
  const catCols = cols.filter((c) => c.role === "category");
  const numCols = cols.filter((c) => c.role === "number");

  const report: CleanReport = {
    linesAfterHeader: dataRows.length, empty: 0, totals: 0, duplicates: 0, kept: 0,
    conflicts: [], noValue: 0, invalidDates: 0, repairedNumbers: 0,
    mergedVariants: [], statusVariants: [], unknownStatuses: [], noIdColumn: !idCol, removed: [],
  };
  const note = (line: number, reason: RemovedRow["reason"], cells: string[]) => {
    if (report.removed.length < 50) {
      report.removed.push({ line, reason, preview: cells.map(tidy).filter(Boolean).join(" · ").slice(0, 120) });
    }
  };

  // 1–3: celule curățate, rânduri goale și rânduri de total scoase
  const rows: { cells: string[]; line: number }[] = [];
  for (const r of dataRows) {
    const cells = cols.map((c) => (isNullish(r.cells[c.index]) ? "" : tidy(r.cells[c.index])));
    if (cells.every((c) => c === "")) { report.empty++; continue; }
    if (isTotalRow(cells, cols)) { report.totals++; note(r.line, "total", cells); continue; }
    rows.push({ cells, line: r.line });
  }

  // setări pe coloană: separator zecimal, ordinea în dată
  const decOf = new Map<number, DecimalSep>();
  for (const c of [qtyCol, priceCol, amountCol, ...numCols]) {
    if (c) decOf.set(c.index, detectDecimalSep(rows.map((r) => r.cells[c.index]).filter(Boolean)));
  }
  const dateOrder: DateOrder = dateCol ? detectDateOrder(rows.map((r) => r.cells[dateCol.index])) : "dmy";

  // 6: forma canonică pentru fiecare categorie (cea mai frecventă; la egalitate
  //    cea care nu e toată minuscule/majuscule, apoi prima apariție)
  const canon = new Map<number, Map<string, string>>();
  for (const c of catCols) canon.set(c.index, canonicalForms(rows.map((r) => r.cells[c.index]), c.name, report));

  const num = (c: Column | undefined, cells: string[]) => {
    if (!c || !cells[c.index]) return { v: null as number | null, cur: undefined as string | undefined };
    const p = parseNumber(cells[c.index], decOf.get(c.index));
    if (!p) return { v: null, cur: undefined };
    if (p.repaired) report.repairedNumbers++;
    return { v: p.value, cur: p.currency };
  };

  const statusSeen = new Map<string, string>();
  const records: CleanRecord[] = [];
  for (const { cells, line } of rows) {
    const q = num(qtyCol, cells), p = num(priceCol, cells), a = num(amountCol, cells);
    let value: number | null = null;
    if (q.v !== null && p.v !== null) value = round2(q.v * p.v);
    else if (a.v !== null) value = a.v;
    else if (p.v !== null && !qtyCol) value = p.v;

    let date: string | null = null;
    if (dateCol && cells[dateCol.index]) {
      date = parseDate(cells[dateCol.index], dateOrder);
      if (!date) report.invalidDates++;
    }

    let status: string | null = null;
    if (statusCol && cells[statusCol.index]) {
      const raw = cells[statusCol.index];
      status = normalizeStatus(raw);
      if (status && !statusSeen.has(raw)) statusSeen.set(raw, status);
    }

    const currency = (curCol && normalizeCurrency(cells[curCol.index])) || p.cur || a.cur || "";
    const cats: Record<string, string> = {};
    for (const c of catCols) {
      const raw = cells[c.index];
      cats[c.name] = raw ? canon.get(c.index)!.get(textKey(raw)) ?? raw : "(necompletat)";
    }
    const nums: Record<string, number> = {};
    for (const c of numCols) { const n = num(c, cells); if (n.v !== null) nums[c.name] = n.v; }

    if (value === null && (qtyCol || priceCol || amountCol)) report.noValue++;
    records.push({
      line, id: idCol ? (cells[idCol.index] || null) : null,
      date, month: date ? date.slice(0, 7) : null,
      quantity: q.v, unitPrice: p.v, amount: a.v, value,
      currency, status, cats, nums, conflict: false,
    });
  }

  report.statusVariants = [...statusSeen.entries()].map(([raw, normalized]) => ({ raw, normalized }));
  report.unknownStatuses = [...new Set([...statusSeen.values()]
    .filter((s) => !["Livrată", "Retur", "Anulată", "În curs"].includes(s)))];

  // 8: deduplicare pe ID
  const out = idCol ? dedupe(records, report) : records;
  report.kept = out.length;
  return { records: out, report };
}

function isTotalRow(cells: string[], cols: Column[]): boolean {
  const get = (role: Column["role"]) => cols.filter((c) => c.role === role).map((c) => cells[c.index]);
  // eticheta „TOTAL...” poate apărea în orice coloană de identificare (id sau
  // categorie), nu neapărat în prima celulă din rând — poziția ei depinde de
  // ordinea coloanelor din fișier, care diferă de la un export la altul.
  const labelValues = [...get("id"), ...get("category")].filter((v) => v !== "");
  if (labelValues.some((v) => TOTAL_RE.test(textKey(v)))) return true;
  // „doar sumă și restul gol”: fără ID, fără dată, fără nicio categorie, dar cu un număr
  const hasKeyInfo = [...get("id"), ...get("date"), ...get("category"), ...get("status")].some((v) => v !== "");
  const hasNumber = [...get("amount"), ...get("unit_price"), ...get("quantity")].some((v) => v !== "");
  const hasKeyColumns = cols.some((c) => ["id", "date", "category"].includes(c.role));
  return hasKeyColumns && !hasKeyInfo && hasNumber;
}

function canonicalForms(values: string[], column: string, report: CleanReport): Map<string, string> {
  const groups = new Map<string, Map<string, { count: number; first: number }>>();
  values.forEach((v, i) => {
    if (!v) return;
    const k = textKey(v);
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k)!;
    const e = g.get(v) ?? { count: 0, first: i };
    e.count++;
    g.set(v, e);
  });
  const result = new Map<string, string>();
  for (const [k, variants] of groups) {
    const sorted = [...variants.entries()].sort((a, b) =>
      b[1].count - a[1].count ||
      Number(isMixedCase(b[0])) - Number(isMixedCase(a[0])) ||
      a[1].first - b[1].first
    );
    const canonical = sorted[0][0];
    result.set(k, canonical);
    if (variants.size > 1) {
      report.mergedVariants.push({ column, canonical, variants: sorted.map(([v]) => v) });
    }
  }
  return result;
}

const isMixedCase = (s: string) => s !== s.toLowerCase() && s !== s.toUpperCase();

function signature(r: CleanRecord): string {
  return JSON.stringify([r.date, r.quantity, r.unitPrice, r.amount, r.currency, r.status,
    Object.entries(r.cats).map(([k, v]) => [k, textKey(v)]), r.nums]);
}

function dedupe(records: CleanRecord[], report: CleanReport): CleanRecord[] {
  const byId = new Map<string, CleanRecord[]>();
  const out: CleanRecord[] = [];
  for (const r of records) {
    if (!r.id) { out.push(r); continue; }
    const key = textKey(r.id);
    const prev = byId.get(key) ?? [];
    const sig = signature(r);
    if (prev.some((p) => signature(p) === sig)) {
      report.duplicates++;
      if (report.removed.length < 50) report.removed.push({ line: r.line, reason: "duplicat", preview: `${r.id} (identic cu un rând de mai sus)` });
      continue;
    }
    if (prev.length > 0) {
      for (const p of prev) p.conflict = true;
      r.conflict = true;
      const existing = report.conflicts.find((c) => textKey(c.id) === key);
      if (existing) existing.lines.push(r.line);
      else report.conflicts.push({ id: r.id, lines: [...prev.map((p) => p.line), r.line] });
    }
    prev.push(r);
    byId.set(key, prev);
    out.push(r);
  }
  return out;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
