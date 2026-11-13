// Găsește rândul real de antet și rolul fiecărei coloane.
// Nu depinde de ordinea coloanelor și nici de numele exacte.

import {
  isNullish, looksLikeDate, looksNumeric, normalizeCurrency, normalizeStatus,
  isKnownStatus, parseDate, detectDateOrder, textKey, tidy,
} from "./normalize";

export type Role =
  | "id" | "date" | "quantity" | "unit_price" | "amount" | "currency"
  | "status" | "category" | "number" | "text" | "ignore";

export const ROLE_LABELS: Record<Role, string> = {
  id: "ID / nr. comandă",
  date: "Dată",
  quantity: "Cantitate",
  unit_price: "Preț unitar",
  amount: "Valoare / sumă",
  currency: "Monedă",
  status: "Status",
  category: "Categorie (client, produs…)",
  number: "Număr (altă măsură)",
  text: "Text liber",
  ignore: "Ignorată",
};

export interface Column {
  index: number;
  name: string;
  role: Role;
  detectedBy: "nume" | "conținut" | "manual";
  distinct: number;
  filled: number;
  samples: string[];
}

export interface HeaderInfo {
  headerIndex: number;      // index în rows (0-based)
  preamble: string[];       // rândurile narative de deasupra antetului
  width: number;
}

const nonEmpty = (r: string[]) => r.filter((c) => !isNullish(c)).length;

/**
 * Antetul = primul rând cu ≥ 2 celule nevide, majoritatea non-numerice și
 * non-dată, urmat de rânduri de date cu o lățime compatibilă.
 */
export function findHeader(rows: string[][]): HeaderInfo {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    const filled = r.filter((c) => !isNullish(c));
    if (filled.length < 2) continue;
    const textual = filled.filter((c) => !looksNumeric(c) && !looksLikeDate(c)).length;
    if (textual / filled.length < 0.7) continue;
    // următoarele rânduri nevide trebuie să aibă cam aceeași lățime
    const next = rows.slice(i + 1, i + 12).filter((x) => nonEmpty(x) >= 2);
    if (next.length === 0) continue;
    const width = lastFilled(r) + 1;
    const compatible = next.filter((x) => Math.abs(x.length - r.length) <= 1 || lastFilled(x) < width + 1);
    if (compatible.length / next.length < 0.6) continue;
    const preamble = rows.slice(0, i).map((x) => tidy(x.filter((c) => !isNullish(c)).join(" "))).filter(Boolean);
    return { headerIndex: i, preamble, width };
  }
  // niciun antet clar: primul rând nevid devine antet
  const first = rows.findIndex((r) => nonEmpty(r) > 0);
  return { headerIndex: Math.max(first, 0), preamble: [], width: rows[Math.max(first, 0)]?.length ?? 0 };
}

function lastFilled(r: string[]): number {
  for (let i = r.length - 1; i >= 0; i--) if (!isNullish(r[i])) return i;
  return -1;
}

/** Nume de coloane unice și nevide. */
export function headerNames(raw: string[], width: number): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    let name = tidy(raw[i] ?? "") || `Coloana ${i + 1}`;
    const k = textKey(name);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    out.push(name);
  }
  return out;
}

// --- rol după nume ---------------------------------------------------------

const NAME_RULES: [RegExp, Role][] = [
  [/\b(valuta|moneda|currency|curr|ccy|devize?)\b/, "currency"],
  [/\b(status|stare|state|stadiu|situatie)\b/, "status"],
  [/\b(cantitate|cantitati|qty|quantity|buc|bucati|units?|nr buc)\b/, "quantity"],
  [/\b(pret|price|tarif|cost unitar)\b/, "unit_price"],
  [/\b(valoare|total|suma|sum|amount|venit|venituri|revenue|sales|vanzari|incasat|incasari|net|brut)\b/, "amount"],
  [/\b(data|date|datum|zi|day)\b/, "date"],
  [/\b(nr|numar|id|cod|code|order|comanda|factura|invoice|ref|referinta)\b/, "id"],
];

function roleFromName(name: string): Role | null {
  const k = textKey(name).replace(/[^a-z0-9 ]/g, " ");
  // „Pret total” / „Total pret” e sumă, nu preț unitar
  if (/\b(pret|price)\b/.test(k) && /\b(total|valoare)\b/.test(k)) return "amount";
  for (const [re, role] of NAME_RULES) if (re.test(k)) return role;
  return null;
}

// --- rol după conținut -----------------------------------------------------

interface ContentStats {
  filled: number; distinct: number; numeric: number; dates: number;
  integers: number; currencyLike: number; statusLike: number; avgLen: number;
}

