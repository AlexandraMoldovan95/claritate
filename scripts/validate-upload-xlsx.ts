// Test manual: verifică că /api/upload (ruta HTTP reală, cu multipart/form-data)
// detectează și citește corect un fișier .xlsx trimis ca upload, exact cum ar
// veni dintr-un <input type="file"> din browser.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../backend/app.ts";
import { memoryStore } from "../backend/db.ts";

const FIXTURE = fileURLToPath(new URL("./fixtures/comenzi_test.xlsx", import.meta.url));

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const app = createApp({
  store: memoryStore(),
  readStatic: async () => null,
});

const bytes = readFileSync(FIXTURE);
const file = new File([bytes], "comenzi_test.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const form = new FormData();
form.append("file", file);

const res = await app.request("/api/upload", { method: "POST", body: form });
assert(res.status === 200, `upload .xlsx prin multipart => 200 (got ${res.status})`);
const body = await res.json();
assert(typeof body.id === "string", "upload a întors un id");
assert(body.analysis.meta.columns === 7, `7 coloane detectate din .xlsx (got ${body.analysis.meta.columns})`);
assert(body.analysis.report.kept === 5, `5 rânduri păstrate după curățare (got ${body.analysis.report.kept})`);
assert(body.analysis.meta.hasDate, "dată detectată din .xlsx prin ruta HTTP reală");

// și un fișier .xlsx "redenumit" fără extensia corectă în nume, dar cu octeții reali
// de Excel — trebuie detectat tot prin semnătura ZIP, nu doar prin extensie.
const file2 = new File([bytes], "export_fara_extensie", { type: "application/octet-stream" });
const form2 = new FormData();
form2.append("file", file2);
const res2 = await app.request("/api/upload", { method: "POST", body: form2 });
assert(res2.status === 200, `upload .xlsx fără extensie corectă în nume => tot detectat (got ${res2.status})`);
const body2 = await res2.json();
assert(body2.analysis.meta.columns === 7, `detectat prin semnătura ZIP, nu prin extensie (got ${body2.analysis.meta.columns} coloane)`);

console.log("\nToate verificările pentru /api/upload cu .xlsx au trecut.");
