// Teste pentru partea care calculează. Rulare: deno test --allow-read tests/
// Valorile de referință au fost calculate independent cu pluginul data
// (docs/explore-vanzari_2026.md, docs/validate-vanzari_enterprise_b2b_2026.md).

import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { analyze, AnalysisError } from "../backend/core/analyze.ts";
import { answerQuestion } from "../backend/core/ask.ts";
import { parseNumber, parseDate, normalizeStatus, looksNumeric } from "../backend/core/normalize.ts";

const load = (f: string) => Deno.readTextFile(new URL(`../public/examples/${f}`, import.meta.url));
const byCur = <T extends { currency: string }>(xs: T[], c: string) => xs.find((x) => x.currency === c)!;

Deno.test("vanzari_2026: curățare și cifre de referință", async () => {
  const { analysis: a } = analyze(await load("vanzari_2026.csv"), "vanzari_2026.csv");
  const r = a.report, d = a.dashboards;
  assertEquals(a.meta.headerLine, 5);
  assertEquals([r.empty, r.totals, r.duplicates, r.kept], [3, 7, 6, 129]);
  assertEquals([d.summary.customers, d.summary.products], [14, 8]);
  assertEquals(byCur(d.delivered.byCurrency, "RON").total, 265882.81);
  assertEquals(byCur(d.delivered.byCurrency, "EUR").total, 29475.32);
  assertEquals(byCur(d.lost.byCurrency, "RON").lost, 69131.3);
  assertEquals(byCur(d.lost.byCurrency, "EUR").lost, 8745.9);
  assertEquals(byCur(d.summary.currencies, "RON").median, 2343.61);
  const ron = byCur(d.months.byCurrency, "RON");
  assertEquals([ron.best, ron.worst], [["2026-06"], ["2026-05"]]);
  assertEquals(d.months.incompleteMonth, "2026-08");
});

Deno.test("enterprise_b2b: ID dublu cu conținut diferit e păstrat și semnalat", async () => {
  const { analysis: a } = analyze(await load("vanzari_enterprise_b2b_2026.csv"), "b2b.csv");
  const d = a.dashboards;
  assertEquals(a.report.kept, 69);
  assert(a.report.conflicts.some((c) => c.id === "CMD-400003"));
  assertEquals(byCur(d.delivered.byCurrency, "RON").total, 95268.05);
  assertEquals(byCur(d.delivered.byCurrency, "EUR").total, 6550.59);
  assertEquals(byCur(d.lost.byCurrency, "RON").lost, 225081.41);
  assertEquals(byCur(d.lost.byCurrency, "EUR").lost, 24458.2);
  assertEquals(d.health.pending, { RON: 160943.09, EUR: 9525.84 });
  // lunile cu comenzi, dar fără livrări, intră cu 0 și pot fi „cea mai slabă”
  assertEquals(byCur(d.months.byCurrency, "RON").worst, ["2026-01", "2026-02"]);
  assertEquals(byCur(d.months.byCurrency, "RON").best, ["2026-08"]);
  assertEquals(byCur(d.months.byCurrency, "EUR").best, ["2026-04"]);
  assertEquals(d.top.customers!.RON.slice(0, 3).map((x) => [x.name, x.value]), [
    ["Global Spedition SRL", 22757.45], ["Sirius Retail Group", 21797.05], ["Oltenia Power SA", 15418.08],
  ]);
});

Deno.test("toate cele 4 exemple se încarcă fără erori", async () => {
  for (const f of ["vanzari_2026.csv", "vanzari_distributie_2026.csv", "vanzari_enterprise_b2b_2026.csv", "vanzari_servicii_cloud_2026.csv"]) {
    const { analysis: a } = analyze(await load(f), f);
    assert(a.report.kept > 0, f);
    assert(a.dashboards.delivered.available, f);
  }
});

Deno.test("CSV sintetic: ; ca separator, numere englezești, fără status, coloane în altă ordine", () => {
  const csv = [
    "Export generat automat;;;",
    "",
    "amount;customer;order date;region",
    "1,250.50;Alpha Ltd;2026-03-02;North",
    "300;alpha ltd;2026-03-15;North",
    ";;;",
    "$ 99.99;Beta Inc;2026-04-01;South",
    "TOTAL;;;1650.49",
  ].join("\n");
  const { analysis: a } = analyze(csv, "sintetic.csv");
  assertEquals(a.meta.delimiter, ";");
  assertEquals(a.report.kept, 3);
  assertEquals(a.report.empty, 1);
  assertEquals(a.report.totals, 1);
  // fără coloană de status: nu inventăm „venit pierdut”
  assertEquals(a.dashboards.lost.available, false);
  assertEquals(a.dashboards.health.available, false);
  // „alpha ltd” e unificat cu „Alpha Ltd”
  assertEquals(a.dashboards.summary.customers, 2);
});