function stats(values: string[]): ContentStats {
  const vals = values.filter((v) => !isNullish(v)).map(tidy);
  const order = detectDateOrder(vals);
  let numeric = 0, dates = 0, integers = 0, currencyLike = 0, statusLike = 0, len = 0;
  for (const v of vals) {
    len += v.length;
    if (looksLikeDate(v) && parseDate(v, order)) dates++;
    else if (looksNumeric(v)) { numeric++; if (/^\d{1,4}$/.test(v)) integers++; }
    const c = normalizeCurrency(v);
    if (c && /^[A-Z]{3}$/.test(c) && /^[a-zA-Z€$£]{1,4}$/.test(v)) currencyLike++;
    if (isKnownStatus(normalizeStatus(v))) statusLike++;
  }
  return {
    filled: vals.length,
    distinct: new Set(vals.map(textKey)).size,
    numeric, dates, integers, currencyLike, statusLike,
    avgLen: vals.length ? len / vals.length : 0,
  };
}

function roleFromContent(s: ContentStats): Role {
  if (s.filled === 0) return "ignore";
  const f = s.filled;
  if (s.dates / f >= 0.8) return "date";
  if (s.currencyLike / f >= 0.8 && s.distinct <= 10) return "currency";
  if (s.statusLike / f >= 0.6) return "status";
  if (s.numeric / f >= 0.8) return "number";
  if (s.distinct / f >= 0.9 && f > 5) return s.avgLen <= 20 ? "id" : "text";
  if (s.distinct <= Math.max(50, f * 0.5)) return "category";
  return "text";
}

/** Confirmă rolul din nume cu conținutul; dacă se contrazic, câștigă conținutul. */
function confirm(role: Role, s: ContentStats): boolean {
  const f = Math.max(s.filled, 1);
  switch (role) {
    case "date": return s.dates / f >= 0.6;
    case "quantity": case "unit_price": case "amount": return s.numeric / f >= 0.6;
    case "currency": return s.currencyLike / f >= 0.6;
    case "status": return s.distinct <= Math.max(20, f * 0.3);
    case "id": return s.distinct / f >= 0.5;
    default: return true;
  }
}

const UNIQUE_ROLES: Role[] = ["id", "date", "quantity", "unit_price", "amount", "currency", "status"];

export function detectColumns(names: string[], dataRows: string[][]): Column[] {
  const cols: Column[] = names.map((name, index) => {
    const values = dataRows.map((r) => r[index] ?? "");
    const s = stats(values);
    const byName = roleFromName(name);
    let role: Role;
    let detectedBy: Column["detectedBy"];
    if (byName && confirm(byName, s)) { role = byName; detectedBy = "nume"; }
    else { role = roleFromContent(s); detectedBy = "conținut"; }
    const samples = [...new Set(values.filter((v) => !isNullish(v)).map(tidy))].slice(0, 4);
    return { index, name, role, detectedBy, distinct: s.distinct, filled: s.filled, samples };
  });

  // un singur rol de fiecare fel dintre cele „speciale”; restul devin number/category
  for (const role of UNIQUE_ROLES) {
    const same = cols.filter((c) => c.role === role);
    for (const extra of same.slice(1)) {
      extra.role = ["quantity", "unit_price", "amount"].includes(role) ? "number"
        : role === "id" ? "text" : "category";
    }
  }
  // o coloană numerică fără nume clar devine sumă, dacă nu avem nicio sumă/preț
  if (!cols.some((c) => c.role === "amount" || c.role === "unit_price")) {
    const num = cols.find((c) => c.role === "number");
    if (num) num.role = "amount";
  }
  return cols;
}

/** Aplică rolurile alese manual din interfață (index → rol). */
export function applyOverrides(cols: Column[], overrides: Record<string, Role> | undefined): Column[] {
  if (!overrides) return cols;
  return cols.map((c) => {
    const r = overrides[String(c.index)];
    return r && r in ROLE_LABELS ? { ...c, role: r, detectedBy: "manual" } : c;
  });
}

// --- dimensiuni pentru top-uri ---------------------------------------------

/** Coloana „client” (sau prima categorie) și coloana „produs” (sau a doua). */
export function pickDimensions(cols: Column[]): { customer?: Column; product?: Column } {
  const cats = cols.filter((c) => c.role === "category");
  const find = (re: RegExp) => cats.find((c) => re.test(textKey(c.name)));
  const customer = find(/\b(client|clienti|customer|partener|cumparator|beneficiar|firma|companie|account)\b/) ?? cats[0];
  const product = find(/\b(produs|produse|product|articol|serviciu|servicii|sku|item|categorie)\b/)
    ?? cats.find((c) => c !== customer);
  return { customer, product: product === customer ? undefined : product };
}
