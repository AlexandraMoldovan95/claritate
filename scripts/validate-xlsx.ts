// Test manual: verifică că un .xlsx REAL (nu CSV redenumit) e citit corect —
// foaie aleasă automat dintre mai multe, date native Excel (nu text), ordine
// de coloane diferită de template-ul demo, curățare (duplicat/gol/total).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze } from "../backend/core/analyze.ts";
import { read as readWorkbook, utils as xlsxUtils } from "xlsx";
import { AnalysisError } from "../backend/core/analyze.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/comenzi_test.xlsx", import.meta.url));

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

// reimplementăm aici exact logica din backend/app.ts (spreadsheetToCsv),
// ca să nu importăm Hono/rutele doar pentru acest test
function spreadsheetToCsv(bytes: Uint8Array): string {
  let wb;
  try {
    wb = readWorkbook(Buffer.from(bytes), { type: "buffer", cellDates: true });
  } catch {
    throw new AnalysisError("Nu am putut citi acest fișier Excel.");
  }
  const sheetName =
    wb.SheetNames.find((name: string) => {
      const rows = xlsxUtils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }) as unknown[][];
      return rows.length >= 2;
    }) ?? wb.SheetNames[0];
  console.log("Foaie aleasă automat:", sheetName, "(din", wb.SheetNames.join(", ") + ")");
  return xlsxUtils.sheet_to_csv(wb.Sheets[sheetName]);
}

const bytes = readFileSync(FIXTURE);
const csv = spreadsheetToCsv(new Uint8Array(bytes));
console.log("\n--- CSV generat din .xlsx ---");
console.log(csv);
console.log("--- sfârșit CSV ---\n");

const { analysis } = analyze(csv, "comenzi_test.xlsx");
assert(analysis.meta.columns === 7, `7 coloane (got ${analysis.meta.columns})`);
assert(analysis.report.kept === 5, `5 comenzi reale păstrate, din 5+1 duplicat+1 gol+1 total (got ${analysis.report.kept})`);
assert(analysis.report.empty === 1, `1 rând gol eliminat (got ${analysis.report.empty})`);
assert(analysis.report.totals === 1, `1 rând total eliminat (got ${analysis.report.totals})`);
assert(analysis.report.duplicates === 1, `1 duplicat eliminat (got ${analysis.report.duplicates})`);
assert(analysis.meta.hasDate, "dată detectată (celule native Excel, nu text)");
assert(analysis.meta.hasStatus, "status detectat");
assert(analysis.meta.customerColumn === "Client", `coloana client = "Client" (got ${analysis.meta.customerColumn})`);
assert(
  analysis.meta.currencies.includes("RON") && analysis.meta.currencies.includes("EUR") && analysis.meta.currencies.includes("USD"),
  `3 monede detectate (got ${analysis.meta.currencies.join(",")})`
);
const dateSample = analysis.preview.find((r) => r.linia === analysis.columns[0] ? true : true);
console.log("Exemplu rând curățat:", JSON.stringify(analysis.preview[0]));
assert(/^\d{4}-\d{2}-\d{2}$/.test(String(analysis.preview[0].data)), `data convertită corect în YYYY-MM-DD (got ${analysis.preview[0].data})`);

console.log("\nToate verificările pentru .xlsx real au trecut.");
