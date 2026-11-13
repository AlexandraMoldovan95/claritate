// Tot drumul: text CSV → structură → date curate → 6 dashboard-uri.

import { readCsv } from "./csv.js";
import { applyOverrides, detectColumns, findHeader, headerNames, pickDimensions, type Column, type Role } from "./detect.js";
import { cleanRows, type CleanRecord, type CleanReport } from "./clean.js";
import { buildDashboards, type Dashboards } from "./aggregate.js";

export interface Analysis {
  meta: {
    filename: string; delimiter: string; headerLine: number; preamble: string[];
    columns: number; rows: number; hasStatus: boolean; hasDate: boolean; hasValue: boolean;
    valueFormula: string; currencies: string[];
    customerColumn: string | null; productColumn: string | null;
  };
  columns: Column[];
  report: CleanReport;
  dashboards: Dashboards;
  preview: Record<string, unknown>[];
  suggestions: string[];
}

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 50_000;

export class AnalysisError extends Error {}

export function analyze(text: string, filename: string, overrides?: Record<string, Role>): { analysis: Analysis; records: CleanRecord[] } {
  if (!text || !text.trim()) throw new AnalysisError("Fișierul e gol.");
  if (text.length > MAX_BYTES) throw new AnalysisError("Fișierul e prea mare (maxim 5 MB).");
  if (/\u0000/.test(text.slice(0, 2000))) throw new AnalysisError("Nu pare un fișier CSV sau Excel recunoscut (conține date binare). Verifică extensia fișierului (.csv, .xlsx) și dacă nu e corupt sau protejat cu parolă.");

  const { rows, delimiter } = readCsv(text);
  if (rows.length > MAX_ROWS + 100) throw new AnalysisError(`Fișierul are peste ${MAX_ROWS.toLocaleString("ro-RO")} de rânduri.`);
  const header = findHeader(rows);
  const names = headerNames(rows[header.headerIndex] ?? [], header.width);
  if (names.length < 2) throw new AnalysisError("Nu am găsit un tabel cu cel puțin 2 coloane. Verifică dacă fișierul e un CSV.");

  const dataRows = rows.slice(header.headerIndex + 1).map((cells, i) => ({ cells, line: header.headerIndex + 2 + i }));
  // coloane detectate pe rândurile „probabil de date” (fără goale)
  const sample = dataRows.map((r) => r.cells).filter((c) => c.some((x) => x && x.trim()));
  const columns = applyOverrides(detectColumns(names, sample), overrides);

  const { records, report } = cleanRows(dataRows, columns);
  const has = (role: Role) => columns.some((c) => c.role === role);
  const dims = pickDimensions(columns);
  const hasStatus = has("status") && records.some((r) => r.status);
  const hasDate = has("date") && records.some((r) => r.date);
  const hasValue = records.some((r) => r.value !== null);

  const dashboards = buildDashboards(records, {
    hasStatus, hasDate, customer: dims.customer?.name, product: dims.product?.name,
  });

  const valueFormula = has("quantity") && has("unit_price")
    ? `${columns.find((c) => c.role === "quantity")!.name} × ${columns.find((c) => c.role === "unit_price")!.name}`
    : has("amount") ? columns.find((c) => c.role === "amount")!.name
    : has("unit_price") ? columns.find((c) => c.role === "unit_price")!.name
    : "—";

  const analysis: Analysis = {
    meta: {
      filename, delimiter: delimiter === "\t" ? "tab" : delimiter,
      headerLine: header.headerIndex + 1, preamble: header.preamble,
      columns: names.length, rows: records.length,
      hasStatus, hasDate, hasValue, valueFormula,
      currencies: [...new Set(records.map((r) => r.currency))],
      customerColumn: dims.customer?.name ?? null, productColumn: dims.product?.name ?? null,
    },
    columns,
    report,
    dashboards,
    preview: records.slice(0, 25).map((r) => ({
      linia: r.line, id: r.id, data: r.date, ...r.cats, status: r.status,
      cantitate: r.quantity, pret: r.unitPrice, valoare: r.value, moneda: r.currency,
    })),
    suggestions: suggestQuestions({ hasStatus, hasDate, customer: dims.customer?.name, product: dims.product?.name, dashboards }),
  };
  return { analysis, records };
}

const MONTHS_RO = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
export const monthName = (m: string) => `${MONTHS_RO[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function suggestQuestions(o: { hasStatus: boolean; hasDate: boolean; customer?: string; product?: string; dashboards: Dashboards }): string[] {
  const q: string[] = [];
  q.push(o.hasStatus ? "Care este venitul livrat total?" : "Care este valoarea totală?");
  if (o.customer) q.push(`Care sunt primii 5 după venit, pe ${o.customer.toLowerCase()}?`);
  if (o.hasStatus) q.push("Câte comenzi au fost anulate?");
  if (o.hasDate) {
    const m = o.dashboards.months.byCurrency[0]?.best[0];
    q.push(m ? `Cât s-a livrat în ${monthName(m)}?` : "Care este venitul pe fiecare lună?");
  }
  if (o.product && q.length < 4) q.push(`Care ${o.product.toLowerCase()} aduce cel mai mult venit?`);
  return q.slice(0, 4);
}
