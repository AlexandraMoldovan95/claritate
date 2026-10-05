// Întrebări în română.
// Modelul (sau, ca rezervă, regulile de mai jos) alege DOAR planul: ce metrică,
// ce coloană, ce filtre, ce grupare. Codul validează planul, calculează și scrie
// singur propoziția. Modelul nu vede rândurile și nu scrie nicio cifră.

import type { Analysis } from "./analyze.ts";
import { monthName } from "./analyze.ts";
import type { CleanRecord } from "./clean.ts";
import { round2 } from "./clean.ts";
import { textKey } from "./normalize.ts";

export type Metric = "sum" | "count" | "avg" | "median" | "min" | "max";
export type Op = "eq" | "in" | "neq" | "between" | "gte" | "lte" | "contains";

export interface Plan {
  answerable: boolean;
  metric: Metric;
  field: string | null;            // "valoare", "cantitate", "pret" sau o coloană numerică; null la count
  filters: { column: string; op: Op; value: string | number | (string | number)[] }[];
  groupBy: string | null;          // coloană categorică, "status", "luna", "moneda" sau null
  sort: "desc" | "asc";
  limit: number;
  reason?: string;                 // doar când answerable = false
}

// ------------------------------------------------------------------ schema

export interface SchemaField { name: string; kind: "categorie" | "numeric" | "data" | "status" | "moneda"; values?: string[]; column?: string }

/** Ce vede modelul: numele coloanelor și valorile categorice — fără cifre. */
export function schemaFor(a: Analysis, records: CleanRecord[]): { fields: SchemaField[]; months: string[] } {
  const fields: SchemaField[] = [];
  const catNames = a.columns.filter((c) => c.role === "category").map((c) => c.name);
  for (const name of catNames) {
    const vals = [...new Set(records.map((r) => r.cats[name]))];
    fields.push({ name, kind: "categorie", values: vals.length <= 60 ? vals.sort((x, y) => x.localeCompare(y, "ro")) : undefined });
  }
  if (a.meta.hasStatus) fields.push({ name: "status", kind: "status", values: [...new Set(records.map((r) => r.status).filter(Boolean) as string[])] });
  if (a.meta.currencies.filter(Boolean).length) fields.push({ name: "moneda", kind: "moneda", values: a.meta.currencies.filter(Boolean) });
  // „valoare”, „cantitate”, „pret” sunt nume interne; păstrăm și numele real al coloanei din fișier
  // (ex. „Nota”, „Suma”, „Total”), ca utilizatorul și modelul să se poată referi la ea așa.
  const colOf = (role: string) => a.columns.find((c) => c.role === role)?.name;
  if (a.meta.hasValue) fields.push({ name: "valoare", kind: "numeric", column: colOf("amount") ?? (a.meta.valueFormula || undefined) });
  if (records.some((r) => r.quantity !== null)) fields.push({ name: "cantitate", kind: "numeric", column: colOf("quantity") });
  if (records.some((r) => r.unitPrice !== null)) fields.push({ name: "pret", kind: "numeric", column: colOf("unit_price") });
  for (const c of a.columns.filter((c) => c.role === "number")) fields.push({ name: c.name, kind: "numeric" });
  const months = [...new Set(records.map((r) => r.month).filter(Boolean) as string[])].sort();
  if (months.length) fields.push({ name: "luna", kind: "data", values: months });
  return { fields, months };
}

