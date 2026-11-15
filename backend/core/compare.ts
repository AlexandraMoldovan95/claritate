// Comparație între două fișiere cu același tip de date (două perioade, sau două sedii).
//
// Ideea e un FULL OUTER JOIN din SQL: cheia e valoarea dintr-o coloană comună (clientul,
// produsul, agentul). Pentru fiecare cheie punem alăturat ce are în fișierul 1 și în fișierul 2,
// plus diferența; ce apare doar într-un fișier e marcat „nou” / „dispărut”.
// Coloanele se potrivesc întâi după nume, apoi după valorile comune (ca un JOIN pe valori).
// Doar aritmetică în cod, fără conversie între monede.

import type { Analysis } from "./analyze.js";
import { monthName } from "./analyze.js";
import type { CleanRecord } from "./clean.js";
import { round2 } from "./clean.js";
import { textKey } from "./normalize.js";
import { execute, rulePlan, schemaFor, validatePlan, type AnswerDetail, type AnswerSection, type Plan } from "./ask.js";

const DELIVERED = "Livrată";
const LOST = new Set(["Retur", "Anulată"]);

export interface Side { id: string; filename: string; analysis: Analysis; records: CleanRecord[] }

export interface ColumnMatch { a: string; b: string; by: "nume" | "valori"; shared: number }

export interface CompareResult {
  labels: [string, string];
  files: [string, string];
  periods: [string | null, string | null];
  sameCalendar: boolean;             // perioadele se suprapun (ex. două sedii) → lunile se aliniază pe dată
  matches: ColumnMatch[];
  onlyA: string[]; onlyB: string[];
  notes: string[];
  currencies: string[];
  currency: string;
  kpis: { label: string; a: number | null; b: number | null; diff: number | null; pct: number | null; money: boolean }[];
  months: { key: string; label: string; a: number; b: number }[];
  dimensions: { name: string; rows: JoinRow[] }[];
  hasStatus: boolean;
}

export interface JoinRow { key: string; a: number; b: number; aOrders: number; bOrders: number; diff: number; pct: number | null; tag: "nou" | "dispărut" | "crescut" | "scăzut" | "egal" }

// ------------------------------------------------------------------ potrivirea coloanelor

const GENERIC = new Set(["nume", "denumire", "nr", "cod", "de", "al", "ale", "a", "name", "vanzari"]);
const nameKey = (n: string) => textKey(n).split(/[^a-z0-9]+/).filter((w) => w && !GENERIC.has(w)).join(" ");

export function matchColumns(A: Side, B: Side): { matches: ColumnMatch[]; onlyA: string[]; onlyB: string[] } {
  const cats = (s: Side) => s.analysis.columns.filter((c) => c.role === "category").map((c) => c.name);
  const vals = (s: Side, col: string) => new Set(s.records.map((r) => textKey(r.cats[col] ?? "")).filter(Boolean));
  const ca = cats(A), cb = cats(B);
  const cand: ColumnMatch[] = [];
  for (const a of ca) {
    const va = vals(A, a);
    for (const b of cb) {
      const vb = vals(B, b);
      const shared = [...va].filter((v) => vb.has(v)).length;
      const sameName = nameKey(a) !== "" && (nameKey(a) === nameKey(b) || nameKey(a).startsWith(nameKey(b)) || nameKey(b).startsWith(nameKey(a)));
      const jaccard = shared / Math.max(1, new Set([...va, ...vb]).size);
      if (sameName) cand.push({ a, b, by: "nume", shared });
      else if (shared >= 2 && jaccard >= 0.2) cand.push({ a, b, by: "valori", shared });
    }
  }
  // fiecare coloană se folosește o singură dată: întâi potrivirile după nume, apoi după cele mai multe valori comune
  cand.sort((x, y) => (x.by === y.by ? 0 : x.by === "nume" ? -1 : 1) || y.shared - x.shared);
  const usedA = new Set<string>(), usedB = new Set<string>(), matches: ColumnMatch[] = [];
  for (const c of cand) {
    if (usedA.has(c.a) || usedB.has(c.b)) continue;
    usedA.add(c.a); usedB.add(c.b); matches.push(c);
  }
  // păstrăm ordinea coloanelor din primul fișier
  matches.sort((x, y) => ca.indexOf(x.a) - ca.indexOf(y.a));
  return { matches, onlyA: ca.filter((c) => !usedA.has(c)), onlyB: cb.filter((c) => !usedB.has(c)) };
}

