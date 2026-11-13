// Test manual: verifică faptul că analyze() NU depinde de un template fix —
// citește corect CSV-uri cu coloane în altă ordine, alte denumiri (chiar în
// engleză), mai puține sau mai multe coloane decât fișierele demo (care au
// mereu Nr comanda,Data,Client,Produs,Cantitate,Pret unitar,Valuta,Status).
import { analyze } from "../backend/core/analyze.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

// 1) Ordine diferită de coloane, denumiri în engleză, O SINGURĂ coloană "amount"
//    (fără cantitate/pret unitar separat), plus o coloană irelevantă (Notes).
const csv1 = [
  "Order Date,Order Status,Region,Customer Name,Notes,Total Amount,Currency,Order ID",
  "01/15/2026,Shipped,West,Acme Corp,fragile,1200.50,USD,ORD-001",
  "01/16/2026,Returned,East,Beta LLC,,340.00,USD,ORD-002",
  "01/17/2026,Shipped,West,Acme Corp,,998.25,EUR,ORD-003",
  "01/18/2026,Pending,North,Gamma Inc,urgent,45.00,USD,ORD-004",
  "01/19/2026,Shipped,East,Beta LLC,,120.00,USD,ORD-005",
  "01/20/2026,Cancelled,South,Delta Co,,76.10,EUR,ORD-006",
].join("\n");

const r1 = analyze(csv1, "comenzi_engleza.csv");
assert(r1.analysis.meta.columns === 8, `csv1: 8 coloane detectate (got ${r1.analysis.meta.columns})`);
assert(r1.analysis.report.kept === 6, `csv1: toate cele 6 rânduri păstrate (got ${r1.analysis.report.kept})`);
assert(r1.analysis.meta.hasDate, "csv1: dată detectată (format american MM/DD/YYYY)");
assert(r1.analysis.meta.customerColumn === "Customer Name", `csv1: coloana client = "Customer Name" (got ${r1.analysis.meta.customerColumn})`);
assert(r1.analysis.meta.currencies.includes("USD") && r1.analysis.meta.currencies.includes("EUR"), "csv1: USD+EUR detectate");
const amountCol1 = r1.analysis.columns.find((c) => c.name === "Total Amount");
assert(amountCol1?.role === "amount", `csv1: "Total Amount" => rol amount (got ${amountCol1?.role})`);
const notesCol = r1.analysis.columns.find((c) => c.name === "Notes");
assert(notesCol?.role === "category" || notesCol?.role === "text" || notesCol?.role === "ignore", `csv1: "Notes" nu stricăge nimic (rol: ${notesCol?.role})`);

// 2) Foarte puține coloane: doar ID, Dată, Sumă — fără client/produs/status/monedă.
const csv2 = [
  "Cod,Zi,Suma",
  "A1,05.03.2026,150.00",
  "A2,06.03.2026,220.50",
  "A3,07.03.2026,99.99",
  "A4,08.03.2026,310.00",
].join("\n");
const r2 = analyze(csv2, "minimal.csv");
assert(r2.analysis.meta.columns === 3, `csv2: 3 coloane (got ${r2.analysis.meta.columns})`);
assert(r2.analysis.report.kept === 4, `csv2: 4 rânduri păstrate (got ${r2.analysis.report.kept})`);
assert(!r2.analysis.meta.hasStatus, "csv2: fără status (coloană inexistentă)");
assert(r2.analysis.meta.hasDate, "csv2: dată detectată din 'Zi'");
assert(r2.analysis.meta.customerColumn === null, "csv2: fără coloană client (nicio categorie)");
const sumaCol = r2.analysis.columns.find((c) => c.name === "Suma");
assert(sumaCol?.role === "amount", `csv2: "Suma" => amount (got ${sumaCol?.role})`);
assert(r2.analysis.dashboards.summary.currencies.length >= 0, "csv2: nu crapă fără coloană monedă (currencies poate fi gol)");

// 3) Multe coloane extra, ordine complet diferită, cantitate+pret (nu suma direct),
//    2 coloane de categorie (client + produs), coloane irelevante multiple.
const csv3 = [
  "Produs,Observatii interne,Cod intern,Client,Angajat responsabil,Cantitate,Pret unitar,Data comenzii,Valuta,Status comanda,Linie libera",
  "Scaun birou,,SKU-99,Firma Alpha,Ion Pop,2,450,12.02.2026,RON,Livrata,",
  "Masa birou,verificat,SKU-12,Firma Beta,Maria Ionescu,1,1200,13.02.2026,RON,Livrata,",
  "Scaun birou,,SKU-99,Firma Alpha,Ion Pop,3,450,14.02.2026,RON,Retur,",
  "Lampa birou,,SKU-55,Firma Gamma,Ion Pop,5,80,15.02.2026,EUR,In curs,",
].join("\n");
const r3 = analyze(csv3, "extra_coloane.csv");
assert(r3.analysis.meta.columns === 11, `csv3: 11 coloane (got ${r3.analysis.meta.columns})`);
assert(r3.analysis.report.kept === 4, `csv3: 4 rânduri păstrate (got ${r3.analysis.report.kept})`);
assert(r3.analysis.meta.hasStatus, "csv3: status detectat din 'Status comanda'");
assert(r3.analysis.meta.hasDate, "csv3: dată detectată din 'Data comenzii'");
assert(r3.analysis.meta.customerColumn !== null && r3.analysis.meta.productColumn !== null,
  `csv3: client+produs ambele detectate (client=${r3.analysis.meta.customerColumn}, produs=${r3.analysis.meta.productColumn})`);
assert(r3.analysis.meta.valueFormula.includes("×"), `csv3: valoare = cantitate × pret (got ${r3.analysis.meta.valueFormula})`);

console.log("\nToate verificările de formă-liberă au trecut: aplicația NU depinde de un template fix.");