export function plannerPrompt(schema: ReturnType<typeof schemaFor>): string {
  return `Ești un planificator de interogări pentru un tabel de vânzări curățat. NU calculezi nimic și NU scrii cifre din date: alegi doar CE se calculează.
Câmpuri disponibile (JSON): ${JSON.stringify(schema.fields)}
"valoare" = valoarea principală a fiecărui rând (la vânzări: cantitate × preț); câmpul "column" arată cum se numește coloana în fișier — dacă întrebarea folosește numele acela (ex. „nota”, „suma”), folosește câmpul intern ("valoare", "cantitate" sau "pret"). "luna" are forma YYYY-MM.
Răspunde DOAR cu un obiect JSON de forma:
{"answerable": true, "metric": "sum|count|avg|median|min|max", "field": "valoare|cantitate|pret|<coloana numerică>|null", "filters": [{"column": "<câmp>", "op": "eq|in|neq|between|gte|lte|contains", "value": "..."}], "groupBy": "<câmp categorie>|status|luna|moneda|null", "sort": "desc|asc", "limit": 10}
Reguli:
- Folosește doar câmpurile de mai sus, cu valorile scrise exact ca în listă.
- Status: "venit", "vânzări", "livrat", "încasat" → status = Livrată. "retur/retururi/returnat" → DOAR Retur. "anulat/anulări" → DOAR Anulată. "pierdut/pierderi" fără alte precizări → status in [Retur, Anulată]. "în curs/nelivrat/blocat" → În curs.
- "cel mai / cea mai" + singular (ex. „cea mai bună lună”, „cel mai bun client”) → groupBy pe acel câmp, limit 1. „cea mai slabă / cel mai mic / cel mai puțin” → sort asc.
- „cea mai bună / slabă lună” fără alt status → filtru status = Livrată, groupBy luna, limit 1.
- "top N" / "primii N" / "primele N" → groupBy + sort desc + limit N.
- "câte / câți / numărul de" comenzi → metric count, field null. "câte bucăți / ce cantitate" → sum pe cantitate.
- Dacă întrebarea nu se poate răspunde din aceste câmpuri: {"answerable": false, "reason": "<scurt, în română>"}.
Exemple:
„Care a fost cea mai slabă lună?” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Livrată"}],"groupBy":"luna","sort":"asc","limit":1}
„Cât am pierdut din retururi?” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Retur"}],"groupBy":null,"sort":"desc","limit":10}
„Top 3 clienți după venit” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Livrată"}],"groupBy":"<coloana de client>","sort":"desc","limit":3}`;
}

// ------------------------------------------------------------------ reguli (fără model)

const MONTH_WORDS: [RegExp, number][] = [
  [/\bian(uarie)?\b/, 1], [/\bfeb(ruarie)?\b/, 2], [/\bmart(ie)?\b/, 3], [/\bapr(ilie)?\b/, 4],
  [/\bmai\b/, 5], [/\biun(ie)?\b/, 6], [/\biul(ie)?\b/, 7], [/\baug(ust)?\b/, 8],
  [/\bsep(t|tembrie)?\b/, 9], [/\boct(ombrie)?\b/, 10], [/\bnoi(embrie)?\b/, 11], [/\bdec(embrie)?\b/, 12],
];

/** Ce status cere explicit întrebarea. „retururi” e mai precis decât „pierdut”, deci are prioritate. */
function statusFromWords(q: string): Plan["filters"][number] | null {
  const retur = /\b(retur|returnat|returnate|retururi|returnata|returnari)\b/.test(q);
  const anulat = /\b(anulat|anulate|anulata|anulari|anulare|anulati)\b/.test(q);
  if (retur && anulat) return { column: "status", op: "in", value: ["Retur", "Anulată"] };
  if (retur) return { column: "status", op: "eq", value: "Retur" };
  if (anulat) return { column: "status", op: "eq", value: "Anulată" };
  if (/\b(pierdut|pierduti|pierderi|pierdere|pierdute)\b/.test(q)) return { column: "status", op: "in", value: ["Retur", "Anulată"] };
  if (/\b(in curs|nelivrat|nelivrate|in asteptare|deschise|blocat|blocata|blocati)\b/.test(q)) return { column: "status", op: "eq", value: "În curs" };
  if (/\b(livrat|livrate|livrata|venit|venitul|venituri|vandut|vandute|incasat|incasari)\b/.test(q)) return { column: "status", op: "eq", value: "Livrată" };
  return null;
}