// ------------------------------------------------------------------ perioade și etichete

function periodOf(s: Side): { from: string; to: string } | null {
  const ds = s.records.map((r) => r.date).filter(Boolean).sort() as string[];
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}
const ro = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Ordonăm fișierele cronologic (primul = mai vechi), ca „nou” / „dispărut” să aibă sens. */
export function orderSides(x: Side, y: Side): [Side, Side] {
  const px = periodOf(x), py = periodOf(y);
  return px && py && py.from < px.from ? [y, x] : [x, y];
}

function labelsFor(A: Side, B: Side): [string, string] {
  const pa = periodOf(A), pb = periodOf(B);
  const yearOf = (p: { from: string; to: string } | null) => p && p.from.slice(0, 4) === p.to.slice(0, 4) ? p.from.slice(0, 4) : null;
  const ya = yearOf(pa), yb = yearOf(pb);
  if (ya && yb && ya !== yb) return [ya, yb];
  const base = (f: string) => f.replace(/\.(csv|txt|xlsx|xlsm|xls)$/i, "");
  const fa = base(A.filename), fb = base(B.filename);
  return fa !== fb ? [fa, fb] : ["Fișierul 1", "Fișierul 2"];
}

// ------------------------------------------------------------------ comparația

/** Rândurile lui B cu numele coloanelor din A (pentru coloanele potrivite). */
export function mapRecords(B: Side, matches: ColumnMatch[]): CleanRecord[] {
  return B.records.map((r) => {
    const cats: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.cats)) {
      const m = matches.find((x) => x.b === k);
      cats[m ? m.a : `${k} (fișierul 2)`] = v;
    }
    return { ...r, cats };
  });
}