Deno.test("fișiere care nu se pot analiza dau eroare clară, nu crash", () => {
  for (const bad of ["", "   \n\n", "doar un cuvânt"]) {
    let err: unknown = null;
    try { analyze(bad, "x.csv"); } catch (e) { err = e; }
    assert(err instanceof AnalysisError, JSON.stringify(bad));
  }
});

Deno.test("normalizare: numere, date, statusuri", () => {
  assertEquals(parseNumber("1.841,86", ",")?.value, 1841.86);
  assertEquals(parseNumber("1,841.86", ".")?.value, 1841.86);
  assertEquals(parseNumber("RON 2.500", ",")?.value, 2500);
  assertEquals(looksNumeric("CMD-100043"), false);
  assertEquals(parseDate("09.01.2026", "dmy"), "2026-01-09");
  assertEquals(normalizeStatus("livrat"), "Livrată");
  assertEquals(normalizeStatus("ANULAT"), "Anulată");
  assertEquals(normalizeStatus("returnat"), "Retur");
  assertEquals(normalizeStatus("in curs"), "În curs");
});

Deno.test("întrebări: codul calculează, planul fără model (reguli)", async () => {
  const { analysis, records } = analyze(await load("vanzari_enterprise_b2b_2026.csv"), "b2b.csv");
  const total = await answerQuestion("Care este venitul livrat total?", analysis, records);
  assertEquals(total.answer!.rows.map((r) => r.value).sort((x, y) => x - y), [6550.59, 95268.05]);
  const anul = await answerQuestion("Câte comenzi au fost anulate?", analysis, records);
  assertEquals(anul.answer!.rows[0].value, 12);
  const off = await answerQuestion("Ce vreme e mâine?", analysis, records);
  assert(!off.answer && off.error);
});

Deno.test("un plan invalid venit de la model e respins, nu executat", async () => {
  const { analysis, records } = analyze(await load("vanzari_2026.csv"), "v.csv");
  const evil = async () => ({ answerable: true, metric: "sum", field: "DROP TABLE", filters: [{ column: "nu-exista", op: "eq", value: "x" }] });
  const res = await answerQuestion("Care e venitul livrat total?", analysis, records, evil);
  // fie cade pe reguli, fie refuză; niciodată nu calculează pe o coloană inventată
  assert(res.source === "reguli" || !!res.error);
});

Deno.test("plasa de siguranță corectează planurile greșite văzute live la model", async () => {
  const { analysis, records } = analyze(await load("vanzari_enterprise_b2b_2026.csv"), "b2b.csv");
  // 1) modelul a dat toate lunile, fără status, pentru „cea mai slabă lună”
  const badMonth = async () => ({ answerable: true, metric: "sum", field: "valoare", filters: [], groupBy: "luna", sort: "asc", limit: 10 });
  const m = await answerQuestion("Care a fost cea mai slabă lună?", analysis, records, badMonth);
  assertEquals(m.source, "model");
  assertEquals(m.answer!.rows.filter((r) => r.currency === "RON").map((r) => [r.group, r.value]), [["ianuarie 2026", 0], ["februarie 2026", 0]]);
  // 2) modelul a pus și Anulată la „retururi”
  const badRetur = async () => ({ answerable: true, metric: "sum", field: "valoare", filters: [{ column: "status", op: "in", value: ["Retur", "Anulată"] }], groupBy: null, sort: "desc", limit: 10 });
  const r = await answerQuestion("Cât am pierdut în total din retururi?", analysis, records, badRetur);
  const ron = r.answer!.rows.find((x) => x.currency === "RON")!.value;
  const lostRon = analysis.dashboards.lost.byCurrency.find((x) => x.currency === "RON")!;
  assertEquals(ron, lostRon.retur);
});

Deno.test("CSV care nu e de vânzări: coloana numerică se poate folosi cu numele ei real", async () => {
  const csv = "Nume,Clasa,Materie,Nota,Data\nIon Popescu,9A,Matematica,8,12.02.2026\nAna Ionescu,9A,Matematica,10,12.02.2026\nIon Popescu,9A,Romana,7,15.02.2026\nana ionescu,9A,Romana,9,15.02.2026\n,,,,\nMihai Radu,9B,Matematica,6,20.03.2026\n";
  const { analysis, records } = analyze(csv, "note.csv");
  // modelul folosește numele din fișier („Nota”), nu numele intern
  const byRealName = async () => ({ answerable: true, metric: "avg", field: "Nota", filters: [{ column: "Materie", op: "eq", value: "Matematica" }], groupBy: null, sort: "desc", limit: 10 });
  const a = await answerQuestion("Care e media notelor la matematica?", analysis, records, byRealName);
  assertEquals(a.source, "model");
  assertEquals(a.answer!.rows[0].value, 8);
  // modelul refuză, dar regulile înțeleg întrebarea
  const refuses = async () => ({ answerable: false, reason: "nu există coloana nota" });
  const b = await answerQuestion("Care elev are cea mai mare medie?", analysis, records, refuses);
  assertEquals(b.source, "reguli");
  assertEquals(b.answer!.rows.map((r) => [r.group, r.value]), [["Ana Ionescu", 9.5]]);
});
