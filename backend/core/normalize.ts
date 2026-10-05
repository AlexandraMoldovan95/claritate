// Funcții mici, pure, folosite de detectare și curățare.

/** Fără diacritice, lowercase, spații comprimate. Cheia de grupare pentru text. */
export function textKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[şș]/gi, "s")
    .replace(/[ţț]/gi, "t")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Spații la capete scoase, spații multiple comprimate. */
export function tidy(s: string): string {
  return s.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
}

const NULL_TOKENS = new Set(["", "-", "--", "n/a", "na", "null", "none", "nan", "#n/a"]);
export function isNullish(s: string | undefined): boolean {
  return s === undefined || NULL_TOKENS.has(tidy(s).toLowerCase());
}

// ---------------------------------------------------------------- numere

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR", "$": "USD", "£": "GBP", "lei": "RON", "ron": "RON", "eur": "EUR",
  "usd": "USD", "gbp": "GBP", "chf": "CHF", "huf": "HUF", "mdl": "MDL",
};

export type DecimalSep = "," | ".";

/**
 * Decide separatorul zecimal pentru o coloană întreagă, pe baza tuturor valorilor.
 * - dacă o valoare are și "." și "," → ultimul e zecimalul;
 * - "," sau "." urmat de exact 1–2 cifre la final → vot pentru acel separator;
 * - egalitate → "," (format românesc).
 */
export function detectDecimalSep(values: string[]): DecimalSep {
  let comma = 0, dot = 0;
  for (const raw of values) {
    const s = raw.replace(/[^\d.,-]/g, "");
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc >= 0 && ld >= 0) { lc > ld ? comma++ : dot++; continue; }
    if (/,\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
    else if (/\.\d{3}(\.\d{3})+$/.test(s)) comma++; // 1.234.567 → punct = mii
    else if (/,\d{3}(,\d{3})+$/.test(s)) dot++;     // 1,234,567 → virgulă = mii
  }
  return dot > comma ? "." : ",";
}

export interface ParsedNumber { value: number; currency?: string; repaired: boolean }

/**
 * „1.841,86”, „1,841.86”, „1 841,86 lei”, „€ 99.50”, „(120,00)”, „-5” → număr.
 * `repaired` = valoarea n-a fost un număr „curat” (avea mii, monedă, spații etc.).
 */
export function parseNumber(raw: string, dec: DecimalSep = ","): ParsedNumber | null {
  if (isNullish(raw)) return null;
  let s = tidy(raw);
  let currency: string | undefined;
  const lower = s.toLowerCase();
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (lower.includes(sym)) { currency = code; break; }
  }
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[^\d.,\-+]/g, "");
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/\d/.test(s) || /[-+]/.test(s)) return null;

  const thousands = dec === "," ? "." : ",";
  s = s.split(thousands).join("");
  if (dec === ",") s = s.replace(",", ".");
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  const repaired = tidy(raw) !== String(value) && !/^-?\d+(\.\d+)?$/.test(tidy(raw));
  return { value: negative ? -value : value, currency, repaired };
}

const CURRENCY_TOKEN_RE = /\b(lei|ron|eur|usd|gbp|chf|huf|mdl)\b|[€$£]/gi;

export function looksNumeric(raw: string): boolean {
  if (isNullish(raw)) return false;
  const s = tidy(raw);
  if (!/\d/.test(s) || looksLikeDate(s)) return false;
  // după ce scoatem moneda, nu trebuie să rămână litere
  // (altfel „CMD-100043” sau „Suport 24/7” ar trece drept numere)
  const bare = s.replace(CURRENCY_TOKEN_RE, "").trim();
  if (!/^[\d\s.,()+\-]+$/.test(bare)) return false;
  return parseNumber(s, detectDecimalSep([s])) !== null;
}

// ---------------------------------------------------------------- date

export type DateOrder = "dmy" | "mdy";

const DATE_RE = /^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;

export function looksLikeDate(raw: string): boolean {
  return DATE_RE.test(tidy(raw));
}

/** Pentru o coloană: zi/lună sau lună/zi? Implicit zi/lună (format românesc). */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = tidy(v).match(DATE_RE);
    if (!m || m[1].length === 4) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** Întoarce „YYYY-MM-DD” sau null dacă data nu există în calendar. */
export function parseDate(raw: string, order: DateOrder = "dmy"): string | null {
  const m = tidy(raw).match(DATE_RE);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    const a = +m[1], b = +m[2];
    y = +m[3];
    if (m[3].length === 2) y += 2000;
    [d, mo] = order === "dmy" ? [a, b] : [b, a];
  }
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- status

export type StatusGroup = "Livrată" | "Retur" | "Anulată" | "În curs";

const STATUS_RULES: [RegExp, StatusGroup][] = [
  [/^(livrat|delivered|shipped|finalizat|completed?|complet|platit|paid|incasat|facturat|invoiced|done|onorat)/, "Livrată"],
  [/^(retur|return|refund|rambursat|restituit)/, "Retur"],
  [/^(anulat|anulare|cancel|respins|rejected|refuzat|stornat)/, "Anulată"],
  [/^(in curs|in lucru|in asteptare|pending|in progress|processing|open|deschis|nou|new|confirmat|in procesare|in livrare)/, "În curs"],
];

export function normalizeStatus(raw: string): string | null {
  if (isNullish(raw)) return null;
  const k = textKey(raw);
  for (const [re, group] of STATUS_RULES) if (re.test(k)) return group;
  return tidy(raw);
}

export function isKnownStatus(s: string | null): s is StatusGroup {
  return s === "Livrată" || s === "Retur" || s === "Anulată" || s === "În curs";
}

// ---------------------------------------------------------------- monedă

export function normalizeCurrency(raw: string): string | null {
  if (isNullish(raw)) return null;
  const k = tidy(raw).toLowerCase();
  if (CURRENCY_SYMBOLS[k]) return CURRENCY_SYMBOLS[k];
  if (/^[a-z]{3}$/i.test(k)) return k.toUpperCase();
  return tidy(raw).toUpperCase();
}