export function compare(x: Side, y: Side, currencyWanted?: string): CompareResult {
  const [A, B] = orderSides(x, y);
  const labels = labelsFor(A, B);
  const { matches, onlyA, onlyB } = matchColumns(A, B);
  const notes: string[] = [];
  const pa = periodOf(A), pb = periodOf(B);
  const monthsA = new Set(A.records.map((r) => r.month).filter(Boolean) as string[]);
  const monthsB = new Set(B.records.map((r) => r.month).filter(Boolean) as string[]);
  const sameCalendar = [...monthsA].some((m) => monthsB.has(m));
  const hasStatus = A.analysis.meta.hasStatus && B.analysis.meta.hasStatus;
  if (A.analysis.meta.hasStatus !== B.analysis.meta.hasStatus) notes.push("Doar unul dintre fișiere are coloană de status: am comparat valoarea tuturor comenzilor, nu doar a celor livrate.");
  if (onlyA.length) notes.push(`Doar în ${labels[0]}: ${onlyA.join(", ")} — nu se compară.`);
  if (onlyB.length) notes.push(`Doar în ${labels[1]}: ${onlyB.join(", ")} — nu se compară.`);
  for (const m of matches.filter((m) => m.shared === 0)) notes.push(`„${m.a}” nu are nicio valoare comună între fișiere: fiecare valoare apare doar într-unul dintre ele.`);
  for (const m of matches.filter((m) => m.a !== m.b)) notes.push(`„${m.a}” (${labels[0]}) și „${m.b}” (${labels[1]}) sunt aceeași coloană (${m.by === "nume" ? "după nume" : `${m.shared} valori comune`}).`);

  const currencies = [...new Set([...A.records, ...B.records].map((r) => r.currency))];
  const currency = currencyWanted !== undefined && currencies.includes(currencyWanted) ? currencyWanted : currencies[0] ?? "";
  if (currencies.length > 1) notes.push(`Sume în ${currency || "fără monedă"}; celelalte monede se văd alegând-o sus (fără conversie).`);

  const counted = (rs: CleanRecord[]) => hasStatus ? rs.filter((r) => r.status === DELIVERED) : rs;
  const inCur = (rs: CleanRecord[]) => rs.filter((r) => r.currency === currency && r.value !== null);
  const sumV = (rs: CleanRecord[]) => round2(rs.reduce((s, r) => s + (r.value ?? 0), 0));
  const dA = inCur(counted(A.records)), dB = inCur(counted(B.records));
  const kpi = (label: string, a: number | null, b: number | null, money: boolean) => ({
    label, a, b, money,
    diff: a === null || b === null ? null : round2(b - a),
    pct: a === null || b === null || a === 0 ? null : round2(((b - a) / a) * 100),
  });
  const lostOf = (rs: CleanRecord[]) => sumV(inCur(rs.filter((r) => r.status && LOST.has(r.status))));
  const kpis = [
    kpi(hasStatus ? `Venit livrat (${currency || "—"})` : `Valoare (${currency || "—"})`, sumV(dA), sumV(dB), true),
    kpi(hasStatus ? "Comenzi livrate" : "Comenzi", dA.length, dB.length, false),
    kpi(`Valoare medie pe comandă (${currency || "—"})`, dA.length ? round2(sumV(dA) / dA.length) : 0, dB.length ? round2(sumV(dB) / dB.length) : 0, true),
    kpi("Toate comenzile (toate monedele)", A.records.length, B.records.length, false),
  ];
  if (hasStatus) {
    kpis.push(kpi(`Venit pierdut — retur + anulare (${currency || "—"})`, lostOf(A.records), lostOf(B.records), true));
    const rate = (rs: CleanRecord[]) => rs.length ? round2((rs.filter((r) => r.status && LOST.has(r.status)).length / rs.length) * 100) : 0;
    kpis.push({ label: "Rata de retur + anulare (%)", a: rate(A.records), b: rate(B.records), diff: round2(rate(B.records) - rate(A.records)), pct: null, money: false });
  }

  // luni: pe dată dacă perioadele se suprapun (două sedii), altfel pe numele lunii (ianuarie cu ianuarie)
  const monthKey = (m: string) => sameCalendar ? m : m.slice(5, 7);
  const monthAgg = (rs: CleanRecord[]) => {
    const mm = new Map<string, number>();
    for (const r of rs) if (r.month) mm.set(monthKey(r.month), (mm.get(monthKey(r.month)) ?? 0) + (r.value ?? 0));
    return mm;
  };
  const ma = monthAgg(dA), mb = monthAgg(dB);
  const allMonthKeys = [...new Set([...[...monthsA].map(monthKey), ...[...monthsB].map(monthKey)])].sort();
  const months = allMonthKeys.map((k) => ({
    key: k,
    label: sameCalendar ? monthName(k) : monthName(`2000-${k}`).replace(" 2000", ""),
    a: round2(ma.get(k) ?? 0), b: round2(mb.get(k) ?? 0),
  }));
  if (!sameCalendar && monthsA.size && monthsB.size) notes.push(`Lunile sunt aliniate după nume (ianuarie ${labels[0]} cu ianuarie ${labels[1]}).`);

  // join pe fiecare coloană comună
  const mapped = mapRecords(B, matches);
  const dMapped = inCur(counted(mapped));
  const dimensions = matches.map((m) => ({ name: m.a, rows: joinOn(dA, dMapped, m.a, A.records, mapped) }));

  const per = (p: { from: string; to: string } | null) => p ? `${ro(p.from)} – ${ro(p.to)}` : null;
  return {
    labels, files: [A.filename, B.filename], periods: [per(pa), per(pb)], sameCalendar,
    matches, onlyA, onlyB, notes, currencies, currency, kpis, months, dimensions, hasStatus,
  };
}

/** FULL OUTER JOIN pe valoarea dintr-o coloană (cheia = textul normalizat, fără majuscule/diacritice). */
function joinOn(a: CleanRecord[], b: CleanRecord[], col: string, allA: CleanRecord[], allB: CleanRecord[]): JoinRow[] {
  const agg = (rs: CleanRecord[]) => {
    const m = new Map<string, { name: string; v: number; n: number }>();
    for (const r of rs) {
      const name = r.cats[col]; if (!name) continue;
      const k = textKey(name);
      const e = m.get(k) ?? { name, v: 0, n: 0 };
      e.v += r.value ?? 0; e.n++; m.set(k, e);
    }
    return m;
  };
  const ga = agg(a), gb = agg(b);
  // „nou” / „dispărut” după prezența în fișier (orice status), nu doar după livrări
  const presentA = new Set(allA.map((r) => textKey(r.cats[col] ?? "")));
  const presentB = new Set(allB.map((r) => textKey(r.cats[col] ?? "")));
  const keys = new Set([...ga.keys(), ...gb.keys(), ...[...presentA].filter(Boolean), ...[...presentB].filter(Boolean)]);
  const nameOf = (k: string) => ga.get(k)?.name ?? gb.get(k)?.name
    ?? allA.find((r) => textKey(r.cats[col] ?? "") === k)?.cats[col] ?? allB.find((r) => textKey(r.cats[col] ?? "") === k)?.cats[col] ?? k;
  const rows: JoinRow[] = [...keys].map((k) => {
    const va = round2(ga.get(k)?.v ?? 0), vb = round2(gb.get(k)?.v ?? 0);
    const diff = round2(vb - va);
    const tag: JoinRow["tag"] = !presentA.has(k) ? "nou" : !presentB.has(k) ? "dispărut" : diff > 0 ? "crescut" : diff < 0 ? "scăzut" : "egal";
    return { key: nameOf(k), a: va, b: vb, aOrders: ga.get(k)?.n ?? 0, bOrders: gb.get(k)?.n ?? 0, diff, pct: va ? round2((diff / va) * 100) : null, tag };
  });
  rows.sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b) || x.key.localeCompare(y.key, "ro"));
  return rows.slice(0, 500);
}