const normQ = (question: string) => textKey(question).replace(/[?!.,;:„”"]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Plasă de siguranță peste planul modelului: dacă planul contrazice ce scrie explicit
 * în întrebare (statusul cerut, „cea mai … lună” = o singură lună), codul îl corectează.
 * Tot ce se schimbă apare în „Am calculat: …”, deci corecția e vizibilă.
 */
export function guardPlan(plan: Plan, question: string, schema: ReturnType<typeof schemaFor>): Plan {
  const q = normQ(question);
  const p: Plan = { ...plan, filters: [...plan.filters] };
  const hasStatus = schema.fields.some((f) => f.name === "status");
  const asked = hasStatus ? statusFromWords(q) : null;
  if (asked) {
    p.filters = p.filters.filter((f) => f.column !== "status");
    p.filters.push(asked);
  }
  const superlative = /\b(cel|cea) mai\b/.test(q);
  const explicitN = /\b(top|primii|primele|ultimii|ultimele)\s*\d+/.test(q) || /\b\d+\s+(luni|clienti|produse)\b/.test(q);
  if (p.groupBy && superlative && !explicitN) p.limit = 1;
  if (p.groupBy === "luna" && superlative && hasStatus && !p.filters.some((f) => f.column === "status")) {
    p.filters.push({ column: "status", op: "eq", value: "Livrată" });
  }
  if (/\b(cea mai slaba|cea mai proasta|cel mai slab|cel mai mic|cea mai mica|cel mai putin|cea mai putin)\b/.test(q)) p.sort = "asc";
  return p;
}

/** Planificator de rezervă, pe cuvinte-cheie. Merge fără model și fără internet. */
export function rulePlan(question: string, schema: ReturnType<typeof schemaFor>): Plan {
  const q = textKey(question).replace(/[?!.,;:„”"]/g, " ").replace(/\s+/g, " ").trim();
  // „cea mai” / „cel mai” nu înseamnă luna mai
  const qm = q.replace(/\b(cea|cel|cei|cele) mai\b/g, "$1 _mai_");
  const plan: Plan = { answerable: true, metric: "sum", field: "valoare", filters: [], groupBy: null, sort: "desc", limit: 10 };
  const has = (name: string) => schema.fields.some((f) => f.name === name);
  if (!has("valoare")) plan.field = has("cantitate") ? "cantitate" : null;
  let understood = false;

  const unitsWanted = /\b(bucati|unitati|cantitate|cantitati|cantitatea)\b/.test(q) && has("cantitate");
  if (unitsWanted && !/\bcomenzi\b/.test(q)) { plan.field = "cantitate"; understood = true; }
  else if (/\b(cate|cati|numar(ul)? de|nr de)\b/.test(q)) { plan.metric = "count"; plan.field = null; understood = true; }
  if (/\b(medie|mediu|media|in medie)\b/.test(q)) { plan.metric = "avg"; understood = true; }
  else if (/\bmediana\b/.test(q)) { plan.metric = "median"; understood = true; }
  if (/\b(venit|valoare|valoarea|suma|total|totalul|incasari|vanzari|bani|cat|cata|pierdut|comenzi|comanda)\b/.test(q)) understood = true;

  if (has("status")) {
    const st = statusFromWords(q);
    if (st) { plan.filters.push(st); understood = true; }
  }

  // valori categorice menționate explicit (ex. „Solaris Energy”)
  for (const f of schema.fields) {
    if (f.kind !== "categorie" && f.kind !== "moneda") continue;
    const hit = (f.values ?? []).filter((v) => v.length > 2 && q.includes(textKey(v)));
    if (hit.length === 1) plan.filters.push({ column: f.name, op: "eq", value: hit[0] });
    else if (hit.length > 1) plan.filters.push({ column: f.name, op: "in", value: hit });
    if (hit.length) understood = true;
  }

  // luna
  const year = q.match(/\b(20\d{2})\b/)?.[1];
  const monthHits = MONTH_WORDS.filter(([re]) => re.test(qm)).map(([, m]) => m);
  if (monthHits.length && has("luna") && !/\bpe (fiecare )?luna\b|\blunar\b/.test(q)) {
    const m = monthHits[0];
    const cand = schema.months.filter((x) => Number(x.slice(5)) === m && (!year || x.startsWith(year)));
    if (cand.length) { plan.filters.push({ column: "luna", op: "eq", value: cand[cand.length - 1] }); understood = true; }
  }

  // grupare
  const top = q.match(/\b(top|primii|primele|cei mai buni|cele mai bune)\s*(\d+)?/);
  const superlative = /\b(cel|cea|cei|cele) mai\b/.test(q);
  const groupCandidates = schema.fields.filter((f) => f.kind === "categorie");
  let group: string | null = null;
  if (/\bluna\b|\bluni\b|\blunar\b|\blunile\b/.test(q) && has("luna") && (superlative || /\b(pe|per|fiecare|dupa|lunar)\b/.test(q))) group = "luna";
  else if (/\bpe (fiecare )?status\b/.test(q)) group = "status";
  else if (/\bpe (fiecare )?moneda\b/.test(q)) group = "moneda";
  else {
    for (const f of groupCandidates) {
      const k = textKey(f.name);
      const root = k.slice(0, Math.max(4, k.length - 2));
      if (q.includes(root) && !plan.filters.some((x) => x.column === f.name)) { group = f.name; break; }
    }
  }
  if (!group && (top || /\b(care|ce|cine)\b/.test(q) && superlative) && groupCandidates[0]) group = groupCandidates[0].name;
  if (group) understood = true;
  // „cea mai bună/slabă lună” = după venit livrat, dacă nu s-a cerut alt status
  if (group === "luna" && superlative && has("status") && !plan.filters.some((f) => f.column === "status")) {
    plan.filters.push({ column: "status", op: "eq", value: "Livrată" });
  }
  plan.groupBy = group;
  if (/\b(cel mai putin|cea mai slaba|cea mai proasta|cele mai mici|cei mai mici|cele mai slabe|minim|minima)\b/.test(q)) plan.sort = "asc";
  const n = top?.[2] ? Number(top[2]) : superlative && !top ? 1 : 10;
  plan.limit = Math.min(Math.max(group === "luna" && !top && !superlative ? 20 : n, 1), 20);
  if (/\b(maxim|maxima|cea mai mare comanda|cea mai scumpa)\b/.test(q) && !group) { plan.metric = "max"; understood = true; }

  if (!understood) {
    return { ...plan, answerable: false, reason: "Nu am înțeles întrebarea în raport cu datele din fișier. Încearcă una dintre întrebările sugerate." };
  }
  return plan;
}

// ------------------------------------------------------------------ validare

export function validatePlan(raw: unknown, schema: ReturnType<typeof schemaFor>): { plan?: Plan; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Planul primit nu e un obiect JSON." };
  const p = raw as Partial<Plan>;
  if (p.answerable === false) return { error: typeof p.reason === "string" ? p.reason : "Întrebarea nu se poate calcula din acest fișier." };
  const metric = (["sum", "count", "avg", "median", "min", "max"] as Metric[]).includes(p.metric as Metric) ? p.metric as Metric : null;
  if (!metric) return { error: "Metrica aleasă nu e permisă." };
  const byName = (n: unknown) => typeof n === "string"
    ? schema.fields.find((f) => textKey(f.name) === textKey(n)) ?? schema.fields.find((f) => f.column && textKey(f.column) === textKey(n))
    : undefined;

  let field: string | null = null;
  if (metric !== "count") {
    const f = byName(p.field ?? "valoare");
    if (!f || f.kind !== "numeric") return { error: `Coloana „${String(p.field)}” nu e numerică.` };
    field = f.name;
  }

  const filters: Plan["filters"] = [];
  for (const raw of Array.isArray(p.filters) ? p.filters.slice(0, 8) : []) {
    const f = byName(raw?.column);
    if (!f) return { error: `Nu există câmpul „${String(raw?.column)}”.` };
    const op = (["eq", "in", "neq", "between", "gte", "lte", "contains"] as Op[]).includes(raw.op) ? raw.op : "eq";
    let value = raw.value;
    // valorile categorice se potrivesc după cheie (majuscule/diacritice nu contează)
    if (f.values && (op === "eq" || op === "neq" || op === "in")) {
      const match = (v: unknown) => f.values!.find((x) => textKey(x) === textKey(String(v)));
      if (Array.isArray(value)) {
        const m = value.map(match).filter(Boolean) as string[];
        if (!m.length) return { error: `Nu găsesc valorile cerute în „${f.name}”.` };
        value = m;
      } else {
        const m = match(value);
        if (!m) return { error: `Nu găsesc „${String(value)}” în „${f.name}”.` };
        value = m;
      }
    }
    filters.push({ column: f.name, op, value: value as Plan["filters"][number]["value"] });
  }

  let groupBy: string | null = null;
  if (p.groupBy) {
    const g = byName(p.groupBy);
    if (!g || g.kind === "numeric") return { error: `Nu pot grupa după „${String(p.groupBy)}”.` };
    groupBy = g.name;
  }
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 20);
  return { plan: { answerable: true, metric, field, filters, groupBy, sort: p.sort === "asc" ? "asc" : "desc", limit } };
}

// ------------------------------------------------------------------ execuție

function fieldValue(r: CleanRecord, field: string): unknown {
  switch (field) {
    case "valoare": return r.value;
    case "cantitate": return r.quantity;
    case "pret": return r.unitPrice;
    case "status": return r.status;
    case "moneda": return r.currency;
    case "luna": return r.month;
    default: return field in r.cats ? r.cats[field] : r.nums[field];
  }
}

function passes(r: CleanRecord, f: Plan["filters"][number]): boolean {
  const v = fieldValue(r, f.column);
  const s = v === null || v === undefined ? "" : String(v);
  const vals = Array.isArray(f.value) ? f.value.map(String) : [String(f.value)];
  switch (f.op) {
    case "eq": return s === vals[0];
    case "neq": return s !== vals[0];
    case "in": return vals.includes(s);
    case "contains": return textKey(s).includes(textKey(vals[0]));
    case "gte": return typeof v === "number" ? v >= Number(vals[0]) : s >= vals[0];
    case "lte": return typeof v === "number" ? v <= Number(vals[0]) : s <= vals[0];
    case "between": return vals.length >= 2 && (typeof v === "number" ? v >= Number(vals[0]) && v <= Number(vals[1]) : s >= vals[0] && s <= vals[1]);
  }
}

function compute(metric: Metric, xs: number[]): number {
  if (!xs.length) return 0;
  switch (metric) {
    case "count": return xs.length;
    case "sum": return round2(xs.reduce((a, b) => a + b, 0));
    case "avg": return round2(xs.reduce((a, b) => a + b, 0) / xs.length);
    case "min": return Math.min(...xs);
    case "max": return Math.max(...xs);
    case "median": {
      const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
      return round2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
    }
  }
}

export interface AnswerRow { group: string; currency: string; value: number; count: number }
export interface Answer { text: string; rows: AnswerRow[]; planText: string; matched: number }

const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const METRIC_RO: Record<Metric, string> = { sum: "suma", count: "numărul de comenzi", avg: "media", median: "mediana", min: "minimul", max: "maximul" };

export function execute(plan: Plan, records: CleanRecord[], labels: Record<string, string> = {}): Answer {
  const fieldLabel = plan.field ? labels[plan.field] ?? plan.field : null;
  const rows = records.filter((r) => plan.filters.every((f) => passes(r, f)));
  const money = plan.field === "valoare" || plan.field === "pret";
  const splitByCurrency = money && plan.groupBy !== "moneda";
  const groups = new Map<string, { xs: number[]; count: number; group: string; currency: string }>();
  // pe luni: și lunile cu comenzi, dar fără niciun rând după filtrul de status, intră cu 0
  // (aceeași regulă ca în dashboard-ul 4)
  if (plan.groupBy === "luna" && (plan.metric === "sum" || plan.metric === "count")) {
    const nonStatus = plan.filters.filter((f) => f.column !== "status");
    for (const r of records) {
      if (!r.month || !nonStatus.every((f) => passes(r, f))) continue;
      const cur = splitByCurrency ? r.currency : "";
      const key = `${r.month}\u0000${cur}`;
      if (!groups.has(key)) groups.set(key, { xs: [], count: 0, group: r.month, currency: cur });
    }
  }
  for (const r of rows) {
    const x = plan.field ? fieldValue(r, plan.field) : 1;
    if (plan.field && typeof x !== "number") continue;
    const g = plan.groupBy ? String(fieldValue(r, plan.groupBy) ?? "(necompletat)") : "Total";
    const cur = splitByCurrency ? r.currency : "";
    const key = `${g}\u0000${cur}`;
    const e = groups.get(key) ?? { xs: [], count: 0, group: g, currency: cur };
    e.xs.push(x as number); e.count++;
    groups.set(key, e);
  }
  let out: AnswerRow[] = [...groups.values()].map((e) => ({
    group: e.group, currency: e.currency, value: compute(plan.metric, e.xs), count: e.count,
  }));
  // sortare pe valoare; top N aplicat pe fiecare monedă separat
  out.sort((a, b) => (plan.sort === "asc" ? a.value - b.value : b.value - a.value) || a.group.localeCompare(b.group));
  if (plan.groupBy) {
    const perCur = new Map<string, number>();
    const firstVal = new Map<string, number>();
    out = out.filter((r) => {
      const n = (perCur.get(r.currency) ?? 0) + 1; perCur.set(r.currency, n);
      if (n === 1) firstVal.set(r.currency, r.value);
      // la „cel mai / cea mai” păstrăm și egalitățile (ex. ianuarie și februarie, ambele 0)
      return n <= plan.limit || (plan.limit === 1 && r.value === firstVal.get(r.currency));
    });
  }
  // lista pe luni se citește mai ușor în ordine cronologică (după ce am ales top N)
  const curOrder = [...new Set(out.map((r) => r.currency))];
  const chrono = plan.groupBy === "luna" && plan.limit > 1;
  if (chrono) {
    out.sort((a, b) => curOrder.indexOf(a.currency) - curOrder.indexOf(b.currency) || a.group.localeCompare(b.group));
  }

  const planText = describePlan(plan, labels);
  const show = (r: AnswerRow) => plan.metric === "count" ? `${r.value} ${r.value === 1 ? "comandă" : "comenzi"}`
    : `${r.currency ? r.currency + " " : ""}${fmtNum(r.value, plan.field === "cantitate" ? 0 : 2)}`;
  const label = (g: string) => plan.groupBy === "luna" && /^\d{4}-\d{2}$/.test(g) ? monthName(g) : g;

  let text: string;
  if (rows.length === 0) text = "Niciun rând nu corespunde filtrelor alese, deci rezultatul e 0.";
  else if (!plan.groupBy) text = `${capitalize(METRIC_RO[plan.metric])}${fieldLabel && plan.metric !== "count" ? ` (${fieldLabel})` : ""}: ${out.map(show).join(" · ")}.`;
  else {
    // o propoziție scurtă pe fiecare monedă; lista completă e în tabel
    const byCur = new Map<string, AnswerRow[]>();
    for (const c of curOrder) byCur.set(c, out.filter((r) => r.currency === c));
    const multi = byCur.size > 1;
    const parts = [...byCur.entries()].map(([cur, rs]) => {
      const pre = multi && cur ? `În ${cur}: ` : "";
      if (plan.limit === 1) {
        // cel mai / cea mai: egalitățile rămân împreună
        return `${pre}${rs.map((r) => label(r.group)).join(" și ")} (${show(rs[0])}${rs.length > 1 ? " fiecare" : ""})`;
      }
      const shown = rs.slice(0, 5).map((r, k) => `${chrono ? "" : `${k + 1}. `}${label(r.group)} (${show(r)})`).join(", ");
      return `${pre}${shown}${rs.length > 5 ? ` și încă ${rs.length - 5} în tabel` : ""}`;
    });
    text = `${parts.join(". ")}.`;
    if (multi) text += " Fiecare monedă e calculată separat, fără conversie.";
  }
  return { text, rows: out.map((r) => ({ ...r, group: label(r.group) })), planText, matched: rows.length };
}

export function describePlan(p: Plan, labels: Record<string, string> = {}): string {
  const f = p.field ? labels[p.field] ?? p.field : null;
  const parts = [`${METRIC_RO[p.metric]}${f && p.metric !== "count" ? ` pe „${f}”` : ""}`];
  if (p.filters.length) parts.push("unde " + p.filters.map((f) => {
    const v = Array.isArray(f.value) ? f.value.join(" sau ") : f.column === "luna" ? monthName(String(f.value)) : String(f.value);
    return `${f.column} ${f.op === "neq" ? "≠" : f.op === "contains" ? "conține" : "="} ${v}`;
  }).join(", "));
  if (p.groupBy) parts.push(`grupat pe ${p.groupBy}`);
  if (p.groupBy) parts.push(`${p.sort === "asc" ? "crescător" : "descrescător"}, primele ${p.limit}`);
  return parts.join("; ");
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plan de la model (JSON) → validat → executat. Dacă modelul eșuează, reguli. */
export async function answerQuestion(
  question: string,
  analysis: Analysis,
  records: CleanRecord[],
  planner?: (system: string, question: string) => Promise<unknown>,
): Promise<{ answer?: Answer; plan?: Plan; source: "model" | "reguli"; error?: string }> {
  const schema = schemaFor(analysis, records);
  // în răspuns folosim numele real al coloanei („Nota”, „Suma”), nu „valoare”; o formulă (Cantitate × Pret) rămâne „valoare”
  const labels: Record<string, string> = {};
  for (const f of schema.fields) if (f.column && !f.column.includes("×")) labels[f.name] = f.column;
  if (planner) {
    try {
      const raw = await planner(plannerPrompt(schema), question);
      const v = validatePlan(raw, schema);
      if (v.plan) {
        const plan = guardPlan(v.plan, question, schema);
        return { answer: execute(plan, records, labels), plan, source: "model" };
      }
      if (v.error && (raw as Plan)?.answerable === false) {
        // modelul zice „nu se poate”; dacă regulile înțeleg totuși întrebarea, răspundem cu ele
        const alt = validatePlan(rulePlan(question, schema), schema);
        if (alt.plan) return { answer: execute(alt.plan, records, labels), plan: alt.plan, source: "reguli" };
        return { source: "model", error: v.error };
      }
    } catch (_e) { /* cade pe reguli */ }
  }
  const fallback = validatePlan(rulePlan(question, schema), schema);
  if (!fallback.plan) return { source: "reguli", error: fallback.error };
  return { answer: execute(fallback.plan, records, labels), plan: fallback.plan, source: "reguli" };
}
