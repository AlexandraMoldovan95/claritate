// Întrebări în română.
// Modelul (sau, ca rezervă, regulile de mai jos) alege DOAR planul: ce metrică,
// ce coloană, ce filtre, ce grupare. Codul validează planul, calculează și scrie
// singur propoziția. Modelul nu vede rândurile și nu scrie nicio cifră.
//
// Regula de bază a planificatorului pe reguli: dacă întrebarea pomenește ceva ce nu
// găsim în fișier (un nume, un oraș, o lună, o coloană), NU răspundem cu totalul —
// spunem ce n-am găsit. Un refuz clar e mai bun decât o cifră convingătoare greșită.

import type { Analysis } from "./analyze.js";
import { monthName } from "./analyze.js";
import type { CleanRecord } from "./clean.js";
import { round2 } from "./clean.js";
import { textKey } from "./normalize.js";

export type Metric = "sum" | "count" | "avg" | "median" | "min" | "max" | "distinct" | "share";
export type Op = "eq" | "in" | "neq" | "between" | "gt" | "gte" | "lt" | "lte" | "contains";

export interface Plan {
  answerable: boolean;
  metric: Metric;
  field: string | null;            // "valoare", "cantitate", "pret", o coloană numerică; la "distinct": coloana categorică; null la count
  filters: { column: string; op: Op; value: string | number | (string | number)[] }[];
  groupBy: string | null;          // coloană categorică, "status", "luna", "moneda" sau null
  sort: "desc" | "asc";
  limit: number;
  reason?: string;                 // doar când answerable = false
  defaultStatus?: boolean;         // statusul „Livrată” a fost pus implicit (întrebarea nu a cerut un status)
  compare?: boolean;               // „martie față de februarie”: afișăm și diferența
  notes?: string[];                // interpretări făcute de reguli, afișate utilizatorului
}

const DELIVERED = "Livrată";
const LOST = ["Retur", "Anulată"];

// ------------------------------------------------------------------ schema

export interface SchemaField { name: string; kind: "categorie" | "numeric" | "data" | "status" | "moneda"; values?: string[]; column?: string }