// ------------------------------------------------------------------ întrebări pe comparație

export interface CompareAnswer {
  sections: AnswerSection[]; notes: string[]; planText: string;
  table: { group: string; a: string; b: string } | null;
  rows: { group: string; currency: string; a: number; b: number; diff: number; pct: number | null; tag?: string }[];
  metricIsCount: boolean;
  /** Comenzile din spatele răspunsului, separat pe fiecare fișier, cu coloanele lui (valori exact ca în fișier). */
  details: { label: string; detail: AnswerDetail }[];
}

const fmt = (n: number, d = 2) => new Intl.NumberFormat("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(Math.abs(n))}%`;
const signedCount = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n), 0)}`;
const headerOf = (s: Side) => [...s.analysis.columns].sort((a, b) => a.index - b.index).map((c) => c.name);
function detailOf(recs: CleanRecord[], header: string[]): AnswerDetail {
  const sorted = [...recs].sort((a, b) => a.line - b.line);
  return { columns: ["Rând", ...header], rows: sorted.map((r) => [String(r.line), ...header.map((_, i) => r.raw?.[i] ?? "")]), total: sorted.length };
}
const signed = (n: number, cur: string, d: number) => `${n >= 0 ? "+" : "−"}${cur ? cur + " " : ""}${fmt(Math.abs(n), d)}`;

export function answerCompare(question: string, x: Side, y: Side): { answer?: CompareAnswer; error?: string } {
  const [A, B] = orderSides(x, y);
  const labels = labelsFor(A, B);
  const { matches, onlyA, onlyB } = matchColumns(A, B);
  const recA = A.records, recB = mapRecords(B, matches);
  const onlyNote = [...onlyA.map((c) => `„${c}” există doar în ${labels[0]}`), ...onlyB.map((c) => `„${c}” există doar în ${labels[1]}`)];
  const sameCalendar = recA.some((r) => r.month && recB.some((s) => s.month === r.month));

  // schema comună: coloanele din A, cu valorile din ambele fișiere
  const schema = schemaFor(A.analysis, [...recA, ...recB.map((r) => ({ ...r, cats: Object.fromEntries(Object.entries(r.cats).filter(([k]) => matches.some((m) => m.a === k))) }))]);
  const q = textKey(question);

  // 1. „ce clienți noi am” / „ce clienți au dispărut”
  const wantNew = /\b(noi|nou|noua|aparut|aparuti|aparute)\b/.test(q);
  const wantGone = /\b(disparut|disparuti|disparute|nu mai|lipsesc|pierduti)\b/.test(q) && !/\bbani\b/.test(q);
  if (wantNew || wantGone) {
    const col = colFromQuestion(q, schema) ?? A.analysis.meta.customerColumn;
    if (!col) return { error: "Nu găsesc coloana despre care întrebi (ex. clienți, produse, agenți)." };
    const inA = new Map(recA.map((r) => [textKey(r.cats[col] ?? ""), r.cats[col]]));
    const inB = new Map(recB.map((r) => [textKey(r.cats[col] ?? ""), r.cats[col]]));
    const list = wantNew ? [...inB].filter(([k]) => k && !inA.has(k)).map(([, v]) => v) : [...inA].filter(([k]) => k && !inB.has(k)).map(([, v]) => v);
    const title = wantNew ? `${col}: apar în ${labels[1]}, nu și în ${labels[0]}` : `${col}: apar în ${labels[0]}, nu și în ${labels[1]}`;
    const keys = new Set(list.map((v) => textKey(v ?? "")));
    const details = wantNew
      ? [{ label: labels[1], detail: detailOf(recB.filter((r) => keys.has(textKey(r.cats[col] ?? ""))), headerOf(B)) }]
      : [{ label: labels[0], detail: detailOf(recA.filter((r) => keys.has(textKey(r.cats[col] ?? ""))), headerOf(A)) }];
    return { answer: {
      sections: [{ title: `${title} — ${list.length}`, items: list.length ? list.sort((a, b) => a.localeCompare(b, "ro")) : ["niciunul"] }],
      notes: [], planText: `${wantNew ? "valori noi" : "valori dispărute"} în „${col}”`, table: null, rows: [], metricIsCount: true, details,
    } };
  }

  // 2. orice altă întrebare: același plan pe ambele fișiere, apoi alăturat + diferența
  let plan: Plan;
  const rp = rulePlan(question, schema);
  if (!rp.answerable && /\bcompar/.test(q)) plan = { answerable: true, metric: "sum", field: "valoare", filters: [], groupBy: null, sort: "desc", limit: 10 };
  else plan = rp;
  // „a crescut / a scăzut cel mai mult” → clasament după diferență
  const byChange = /\b(crescut|scazut|crestere|scadere)\b/.test(q);
  const v = validatePlan(plan, schema);
  if (!v.plan) {
    const err = v.error ?? "Nu am înțeles întrebarea.";
    return { error: onlyNote.length && /Nu găsesc/.test(err) ? `${err} Atenție: ${onlyNote.join("; ")}, deci acolo nu se poate compara.` : err };
  }
  plan = v.plan;
  if (byChange && !plan.groupBy) {
    const col = colFromQuestion(q, schema);
    if (col) plan = { ...plan, groupBy: col, limit: 1000 };
  }
  if (plan.groupBy) plan = { ...plan, limit: 1000 };
  if (schema.fields.some((f) => f.name === "status") && !plan.filters.some((f) => f.column === "status") && (plan.metric === "sum" || plan.metric === "avg" || plan.metric === "median")) {
    plan.filters.push({ column: "status", op: "eq", value: DELIVERED });
    plan.defaultStatus = true;
  }

  // filtrele pe lună: dacă perioadele nu se suprapun, „martie” înseamnă martie din fiecare fișier
  const forSide = (recs: CleanRecord[]): Plan => {
    if (sameCalendar) return plan;
    const own = [...new Set(recs.map((r) => r.month).filter(Boolean) as string[])];
    return { ...plan, filters: plan.filters.map((f) => {
      if (f.column !== "luna") return f;
      const mm = (Array.isArray(f.value) ? f.value : [f.value]).map((m) => String(m).slice(5, 7));
      return { column: "luna", op: "in", value: own.filter((m) => mm.includes(m.slice(5, 7))).concat(["\u0000"]) };
    }) };
  };
  const ansA = execute(forSide(recA), recA, {}, headerOf(A)), ansB = execute(forSide(recB), recB, {}, headerOf(B));
  const details = [{ label: labels[0], detail: ansA.detail }, { label: labels[1], detail: ansB.detail }];
  // procente („rata de retur”): fiecare fișier are propriul procent, le punem alăturat
  if (plan.metric === "share") {
    return { answer: {
      sections: [{ title: labels[0], items: ansA.sections.flatMap((x) => x.items) }, { title: labels[1], items: ansB.sections.flatMap((x) => x.items) }],
      notes: [], planText: ansA.planText, table: null, rows: [], metricIsCount: false, details,
    } };
  }
  const count = plan.metric === "count" || plan.metric === "distinct";
  const digits = plan.field === "cantitate" || count ? 0 : 2;
  const show = (n: number, cur: string) => count ? fmt(n, 0) : `${cur ? cur + " " : ""}${fmt(n, digits)}`;

  // rânduri alăturate (group × monedă)
  const key = (g: string, c: string) => `${textKey(g)}\u0000${c}`;
  const map = new Map<string, { group: string; currency: string; a: number; b: number }>();
  for (const r of ansA.rows) map.set(key(r.group, r.currency), { group: r.group, currency: r.currency, a: r.value, b: 0 });
  for (const r of ansB.rows) {
    const e = map.get(key(r.group, r.currency)) ?? { group: r.group, currency: r.currency, a: 0, b: 0 };
    e.b = r.value; map.set(key(r.group, r.currency), e);
  }
  let rows = [...map.values()].map((e) => ({ ...e, diff: round2(e.b - e.a), pct: e.a ? round2(((e.b - e.a) / e.a) * 100) : null }));
  const sections: AnswerSection[] = [];
  const notes: string[] = [];
  if (!plan.groupBy) {
    for (const r of rows) {
      sections.push({ title: `${r.currency ? r.currency + ": " : ""}${labels[0]} → ${labels[1]}`, items: [
        `${labels[0]}: ${show(r.a, r.currency)}`,
        `${labels[1]}: ${show(r.b, r.currency)}`,
        `Diferență: ${count ? signedCount(r.diff) : signed(r.diff, r.currency, digits)}${r.pct !== null ? ` (${fmtPct(r.pct)})` : ""}`,
      ] });
    }
    if (!rows.length) sections.push({ title: "Niciun rând nu corespunde filtrelor, în niciunul dintre fișiere", items: [] });
  } else {
    const desc = /\b(scazut|scadere)\b/.test(q) ? (x: number, y: number) => x - y : (x: number, y: number) => y - x;
    rows.sort((x, y) => byChange ? desc(x.diff, y.diff) : Math.max(y.a, y.b) - Math.max(x.a, x.b));
    const superl = /\b(cel|cea|cei|cele) mai\b/.test(q) && !/\btop\b/.test(q);
    const curs = [...new Set(rows.map((r) => r.currency))];
    for (const c of curs) {
      const rs = rows.filter((r) => r.currency === c);
      const take = superl ? rs.slice(0, 1) : rs.slice(0, 5);
      sections.push({
        title: `${byChange ? (/scazut|scadere/.test(q) ? "Cele mai mari scăderi" : "Cele mai mari creșteri") : "Alăturat"}${c ? ` — ${c}` : ""}`,
        items: [...take.map((r) => `${r.group}: ${show(r.a, c)} → ${show(r.b, c)} (${count ? signedCount(r.diff) : signed(r.diff, c, digits)}${r.pct !== null ? `, ${fmtPct(r.pct)}` : r.a === 0 && r.b > 0 ? ", nou" : ""})`),
          ...(rs.length > take.length ? [`…și încă ${rs.length - take.length} în tabel`] : [])],
      });
    }
  }
  if (plan.filters.some((f) => f.column === "status" && f.op === "eq" && f.value === DELIVERED)) notes.push("Doar comenzi livrate, în ambele fișiere.");
  if (!sameCalendar && plan.filters.some((f) => f.column === "luna")) notes.push(`Luna aleasă e comparată cu aceeași lună din celălalt fișier.`);
  for (const n of [...ansA.notes, ...ansB.notes]) if (/^Am înțeles/.test(n) && !notes.includes(n)) notes.push(n);
  rows = rows.slice(0, 500);
  return { answer: {
    sections, notes, planText: ansA.planText,
    table: plan.groupBy ? { group: ansA.table.group, a: labels[0], b: labels[1] } : null,
    rows, metricIsCount: count, details,
  } };
}

/** Coloana categorică pomenită în întrebare („clienți”, „agentul”, „produse”). */
function colFromQuestion(q: string, schema: ReturnType<typeof schemaFor>): string | null {
  const SYN: [RegExp, RegExp][] = [
    [/\b(client\w*|firm\w*|cumparator\w*)\b/, /client|firma|cumparator|customer|beneficiar|partener/],
    [/\b(produs\w*|articol\w*|servici\w*)\b/, /produs|articol|serviciu|product|sku|item/],
    [/\b(agent\w*|vanzator\w*|reprezentant\w*)\b/, /agent|vanzator|reprezentant|sales/],
    [/\b(oras\w*|localitat\w*|judet\w*|regiun\w*|zon\w*)\b/, /oras|localitate|judet|regiune|zona|city/],
  ];
  const cats = schema.fields.filter((f) => f.kind === "categorie");
  for (const [qre, cre] of SYN) if (qre.test(q)) { const f = cats.find((c) => cre.test(textKey(c.name))); if (f) return f.name; }
  for (const c of cats) { const w = textKey(c.name).split(/[^a-z0-9]+/).find((x) => x.length >= 4); if (w && q.includes(w.slice(0, Math.max(4, w.length - 2)))) return c.name; }
  return null;
}