/** Ce vede modelul: numele coloanelor și valorile categorice — fără cifre. */
export function schemaFor(a: Analysis, records: CleanRecord[]): { fields: SchemaField[]; months: string[] } {
  const fields: SchemaField[] = [];
  const catNames = a.columns.filter((c) => c.role === "category").map((c) => c.name);
  for (const name of catNames) {
    const vals = [...new Set(records.map((r) => r.cats[name]))];
    fields.push({ name, kind: "categorie", values: vals.length <= 300 ? vals.sort((x, y) => x.localeCompare(y, "ro")) : undefined });
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
  // modelul primește maximum 60 de valori pe coloană
  const fields = schema.fields.map((f) => f.values && f.values.length > 60 ? { ...f, values: undefined } : f);
  return `Ești un planificator de interogări pentru un tabel de vânzări curățat. NU calculezi nimic și NU scrii cifre din date: alegi doar CE se calculează.
Câmpuri disponibile (JSON): ${JSON.stringify(fields)}
"valoare" = valoarea principală a fiecărui rând (la vânzări: cantitate × preț); câmpul "column" arată cum se numește coloana în fișier — dacă întrebarea folosește numele acela (ex. „nota”, „suma”), folosește câmpul intern ("valoare", "cantitate" sau "pret"). "luna" are forma YYYY-MM.
Răspunde DOAR cu un obiect JSON de forma:
{"answerable": true, "metric": "sum|count|avg|median|min|max|distinct|share", "field": "valoare|cantitate|pret|<coloana numerică>|<coloana categorică la distinct>|null", "filters": [{"column": "<câmp>", "op": "eq|in|neq|between|gt|gte|lt|lte|contains", "value": "..."}], "groupBy": "<câmp categorie>|status|luna|moneda|null", "sort": "desc|asc", "limit": 10}
Reguli:
- Folosește doar câmpurile de mai sus, cu valorile scrise exact ca în listă. Dacă întrebarea pomenește un nume/loc/lună care nu există în listă: {"answerable": false, "reason": "..."}.
- Status: "venit", "vânzări", "livrat", "încasat" → status = Livrată. "retur/retururi/returnat" → DOAR Retur. "anulat/anulări" → DOAR Anulată. "pierdut/pierderi" fără alte precizări → status in [Retur, Anulată]. "în curs/nelivrat/blocat" → În curs.
- "cel mai / cea mai" + singular (ex. „cea mai bună lună”, „cel mai bun client”) → groupBy pe acel câmp, limit 1. „cea mai slabă / cel mai mic / cel mai puțin” → sort asc.
- „cea mai bună / slabă lună” fără alt status → filtru status = Livrată, groupBy luna, limit 1.
- "top N" / "primii N" / "primele N" → groupBy + sort desc + limit N.
- "câte / câți / numărul de" comenzi → metric count, field null. "câte bucăți / ce cantitate" → sum pe cantitate. "câți clienți / câte produse" → metric distinct, field = coloana. "rata de retur / ce procent" → metric share cu filtrul de status.
- Dacă întrebarea nu se poate răspunde din aceste câmpuri: {"answerable": false, "reason": "<scurt, în română>"}.
Exemple:
„Care a fost cea mai slabă lună?” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Livrată"}],"groupBy":"luna","sort":"asc","limit":1}
„Cât am pierdut din retururi?” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Retur"}],"groupBy":null,"sort":"desc","limit":10}
„Top 3 clienți după venit” → {"answerable":true,"metric":"sum","field":"valoare","filters":[{"column":"status","op":"eq","value":"Livrată"}],"groupBy":"<coloana de client>","sort":"desc","limit":3}`;
}

// ------------------------------------------------------------------ vocabular (reguli)

const MONTH_WORDS: [RegExp, number][] = [
  [/\bian(uarie)?\b/g, 1], [/\bfeb(ruarie)?\b/g, 2], [/\bmart(ie)?\b/g, 3], [/\bapr(ilie)?\b/g, 4],
  [/\bmai\b/g, 5], [/\biun(ie)?\b/g, 6], [/\biul(ie)?\b/g, 7], [/\baug(ust)?\b/g, 8],
  [/\bsep(t|tembrie)?\b/g, 9], [/\boct(ombrie)?\b/g, 10], [/\bnoi(embrie)?\b/g, 11], [/\bdec(embrie)?\b/g, 12],
];
const MONTH_TOKENS = new Set(["ian", "ianuarie", "feb", "februarie", "mart", "martie", "apr", "aprilie", "mai", "iun", "iunie", "iul", "iulie", "aug", "august", "sep", "sept", "septembrie", "oct", "octombrie", "noi", "noiembrie", "dec", "decembrie"]);

const NUM_WORDS: Record<string, number> = { unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10 };

/** Cuvinte de întrebare, nu nume din date. Nu le căutăm printre clienți/produse/orașe. */
const VOCAB = new Set(`
cat cata cate cati cand cine care ce cum unde de la din in pe per pt pentru cu si sau ori fara dupa catre spre sub peste intre pana fata
am ai a au are avem aveti avut fost este e sunt era vor fi fie sa se ne mi mie imi iti isi nu da
cel cea cei cele mai _mai_ mult multa multe multi putin putina putine putini bun buna buni bune bine slab slaba slabe prost proasta mare mari mic mica mici
top primii primele primul prima ultimii ultimele ultimul ultima al ale lui lor
total totalul totala totale toate toti tot general overall suma sumele valoare valoarea valori valorile bani banii venit venitul venituri incasari incasat incasate
vandut vanduta vandute vanduti vanzari vanzarile vanzare vanzarea vand vinde vindem vandut cumparat cumparata cumparate cumparati cumpara facturat
comanda comenzi comenzile comenzii comenzilor order orders bucati bucata buc unitati cantitate cantitatea cantitati pret pretul preturi
medie media mediu mediana medii rata procent procentul procentaj procente maxim maxima minim minima scumpa scump ieftin ieftina
luna luni lunile lunii lunar lunara anul an anului trimestru trimestrul trimestre semestru semestrul saptamana zi zile perioada perioadei
fiecare fiecarui fiecarei acest aceasta aceste acesti asta astea respectiv anume exact aproximativ cam doar numai inclusiv
status statusul statusuri stare moneda monede valuta lei ron eur euro usd dolari
livrat livrata livrate livrati retur retururi returnat returnata returnate returnari anulat anulata anulate anulati anulari anulare
pierdut pierduta pierdute pierduti pierderi pierdere curs nelivrat nelivrate asteptare deschise blocat blocata blocati
numar numarul nr diferenta diferente comparat comparativ comparatie compar comparam versus vs crescut scazut evolutie
clienti client clientul clientului clientii clientilor produse produs produsul produsului produsele articol articole
cifra cifre afaceri profit castig castigat fata adica deci ok va rog spune spuneti arata aratati zi-mi
functie plus afara rest suta inceput inceputul sfarsit sfarsitul fisier fisierul date datele tabel tabelul fel diferite diferiti distincte distincti unei unui unor
`.split(/\s+/).filter(Boolean));

/** Sinonime pentru numele coloanelor categorice („agentul” → coloana „Agent vânzări”). */
const COLUMN_SYNONYMS: string[][] = [
  ["agent", "agenti", "vanzator", "vanzatori", "vanzatoare", "reprezentant", "angajat", "angajati", "consultant", "sales", "salesman"],
  ["oras", "orase", "localitate", "localitati", "judet", "judete", "regiune", "regiuni", "zona", "zone", "city", "region"],
  ["client", "clienti", "cumparator", "cumparatori", "firma", "firme", "companie", "companii", "customer", "beneficiar"],
  ["produs", "produse", "articol", "articole", "item", "sku", "serviciu", "servicii", "product"],
  ["categorie", "categorii", "category", "grupa", "familie"],
  ["canal", "canale", "sursa", "surse", "channel"],
  ["tara", "tari", "country"],
];
/** Cuvinte din numele unei coloane care nu spun nimic despre ea („Nume client” → „client”). */
const GENERIC_COL_WORDS = new Set(["nume", "nr", "numar", "cod", "de", "al", "ale", "a", "vanzari", "vanzare", "comanda", "comenzii", "total", "valoare", "data", "tip", "denumire", "id", "name"]);

const rootOf = (w: string) => w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2));
const words = (s: string) => textKey(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Cuvintele după care recunoaștem o coloană în întrebare. */
function columnKeys(name: string): string[] {
  const own = words(name).filter((w) => w.length >= 3 && !GENERIC_COL_WORDS.has(w));
  const keys = new Set(own);
  for (const group of COLUMN_SYNONYMS) {
    if (own.some((w) => group.some((g) => rootOf(g) === rootOf(w) || w.startsWith(rootOf(g))))) group.forEach((g) => keys.add(g));
  }
  return [...keys];
}
const tokenRefersTo = (t: string, keys: string[]) => t.length >= 3 && keys.some((k) => t === k || (t.length >= 4 && t.startsWith(rootOf(k))));

/** Un cuvânt din întrebare se potrivește cu un cuvânt dintr-o valoare? („cluj” ↔ „Cluj-Napoca”, „ionescu” ↔ „Ionescu Mihai”) */
const wordMatches = (t: string, w: string) => t === w || (t.length >= 4 && w.length >= 4 && (w.startsWith(t) || t.startsWith(w)));

/** Ce status cere explicit întrebarea. „retururi” e mai precis decât „pierdut”, deci are prioritate. */
function statusFromWords(q: string): Plan["filters"][number] | null {
  const retur = /\b(retur|returnat|returnate|retururi|returnata|returnari)\b/.test(q);
  const anulat = /\b(anulat|anulate|anulata|anulari|anulare|anulati)\b/.test(q);
  if (retur && anulat) return { column: "status", op: "in", value: [...LOST] };
  if (retur) return { column: "status", op: "eq", value: "Retur" };
  if (anulat) return { column: "status", op: "eq", value: "Anulată" };
  if (/\b(pierdut|pierduti|pierderi|pierdere|pierdute)\b/.test(q)) return { column: "status", op: "in", value: [...LOST] };
  if (/\b(in curs|nelivrat|nelivrate|in asteptare|deschise|blocat|blocata|blocati)\b/.test(q)) return { column: "status", op: "eq", value: "În curs" };
  if (/\b(livrat|livrate|livrata|venit|venitul|venituri|vandut|vandute|incasat|incasari)\b/.test(q)) return { column: "status", op: "eq", value: DELIVERED };
  return null;
}

const normQ = (question: string) => textKey(question).replace(/[?!.,;:„”"()]/g, " ").replace(/\s+/g, " ").trim();

/** „1.000”, „1 000”, „2,5”, „3k”, „10 mii” → număr */
function parseQNumber(raw: string, suffix?: string): number | null {
  let s = raw.trim().replace(/\s+/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return suffix === "k" || suffix === "mii" ? n * 1000 : n;
}

/**
 * Plasă de siguranță peste planul modelului: dacă planul contrazice ce scrie explicit
 * în întrebare (statusul cerut, „cea mai … lună” = o singură lună), codul îl corectează.
 * Tot ce se schimbă apare în „Am calculat: …”, deci corecția e vizibilă.
 * (Se aplică doar planurilor de la model; regulile de mai jos fac deja aceste lucruri.)
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
    p.filters.push({ column: "status", op: "eq", value: DELIVERED });
  }
  if (/\b(cea mai slaba|cea mai proasta|cel mai slab|cel mai mic|cea mai mica|cel mai putin|cea mai putin)\b/.test(q)) p.sort = "asc";
  return p;
}

// ------------------------------------------------------------------ reguli (fără model)

const refuse = (reason: string): Plan => ({ answerable: false, reason, metric: "sum", field: null, filters: [], groupBy: null, sort: "desc", limit: 10 });

/** Planificator pe cuvinte-cheie. Merge fără model și fără internet. */
export function rulePlan(question: string, schema: ReturnType<typeof schemaFor>): Plan {
  const q = normQ(question);
  // „cea mai” / „cel mai” / „mai mare de” nu înseamnă luna mai
  const qm = q
    .replace(/\b(cea|cel|cei|cele) mai\b/g, "$1 _mai_")
    .replace(/\bmai (mare|mari|mult|multe|multi|mic|mica|mici|putin|putine|bun|buna|bune|buni|bine|slab|slaba|prost|proasta|scump|scumpa|ieftin|ieftina|vandut|vandute|jos|sus|sunt|avem|am|ai|des)\b/g, "_mai_ $1");
  const tokens = qm.split(" ").filter(Boolean);
  const plan: Plan = { answerable: true, metric: "sum", field: "valoare", filters: [], groupBy: null, sort: "desc", limit: 10, notes: [] };
  const has = (name: string) => schema.fields.some((f) => f.name === name);
  if (!has("valoare")) plan.field = has("cantitate") ? "cantitate" : null;
  const catFields = schema.fields.filter((f) => f.kind === "categorie");
  const keysOf = new Map(catFields.map((f) => [f.name, columnKeys(f.name)]));
  let understood = false;
  const consumed = new Set<number>(); // pozițiile tokenilor deja „înțeleși”

  // ---------- coloane pomenite în întrebare („agentul”, „orașe”, „clienți”)
  const colRefs: { field: string; pos: number }[] = [];
  tokens.forEach((t, pos) => {
    for (const f of catFields) if (tokenRefersTo(t, keysOf.get(f.name)!)) colRefs.push({ field: f.name, pos });
  });
  colRefs.forEach((c) => consumed.add(c.pos));

  // ---------- valori categorice întregi („Solaris Energy”, „EUR”)
  const filterCols = new Set<string>();
  for (const f of schema.fields) {
    if (f.kind !== "categorie" && f.kind !== "moneda") continue;
    const hit = (f.values ?? []).filter((v) => v.length > 2 && new RegExp(`(^| )${textKey(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(q));
    if (f.kind === "moneda") {
      if (/\b(lei|ron)\b/.test(q) && f.values?.includes("RON") && !hit.includes("RON")) hit.push("RON");
      if (/\b(euro|eur)\b/.test(q) && f.values?.includes("EUR") && !hit.includes("EUR")) hit.push("EUR");
    }
    // „Ionescu Construct” se potrivește întreg; nu mai lăsăm și „Ionescu” să caute separat
    const longest = hit.filter((v) => !hit.some((o) => o !== v && textKey(o).includes(textKey(v))));
    if (longest.length) {
      plan.filters.push(longest.length === 1 ? { column: f.name, op: "eq", value: longest[0] } : { column: f.name, op: "in", value: longest });
      filterCols.add(f.name);
      understood = true;
      for (const v of longest) {
        const vw = words(v);
        tokens.forEach((t, pos) => { const tw = words(t); if (tw.length && tw.every((w) => vw.includes(w))) consumed.add(pos); });
      }
    }
  }

  // ---------- nume parțiale („agentul Ionescu”, „în Cluj”, „de la Hermes”)
  // Un cuvânt e „candidat de nume” dacă e scris cu majusculă (nu la început) sau urmează după „de la / din / în / agentul…”.
  const orig = question.replace(/[?!.,;:„”"()]/g, " ").split(/\s+/).filter(Boolean);
  const capital = new Set(orig.slice(1).filter((w) => /^\p{Lu}/u.test(w)).map((w) => textKey(w)));
  const TRIGGERS = new Set(["la", "din", "in", "pentru", "lui"]);
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  tokens.forEach((t, pos) => {
    if (consumed.has(pos) || t.length < 3 || VOCAB.has(t) || MONTH_TOKENS.has(t) || /^\d/.test(t) || /^[tq][1-4]$/.test(t)) return;
    const tw = words(t);
    const prev = tokens[pos - 1] ?? "";
    const prevIsCol = colRefs.find((c) => c.pos === pos - 1);
    const candidate = capital.has(t) || TRIGGERS.has(prev) || !!prevIsCol;
    // în ce coloană căutăm: dacă e precedat de numele coloanei („agentul X”), doar acolo
    const fields = prevIsCol ? catFields.filter((f) => f.name === prevIsCol.field) : catFields.filter((f) => !filterCols.has(f.name));
    const matches: { field: string; value: string }[] = [];
    for (const f of fields) for (const v of f.values ?? []) { const vw = words(v); if (tw.some((x) => vw.some((w) => wordMatches(x, w)))) matches.push({ field: f.name, value: v }); }
    if (!matches.length) { if (candidate) unknown.push(orig.find((w) => textKey(w) === t) ?? t); return; }
    consumed.add(pos);
    const byField = new Map<string, string[]>();
    for (const m of matches) byField.set(m.field, [...(byField.get(m.field) ?? []), m.value]);
    if (byField.size > 1 || [...byField.values()][0].length > 1) {
      const opts = matches.slice(0, 6).map((m) => `${m.value} (${m.field})`).join(", ");
      ambiguous.push(`„${orig.find((w) => textKey(w) === t) ?? t}” se potrivește cu mai multe: ${opts}${matches.length > 6 ? "…" : ""}`);
      return;
    }
    const [field, vals] = [...byField.entries()][0];
    const existing = plan.filters.find((f) => f.column === field);
    if (existing) {
      // al doilea cuvânt din același nume („Med Expert”) — nu adăugăm alt filtru
      if (existing.value !== vals[0]) {
        const cur = Array.isArray(existing.value) ? existing.value : [existing.value];
        if (!cur.includes(vals[0])) { existing.op = "in"; existing.value = [...cur, vals[0]]; }
      }
    } else plan.filters.push({ column: field, op: "eq", value: vals[0] });
    if (vals[0] && textKey(vals[0]) !== t) plan.notes!.push(`„${orig.find((w) => textKey(w) === t) ?? t}” = ${vals[0]} (${field})`);
    understood = true;
  });
  if (ambiguous.length) return refuse(`${ambiguous.join(". ")}. Scrie numele complet, ca să știu la care te referi.`);
  if (unknown.length) {
    const where = catFields.map((f) => f.name).join(", ");
    return refuse(`Nu găsesc ${unknown.map((u) => `„${u}”`).join(", ")} în fișier${where ? ` (am căutat în: ${where})` : ""}. Verifică scrierea sau folosește numele exact din date.`);
  }

  // ---------- status
  if (has("status")) {
    const st = statusFromWords(q);
    if (st) { plan.filters.push(st); understood = true; }
  }

  // ---------- metrica
  const unitsWanted = /\b(bucati|bucata|unitati|cantitate|cantitati|cantitatea)\b/.test(q) && has("cantitate");
  const moneyWanted = /\b(cati bani|cata suma|ce suma|ce valoare|cati lei|cati euro|cat bani)\b/.test(q);
  const maxOrder = qm.match(/\b(cea|cel) _mai_ (mare|mica|scumpa|ieftina|mic|scump|ieftin) (comanda|vanzare|factura|tranzactie)\b/) ?? q.match(/\bcomanda (maxima|minima)\b/);
  const countWord = /\b(cate|cati|numar(ul)? de|nr de|numarul)\b/.test(q);
  if (unitsWanted && !/\bcomenzi\b/.test(q)) { plan.field = "cantitate"; understood = true; }
  else if (/\b(rata|procent|procentul|procentaj|ce parte|la suta)\b/.test(q) || q.includes("%")) { plan.metric = "share"; understood = true; }
  else if (maxOrder) {
    plan.metric = /mica|ieftin|minima|\bmic\b/.test(maxOrder[0]) ? "min" : "max";
    understood = true;
  } else if (countWord && !moneyWanted) {
    // „câți clienți”, „câte produse (diferite)” → valori distincte
    const m = q.match(/\b(cate|cati|numarul de|numar de)\s+(\w+)/);
    const distinctField = m ? catFields.find((f) => tokenRefersTo(m[2], keysOf.get(f.name)!)) : undefined;
    if (distinctField && !/\bcomenzi\b/.test(q)) { plan.metric = "distinct"; plan.field = distinctField.name; }
    else { plan.metric = "count"; plan.field = null; }
    understood = true;
  }
  if (/\b(medie|mediu|media|in medie)\b/.test(q)) { plan.metric = "avg"; understood = true; }
  else if (/\bmediana\b/.test(q)) { plan.metric = "median"; understood = true; }
  if (/\b(venit|valoare|valoarea|suma|total|totalul|incasari|vanzari|bani|cat|cata|pierdut|comenzi|comanda|vandut|cumparat|incasat)\b/.test(q)) understood = true;

  // ---------- filtre numerice („peste 1000 lei”, „sub 500”)
  const numRe = /\b(peste|mai mare de|mai mari de|mai mult de|de peste|cel putin|minim|minimum|sub|mai mic de|mai mici de|mai putin de|cel mult|maxim|maximum)\s+(\d[\d.\s]*(?:,\d+)?)\s*(k|mii)?\s*(lei|ron|eur|euro|bucati|buc)?/g;
  for (const m of q.matchAll(numRe)) {
    const n = parseQNumber(m[2], m[3]);
    if (n === null) continue;
    const op: Op = /peste|mare|mult de/.test(m[1]) ? "gt" : /putin|minim/.test(m[1]) ? "gte" : /sub|mic/.test(m[1]) ? "lt" : "lte";
    const field = m[4] && /buc/.test(m[4]) && has("cantitate") ? "cantitate" : has("valoare") ? "valoare" : null;
    if (!field) return refuse("Fișierul nu are o coloană de valoare după care să filtrez.");
    plan.filters.push({ column: field, op, value: n });
    if (plan.metric === "max" || plan.metric === "min") { if (/maxim|minim/.test(m[1])) plan.metric = "sum"; }
    understood = true;
  }

  // ---------- perioade
  const monthsAll = schema.months;
  const year = q.match(/\b(20\d{2})\b/)?.[1];
  const inYear = (mm: number) => monthsAll.filter((x) => Number(x.slice(5)) === mm && (!year || x.startsWith(year)));
  const latestYear = monthsAll.length ? monthsAll[monthsAll.length - 1].slice(0, 4) : "";
  const periodMonths = (from: number, to: number) => monthsAll.filter((x) => {
    const mm = Number(x.slice(5));
    return mm >= from && mm <= to && x.startsWith(year ?? latestYear);
  });
  let monthFilter: string[] | null = null;
  let periodLabel = "";
  const nWord = (s: string) => /^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? null;
  const lastN = q.match(/\bultimele (\w+) luni\b/);
  const quarter = q.match(/\b(?:trimestrul|trimestru) (1|2|3|4|i|ii|iii|iv|unu|doi|trei|patru)\b|\b(primul|al doilea|al treilea|al patrulea|ultimul) trimestru\b|\b[tq]([1-4])\b/);
  const semester = q.match(/\b(?:semestrul|semestru) (1|2|i|ii)\b|\b(primul|al doilea|ultimul) semestru\b/);
  if (lastN && has("luna")) {
    const n = nWord(lastN[1]);
    if (n) { monthFilter = monthsAll.slice(-n); periodLabel = `ultimele ${n} luni din fișier`; }
  } else if (/\b(ultima luna|luna trecuta)\b/.test(q) && has("luna")) {
    monthFilter = monthsAll.slice(-1); periodLabel = "ultima lună din fișier";
  } else if (quarter && has("luna")) {
    const raw = quarter[1] ?? quarter[2] ?? quarter[3];
    const map: Record<string, number> = { "1": 1, i: 1, unu: 1, primul: 1, "2": 2, ii: 2, doi: 2, "al doilea": 2, "3": 3, iii: 3, trei: 3, "al treilea": 3, "4": 4, iv: 4, patru: 4, "al patrulea": 4 };
    let k = map[raw];
    if (raw === "ultimul") k = monthsAll.length ? Math.ceil(Number(monthsAll[monthsAll.length - 1].slice(5)) / 3) : 0;
    if (k) { monthFilter = periodMonths(3 * k - 2, 3 * k); periodLabel = `trimestrul ${k} ${year ?? latestYear}`; }
  } else if (semester && has("luna")) {
    const raw = semester[1] ?? semester[2];
    const k = raw === "1" || raw === "i" || raw === "primul" ? 1 : 2;
    monthFilter = periodMonths(6 * k - 5, 6 * k); periodLabel = `semestrul ${k} ${year ?? latestYear}`;
  } else {
    // luni pomenite, în ordinea din întrebare
    const hits: { pos: number; m: number }[] = [];
    for (const [re, m] of MONTH_WORDS) for (const x of qm.matchAll(re)) hits.push({ pos: x.index!, m });
    hits.sort((a, b) => a.pos - b.pos);
    const ms = [...new Set(hits.map((h) => h.m))];
    const perMonth = /\bpe (fiecare )?luna\b|\bpe luni\b|\blunar\b|\bfiecare luna\b/.test(q);
    if (ms.length && has("luna") && !perMonth) {
      const missing = ms.filter((m) => !inYear(m).length);
      if (missing.length) {
        const span = monthsAll.length ? ` Fișierul are date din ${monthName(monthsAll[0])} până în ${monthName(monthsAll[monthsAll.length - 1])}.` : "";
        const names = missing.map((m) => monthName(`${year ?? latestYear}-${String(m).padStart(2, "0")}`)).join(", ");
        return refuse(`Nu există comenzi în ${names}.${span}`);
      }
      const range = ms.length === 2 && /\b(intre|pana)\b/.test(q);
      if (range) {
        const [a, b] = [Math.min(...ms), Math.max(...ms)];
        monthFilter = periodMonths(a, b);
      } else monthFilter = ms.map((m) => { const c = inYear(m); return c[c.length - 1]; });
      if (ms.length >= 2 && /\b(fata|versus|vs|comparativ|comparat|compar|comparatie|comparam|diferenta)\b/.test(q)) plan.compare = true;
    } else if (year && has("luna") && !ms.length) {
      const ys = monthsAll.filter((x) => x.startsWith(year));
      if (!ys.length) return refuse(`Nu există comenzi în ${year} în fișier.`);
      if (ys.length < monthsAll.length) monthFilter = ys;
    }
  }
  if (monthFilter) {
    if (!monthFilter.length) return refuse(`Nu există comenzi în ${periodLabel || "perioada cerută"}.`);
    plan.filters.push(monthFilter.length === 1 ? { column: "luna", op: "eq", value: monthFilter[0] } : { column: "luna", op: "in", value: monthFilter });
    if (periodLabel) plan.notes!.push(`${periodLabel}: ${monthFilter.map(monthName).join(", ")}`);
    understood = true;
  }

  // ---------- grupare
  const topM = q.match(/\b(top|primii|primele|cei mai buni|cele mai bune)\s*(\d+|unu|doi|doua|trei|patru|cinci|sase|sapte|opt|noua|zece)?\b/);
  const superlative = /\b(cel|cea|cei|cele) _mai_\b/.test(qm);
  const perWords = /\b(pe|per|fiecare|fiecarui|fiecarei|dupa|defalcat)\b/.test(q) || /\bin functie de\b/.test(q);
  let group: string | null = null;
  if (plan.compare) group = "luna";
  else if (/\bluna\b|\bluni\b|\blunar\b|\blunile\b/.test(q) && has("luna") && (superlative || topM || /\b(pe|per|fiecare|dupa|lunar)\b/.test(q))) group = "luna";
  else if (/\bpe (fiecare )?status\b|\bpe statusuri\b/.test(q)) group = "status";
  else if (/\bpe (fiecare )?moneda\b|\bpe monede\b/.test(q)) group = "moneda";
  else if ((superlative || topM || perWords || /\bcine\b/.test(q)) && plan.metric !== "distinct" && plan.metric !== "max" && plan.metric !== "min") {
    // coloana pomenită care nu e deja folosită ca filtru
    const refs = colRefs.filter((c) => !plan.filters.some((f) => f.column === c.field));
    if (refs.length) group = refs[0].field;
    else if (superlative || topM) {
      // „cel mai bun vânzător” fără coloană de vânzători → refuz, nu răspuns cu clienții
      const noun = qm.match(/\b(?:cel|cea|cei|cele) _mai_ (?:\w+) (\w+)/)?.[1] ?? qm.match(/\b(?:top|primii|primele) (?:\d+ )?(\w+)/)?.[1];
      const known = noun && (VOCAB.has(noun) || MONTH_TOKENS.has(noun) || /^\d/.test(noun));
      const clientish = noun && /^(client|clienti)/.test(noun);
      const productish = noun && /^(produs|produse|articol)/.test(noun);
      if (noun && !known && !clientish && !productish) {
        const cols = catFields.map((f) => f.name).join(", ") || "niciuna";
        return refuse(`Nu există în fișier o coloană pentru „${noun}”. Coloane după care pot grupa: ${cols}.`);
      }
      if (clientish || productish) return refuse(`Nu găsesc o coloană de ${clientish ? "clienți" : "produse"} în fișier. Coloane după care pot grupa: ${catFields.map((f) => f.name).join(", ") || "niciuna"}.`);
      if (catFields[0] && !(plan.metric === "count" && !/\b(care|cine)\b/.test(q))) {
        group = catFields[0].name;
        plan.notes!.push(`grupat după „${group}” (nu ai precizat coloana)`);
      }
    }
  }
  if (group) understood = true;
  // „cele mai multe comenzi / anulări” = numărare
  if (group && /\b(cele|cei) _mai_ (multe|multi)\b/.test(qm) && !moneyWanted && !unitsWanted) { plan.metric = "count"; plan.field = null; }
  plan.groupBy = group;
  if (/\b(cel _mai_ putin|cea _mai_ putin|cea _mai_ slaba|cea _mai_ proasta|cel _mai_ slab|cei _mai_ slabi|cele _mai_ mici|cei _mai_ mici|cele _mai_ slabe|cel _mai_ mic|cea _mai_ mica|cele _mai_ putine|cei _mai_ putini)\b/.test(qm)) plan.sort = "asc";
  const nAfterSup = qm.match(/\b(?:cei|cele) _mai_ \w+ (\d+|doi|doua|trei|patru|cinci|sase|sapte|opt|noua|zece)\b/)?.[1]
    ?? q.match(/\b(\d+|doi|doua|trei|patru|cinci|sase|sapte|opt|noua|zece) (clienti|produse|agenti|orase|luni|articole|firme)\b/)?.[1];
  const nTop = topM?.[2] ? nWord(topM[2]) : nAfterSup ? nWord(nAfterSup) : null;
  const every = /\b(fiecare|fiecarui|fiecarei|toti|toate|tuturor)\b/.test(q);
  const n = nTop ?? (superlative && !topM ? 1 : every ? 1000 : 10);
  if (nTop && superlative && !topM) plan.limit = nTop;
  plan.limit = Math.min(Math.max(group === "luna" && !topM && !superlative ? 1000 : n, 1), 1000);

  // ---------- status implicit: la sume/medii pe valoare, doar comenzile livrate
  // (anulatele și retururile apar separat în răspuns, vezi execute)
  // (la „cea mai mare comandă” nu: căutăm în toate comenzile și spunem statusul ei)
  const valueMetric = plan.metric === "sum" || plan.metric === "avg" || plan.metric === "median";
  if (has("status") && valueMetric && plan.field && !plan.filters.some((f) => f.column === "status")) {
    plan.filters.push({ column: "status", op: "eq", value: DELIVERED });
    plan.defaultStatus = true;
  }
  if (plan.metric === "share" && has("status") && !plan.filters.some((f) => f.column === "status") && /\b(vanzari|vandut|venit|venitul|incasari|incasat)\b/.test(q)) {
    plan.filters.push({ column: "status", op: "eq", value: DELIVERED });
    plan.defaultStatus = true;
  }
  if (plan.metric === "share" && !plan.filters.some((f) => f.column !== "luna" && f.column !== "moneda" && !(f.column === "status" && (plan.defaultStatus || f.value === DELIVERED)))) {
    return refuse("Pentru o rată am nevoie să știu din ce: de exemplu „rata de retur”, „procentul de anulări” sau „ce procent din vânzări vine de la <client>”.");
  }

  if (!understood) return refuse("Nu am înțeles întrebarea în raport cu datele din fișier. Încearcă una dintre întrebările sugerate.");
  if (!plan.notes!.length) delete plan.notes;
  return plan;
}

// ------------------------------------------------------------------ validare

const METRICS: Metric[] = ["sum", "count", "avg", "median", "min", "max", "distinct", "share"];
const OPS: Op[] = ["eq", "in", "neq", "between", "gt", "gte", "lt", "lte", "contains"];

export function validatePlan(raw: unknown, schema: ReturnType<typeof schemaFor>): { plan?: Plan; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Planul primit nu e un obiect JSON." };
  const p = raw as Partial<Plan>;
  if (p.answerable === false) return { error: typeof p.reason === "string" ? p.reason : "Întrebarea nu se poate calcula din acest fișier." };
  const metric = METRICS.includes(p.metric as Metric) ? p.metric as Metric : null;
  if (!metric) return { error: "Metrica aleasă nu e permisă." };
  const byName = (n: unknown) => typeof n === "string"
    ? schema.fields.find((f) => textKey(f.name) === textKey(n)) ?? schema.fields.find((f) => f.column && textKey(f.column) === textKey(n))
    : undefined;

  let field: string | null = null;
  if (metric === "distinct") {
    const f = byName(p.field);
    if (!f || f.kind === "numeric" || f.kind === "data") return { error: `Nu pot număra valorile distincte din „${String(p.field)}”.` };
    field = f.name;
  } else if (metric === "share") {
    const f = p.field ? byName(p.field) : schema.fields.find((x) => x.name === "valoare");
    field = f && f.kind === "numeric" ? f.name : null;
  } else if (metric !== "count") {
    const f = byName(p.field ?? "valoare");
    if (!f || f.kind !== "numeric") return { error: `Coloana „${String(p.field)}” nu e numerică.` };
    field = f.name;
  }

  const filters: Plan["filters"] = [];
  for (const raw of Array.isArray(p.filters) ? p.filters.slice(0, 10) : []) {
    const f = byName(raw?.column);
    if (!f) return { error: `Nu există câmpul „${String(raw?.column)}”.` };
    const op = OPS.includes(raw.op) ? raw.op : "eq";
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
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 1000);
  const plan: Plan = { answerable: true, metric, field, filters, groupBy, sort: p.sort === "asc" ? "asc" : "desc", limit };
  if (p.defaultStatus) plan.defaultStatus = true;
  if (p.compare) plan.compare = true;
  if (Array.isArray(p.notes) && p.notes.length) plan.notes = p.notes.map(String);
  return { plan };
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
  const num = typeof v === "number";
  switch (f.op) {
    case "eq": return s === vals[0];
    case "neq": return s !== vals[0];
    case "in": return vals.includes(s);
    case "contains": return textKey(s).includes(textKey(vals[0]));
    case "gt": return num ? (v as number) > Number(vals[0]) : false;
    case "lt": return num ? (v as number) < Number(vals[0]) : false;
    case "gte": return num ? (v as number) >= Number(vals[0]) : s >= vals[0];
    case "lte": return num ? (v as number) <= Number(vals[0]) : s <= vals[0];
    case "between": return vals.length >= 2 && (num ? (v as number) >= Number(vals[0]) && (v as number) <= Number(vals[1]) : s >= vals[0] && s <= vals[1]);
  }
}

function compute(metric: Metric, xs: number[]): number {
  if (!xs.length) return 0;
  switch (metric) {
    case "count": case "distinct": case "share": return xs.length;
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
/** Răspunsul pe secțiuni, ca să fie afișat schematic (titlu + puncte), nu ca paragraf. */
export interface AnswerSection { title: string; items: string[] }
/** Etichetele tabelului rezumat, ca să spună exact ce s-a calculat („Comenzi livrate”, nu „Comenzi folosite”). */
export interface TableLabels { group: string; result: string; count: string }
/** Comenzile din spatele răspunsului, cu coloanele fișierului, valorile exact ca în fișier. */
export interface AnswerDetail { columns: string[]; rows: string[][]; total: number }
export interface Answer {
  text: string; sections: AnswerSection[]; notes: string[]; rows: AnswerRow[]; planText: string; matched: number;
  table: TableLabels; detail: AnswerDetail;
}

/** Varianta text (pentru loguri, teste și clienți vechi): secțiunile lipite într-un paragraf. */
function flatten(sections: AnswerSection[], notes: string[]): string {
  const parts = sections.map((sec) => sec.items.length ? `${sec.title}: ${sec.items.join(" · ")}.` : `${sec.title}.`);
  return [...parts, ...notes.map((n) => n.endsWith(".") ? n : n + ".")].join(" ");
}

const fmtNum = (n: number, digits = 2) => new Intl.NumberFormat("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const fmtPct = (n: number) => `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(n)}%`;
const METRIC_RO: Record<Metric, string> = { sum: "suma", count: "numărul de comenzi", avg: "media", median: "mediana", min: "minimul", max: "maximul", distinct: "numărul de valori distincte", share: "procentul" };
const STATUS_ORDER = [DELIVERED, "În curs", "Retur", "Anulată"];
const comenzi = (n: number) => `${fmtNum(n, 0)} ${n === 1 ? "comandă" : "comenzi"}`;
const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Sume pe monedă pentru un set de rânduri: „RON 1.234,00 · EUR 56,00” */
function moneyByCurrency(rs: CleanRecord[], field: string, digits: number, curOrder: string[] = []): string {
  const money = field === "valoare" || field === "pret";
  const m = new Map<string, number>();
  for (const r of rs) {
    const x = fieldValue(r, field);
    const c = money ? r.currency : "";
    if (typeof x === "number") m.set(c, (m.get(c) ?? 0) + x);
  }
  const rank = (c: string) => (curOrder.indexOf(c) + 1) || 99;
  return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([c, v]) => `${c ? c + " " : ""}${fmtNum(round2(v), digits)}`).join(" + ");
}

function buildDetail(used: CleanRecord[], header: string[]): AnswerDetail {
  const sorted = [...used].sort((a, b) => a.line - b.line);
  return { columns: ["Rând", ...header], rows: sorted.map((r) => [String(r.line), ...header.map((_, i) => r.raw?.[i] ?? "")]), total: sorted.length };
}

function tableLabels(plan: Plan, fieldLabel: string | null, labels: Record<string, string>): TableLabels {
  const st = plan.filters.find((f) => f.column === "status");
  const stTxt = !st ? "" : st.op === "eq" && st.value === DELIVERED ? "livrate" : Array.isArray(st.value) ? st.value.join(" + ") : String(st.value);
  const count = !st ? "Comenzi" : stTxt === "livrate" ? "Comenzi livrate" : `Comenzi (${stTxt})`;
  const g = plan.groupBy;
  const group = !g ? "" : g === "luna" ? "Lună" : g === "status" ? "Status" : g === "moneda" ? "Monedă" : labels[g] ?? g;
  const f = capitalize(fieldLabel ?? "valoare");
  const suffix = stTxt === "livrate" ? " (doar livrate)" : stTxt ? ` (${stTxt})` : "";
  const result = plan.metric === "count" ? count
    : plan.metric === "sum" ? `${f}${suffix}`
    : plan.metric === "distinct" ? "Comenzi"
    : `${capitalize(METRIC_RO[plan.metric])} ${fieldLabel ?? ""}${suffix}`.trim();
  return { group, result, count };
}

export function execute(plan: Plan, records: CleanRecord[], labels: Record<string, string> = {}, header: string[] = []): Answer {
  const fieldLabel = plan.field ? labels[plan.field] ?? plan.field : null;
  const statusFilter = plan.filters.find((f) => f.column === "status");
  const nonStatus = plan.filters.filter((f) => f.column !== "status");
  const rows = records.filter((r) => plan.filters.every((f) => passes(r, f)));
  const planText = describePlan(plan, labels);
  const digits = plan.field === "cantitate" ? 0 : 2;

  // ---- procent („rata de retur”)
  if (plan.metric === "share") {
    // numărătorul = filtrele de status (sau, fără status, cele pe categorii); numitorul = restul
    // „rata de retur (la X)” → numărătorul e statusul; „ce procent vine de la X” → numărătorul e X (statusul implicit Livrată rămâne în bază)
    const catCols = plan.filters.filter((f) => !["status", "luna", "moneda", "valoare", "cantitate", "pret"].includes(f.column)).map((f) => f.column);
    const deliveredBase = !!statusFilter && (plan.defaultStatus || (statusFilter.value === DELIVERED && catCols.length > 0));
    const numCols = statusFilter && !deliveredBase ? ["status"] : catCols;
    const base = records.filter((r) => plan.filters.filter((f) => !numCols.includes(f.column)).every((f) => passes(r, f)));
    const part = base.filter((r) => plan.filters.filter((f) => numCols.includes(f.column)).every((f) => passes(r, f)));
    const inPart = new Set(part);
    const pct = base.length ? (part.length / base.length) * 100 : 0;
    const items = [`${fmtPct(pct)} din comenzi (${part.length} din ${base.length})`];
    if (plan.field) {
      const sums = new Map<string, [number, number]>();
      for (const r of base) {
        const x = fieldValue(r, plan.field); if (typeof x !== "number") continue;
        const e = sums.get(r.currency) ?? [0, 0]; e[1] += x; if (inPart.has(r)) e[0] += x; sums.set(r.currency, e);
      }
      const parts = [...sums.entries()].filter(([, [, t]]) => t > 0).map(([c, [p, t]]) => {
        return `${fmtPct((p / t) * 100)} din valoare: ${c ? c + " " : ""}${fmtNum(round2(p))} din ${fmtNum(round2(t))}`;
      });
      items.push(...parts);
    }
    const sections = [{ title: "Procent", items }];
    // fără tabel: ar repeta exact cifrele de mai sus
    return { text: flatten(sections, []), sections, notes: [], rows: [], planText, matched: part.length,
      table: tableLabels(plan, fieldLabel, labels), detail: buildDetail(part, header) };
  }

  // ---- valori distincte („câți clienți”)
  if (plan.metric === "distinct" && plan.field) {
    const counts = new Map<string, number>();
    for (const r of rows) { const v = String(fieldValue(r, plan.field) ?? ""); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ro"));
    const sections = [list.length
      ? { title: `${list.length} valori distincte în „${fieldLabel}”`, items: [] as string[] }
      : { title: "Niciun rând nu corespunde filtrelor alese", items: [] as string[] }];
    const notes = list.length ? ["Lista completă, cu numărul de comenzi pentru fiecare, e în tabel."] : [];
    return { text: flatten(sections, notes), sections, notes, rows: list.map(([group, n]) => ({ group, currency: "", value: n, count: n })), planText, matched: rows.length,
      table: { group: fieldLabel ?? "", result: "Comenzi", count: "Comenzi" }, detail: buildDetail(rows, header) };
  }

  const money = plan.field === "valoare" || plan.field === "pret";
  const splitByCurrency = money && plan.groupBy !== "moneda";
  const groups = new Map<string, { xs: number[]; count: number; group: string; currency: string }>();
  // pe luni: și lunile cu comenzi, dar fără niciun rând după filtrul de status, intră cu 0
  // (aceeași regulă ca în dashboard-ul 4)
  if (plan.groupBy === "luna" && (plan.metric === "sum" || plan.metric === "count")) {
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

  const show = (r: AnswerRow) => plan.metric === "count" ? comenzi(r.value)
    : `${r.currency ? r.currency + " " : ""}${fmtNum(r.value, digits)}`;
  const label = (g: string) => plan.groupBy === "luna" && /^\d{4}-\d{2}$/.test(g) ? monthName(g) : g;

  const delivered = statusFilter && statusFilter.op === "eq" && statusFilter.value === DELIVERED;
  const scope = delivered ? ", doar comenzi livrate" : "";

  const sections: AnswerSection[] = [];
  const notes: string[] = [];
  // „— 4 comenzi” după fiecare sumă, ca să fie clar pe câte comenzi s-a calculat
  const item = (r: AnswerRow, name?: string) => {
    const head = name ? `${name}: ` : "";
    return plan.metric === "count" || (!plan.groupBy && (plan.metric === "max" || plan.metric === "min")) ? `${head}${show(r)}` : `${head}${show(r)} — ${comenzi(r.count)}`;
  };
  const metricTitle = !plan.groupBy && plan.metric === "max" ? "cea mai mare comandă" : !plan.groupBy && plan.metric === "min" ? "cea mai mică comandă" : METRIC_RO[plan.metric];
  const title = `${capitalize(metricTitle)}${fieldLabel && plan.metric !== "count" ? ` (${fieldLabel})` : ""}${scope}`;
  if (rows.length === 0) sections.push({ title: "Niciun rând nu corespunde filtrelor alese, deci rezultatul e 0", items: [] });
  else if (!plan.groupBy) {
    sections.push({ title, items: out.map((r) => item(r)) });
    // „cea mai mare comandă”: spunem și care e
    if ((plan.metric === "max" || plan.metric === "min") && plan.field) {
      const who = out.map((o) => {
        const r = rows.find((x) => x.currency === o.currency && fieldValue(x, plan.field!) === o.value);
        if (!r) return "";
        const bits = [r.id, ...Object.values(r.cats).slice(0, 2), r.date ? fmtDate(r.date) : "", r.status ?? ""].filter(Boolean);
        return bits.length ? `${o.currency && out.length > 1 ? o.currency + ": " : ""}${bits.join(", ")}` : "";
      }).filter(Boolean);
      if (who.length) sections.push({ title: "Comanda", items: who });
    }
  } else {
    // o secțiune pe fiecare monedă; lista completă e în tabel
    const byCur = new Map<string, AnswerRow[]>();
    for (const c of curOrder) byCur.set(c, out.filter((r) => r.currency === c));
    const multi = byCur.size > 1;
    const base = title;
    for (const [cur, rs] of byCur) {
      const t = multi && cur ? `${base} — ${cur}` : base;
      const shown = rs.slice(0, plan.limit === 1 ? rs.length : 5).map((r, k) => item(r, `${chrono || plan.limit === 1 ? "" : `${k + 1}. `}${label(r.group)}`));
      if (rs.length > 5 && plan.limit !== 1) shown.push(`…și încă ${rs.length - 5} în tabel`);
      sections.push({ title: t, items: shown });
    }
    if (multi) notes.push("Fiecare monedă e calculată separat, fără conversie");
    // „martie față de februarie”
    if (plan.compare) {
      const diffs: string[] = [];
      for (const [cur, rs] of byCur) {
        if (rs.length !== 2) continue;
        const [a, b] = [...rs].sort((x, y) => x.group.localeCompare(y.group));
        const diff = b.value - a.value;
        const pct = a.value ? ` (${diff >= 0 ? "+" : ""}${fmtPct((diff / a.value) * 100)})` : "";
        const amount = plan.metric === "count" ? `${diff >= 0 ? "+" : ""}${fmtNum(diff, 0)} comenzi` : `${diff >= 0 ? "+" : "−"}${cur ? cur + " " : ""}${fmtNum(Math.abs(diff), digits)}`;
        diffs.push(`${amount}${pct}`);
      }
      if (diffs.length) {
        const ms = [...new Set(out.map((r) => r.group))].sort();
        sections.push({ title: `${capitalize(label(ms[ms.length - 1]))} față de ${label(ms[0])}`, items: diffs });
      }
    }
  }

  // ---- anulate / retururi / în curs, arătate separat (ca utilizatorul să vadă tot)
  // Doar când întrebarea nu a cerut explicit retururi/anulări/în curs.
  const statusAware = records.some((r) => r.status) && (!statusFilter || delivered);
  if (statusAware && (plan.metric === "sum" || plan.metric === "count" || plan.metric === "avg" || plan.metric === "median")) {
    const pool = records.filter((r) => nonStatus.every((f) => passes(r, f)));
    const allCur = [...new Set([...curOrder, ...records.map((r) => r.currency)])];
    const byStatus = new Map<string, CleanRecord[]>();
    for (const r of pool) { const s = r.status ?? "(fără status)"; byStatus.set(s, [...(byStatus.get(s) ?? []), r]); }
    const order = [...byStatus.keys()].sort((a, b) => (STATUS_ORDER.indexOf(a) + 1 || 99) - (STATUS_ORDER.indexOf(b) + 1 || 99));
    const shownStatuses = delivered ? order.filter((s) => s !== DELIVERED) : order;
    const statusItem = (s: string) => {
      const rs = byStatus.get(s)!;
      const amount = plan.metric !== "count" && plan.field ? moneyByCurrency(rs, plan.field, digits, allCur) : "";
      return amount ? `${s}: ${amount} — ${comenzi(rs.length)}` : `${s}: ${comenzi(rs.length)}`;
    };
    if (shownStatuses.length && (delivered || order.length > 1) && plan.groupBy !== "status") {
      const head = delivered ? (plan.groupBy ? "Nelivrate, separat (aceleași filtre, toate grupele)" : "Nelivrate, separat") : "Pe status";
      sections.push({ title: head, items: shownStatuses.map(statusItem) });
    }
  }

  // ---- lună incompletă
  const lastDate = records.reduce<string | null>((m, r) => r.date && (!m || r.date > m) ? r.date : m, null);
  if (lastDate) {
    const lastMonth = lastDate.slice(0, 7);
    const [y, mo] = lastMonth.split("-").map(Number);
    const endDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const touched = plan.filters.some((f) => f.column === "luna" && (Array.isArray(f.value) ? f.value.includes(lastMonth) : f.value === lastMonth))
      || (plan.groupBy === "luna" && out.some((r) => r.group === lastMonth));
    if (touched && Number(lastDate.slice(8, 10)) < endDay) notes.push(`Atenție: ${monthName(lastMonth)} e lună incompletă — datele se opresc la ${fmtDate(lastDate)}.`);
  }

  if (plan.notes?.length) notes.push(`Am înțeles: ${plan.notes.join("; ")}`);
  // comenzile din spatele grupelor afișate (la „top 3 clienți”: doar ale celor 3; la „cea mai mare comandă”: doar ea)
  let used: CleanRecord[];
  if ((plan.metric === "max" || plan.metric === "min") && !plan.groupBy && plan.field) {
    used = rows.filter((r) => out.some((o) => o.currency === r.currency && fieldValue(r, plan.field!) === o.value));
  } else if (plan.groupBy) {
    const keep = new Set(out.map((o) => `${o.group}\u0000${o.currency}`));
    used = rows.filter((r) => keep.has(`${String(fieldValue(r, plan.groupBy!) ?? "(necompletat)")}\u0000${splitByCurrency ? r.currency : ""}`));
  } else used = rows;
  return { text: flatten(sections, notes), sections, notes, rows: out.map((r) => ({ ...r, group: label(r.group) })), planText, matched: rows.length,
    table: tableLabels(plan, fieldLabel, labels), detail: buildDetail(used, header) };
}

export function describePlan(p: Plan, labels: Record<string, string> = {}): string {
  const f = p.field ? labels[p.field] ?? p.field : null;
  const parts = [`${METRIC_RO[p.metric]}${f && p.metric !== "count" ? ` pe „${f}”` : ""}`];
  const opTxt: Record<Op, string> = { eq: "=", in: "=", neq: "≠", contains: "conține", gt: ">", gte: "≥", lt: "<", lte: "≤", between: "între" };
  if (p.filters.length) parts.push("unde " + p.filters.map((f) => {
    const fmt = (v: string | number) => f.column === "luna" ? monthName(String(v)) : typeof v === "number" ? fmtNum(v, Number.isInteger(v) ? 0 : 2) : String(v);
    const v = Array.isArray(f.value) ? f.value.map(fmt).join(" sau ") : fmt(f.value);
    const lbl = labels[f.column] ?? f.column;
    return `${lbl} ${opTxt[f.op]} ${v}${f.column === "status" && p.defaultStatus ? " (implicit)" : ""}`;
  }).join(", "));
  if (p.groupBy) parts.push(`grupat pe ${p.groupBy}`);
  if (p.groupBy) parts.push(`${p.sort === "asc" ? "crescător" : "descrescător"}, ${p.limit >= 1000 ? "toate" : `primele ${p.limit}`}`);
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
  const header = [...analysis.columns].sort((a, b) => a.index - b.index).map((c) => c.name);
  if (planner) {
    try {
      const raw = await planner(plannerPrompt(schema), question);
      const v = validatePlan(raw, schema);
      if (v.plan) {
        const plan = guardPlan(v.plan, question, schema);
        return { answer: execute(plan, records, labels, header), plan, source: "model" };
      }
      if (v.error && (raw as Plan)?.answerable === false) {
        // modelul zice „nu se poate”; dacă regulile înțeleg totuși întrebarea, răspundem cu ele
        const alt = validatePlan(rulePlan(question, schema), schema);
        if (alt.plan) return { answer: execute(alt.plan, records, labels, header), plan: alt.plan, source: "reguli" };
        return { source: "model", error: v.error };
      }
    } catch (_e) { /* cade pe reguli */ }
  }
  const fallback = validatePlan(rulePlan(question, schema), schema);
  if (!fallback.plan) return { source: "reguli", error: fallback.error };
  return { answer: execute(fallback.plan, records, labels, header), plan: fallback.plan, source: "reguli" };
}
