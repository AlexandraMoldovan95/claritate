// Rutele aplicației. Nu depinde de Val Town: primește din afară stocarea,
// planificatorul (modelul) și cititorul de fișiere statice. main.ts le leagă de
// Val Town (SQLite + std/openai), dev.ts de variante locale pentru teste.

import { Hono } from "hono";
import { read as readWorkbook, SSF, utils as xlsxUtils } from "xlsx";
import { analyze, AnalysisError, MAX_BYTES } from "./core/analyze.js";
import { answerQuestion, schemaFor, validatePlan } from "./core/ask.js";
import { ROLE_LABELS, type Role } from "./core/detect.js";
import { buildPivot, defaultPivotSpec, MEASURES, pivotCsv, pivotDimensions, type Measure } from "./core/pivot.js";
import { buildDashboards } from "./core/aggregate.js";
import { answerCompare, compare, type Side } from "./core/compare.js";
import { OG_IMAGE } from "./og_image.js";

export interface StoredUpload { id: string; filename: string; raw: string; overrides: Record<string, Role> }

export interface Store {
  save(filename: string, raw: string): Promise<string>;
  get(id: string): Promise<StoredUpload | null>;
  setOverrides(id: string, overrides: Record<string, Role>): Promise<void>;
}

/** Câte comenzi din spatele unui răspuns trimitem în pagină (restul: descărcare CSV). */
export const DETAIL_ROWS = 100;

export type Planner = (system: string, question: string) => Promise<unknown>;

export interface Deps {
  store: Store;
  planner?: Planner;
  readStatic: (path: string) => Promise<{ body: string; type: string } | null>;
}

export const EXAMPLES = [
  { file: "vanzari_2026.csv", label: "Vânzări 2026" },
  { file: "vanzari_2025.csv", label: "Vânzări 2025" },
  { file: "vanzari_distributie_2026.csv", label: "Distribuție" },
  { file: "vanzari_enterprise_b2b_2026.csv", label: "Enterprise B2B" },
  { file: "vanzari_servicii_cloud_2026.csv", label: "Servicii cloud" },
];

const ID_RE = /^[a-z0-9]{6,16}$/;

export function createApp(deps: Deps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AnalysisError) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: "A apărut o eroare neașteptată. Încearcă din nou sau cu alt fișier." }, 500);
  });

  const page = async () => {
    const f = await deps.readStatic("/frontend/index.html");
    return f
      ? new Response(f.body, { headers: { "content-type": "text/html; charset=utf-8" } })
      : new Response("index.html lipsește", { status: 500 });
  };
  app.get("/", page);
  app.get("/d/:id", page);

  app.get("/frontend/:file", async (c) => {
    const name = c.req.param("file");
    if (!/^[\w.-]+\.(js|css|svg|png|ico|webmanifest)$/.test(name)) return c.notFound();
    const f = await deps.readStatic(`/frontend/${name}`);
    if (!f) return c.notFound();
    return new Response(f.body, { headers: { "content-type": f.type, "cache-control": "public, max-age=300" } });
  });

  // imaginea de previzualizare pentru Facebook, X, LinkedIn, WhatsApp, Discord
  app.get("/og.jpg", () => new Response(OG_IMAGE.buffer as ArrayBuffer, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" },
  }));

  app.get("/api/examples", (c) => c.json({ examples: EXAMPLES }));
  app.get("/examples/:file", async (c) => {
    const ex = EXAMPLES.find((e) => e.file === c.req.param("file"));
    if (!ex) return c.notFound();
    const f = await deps.readStatic(`/examples/${ex.file}`);
    if (!f) return c.notFound();
    return new Response(f.body, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${ex.file}"` },
    });
  });

  app.get("/api/roles", (c) => c.json({ roles: ROLE_LABELS }));

  // Upload: multipart (fișier) sau JSON { filename, text } / { example }
  app.post("/api/upload", async (c) => {
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BYTES + 64 * 1024) return c.json({ error: "Fișierul e prea mare (maxim 5 MB)." }, 413);
    let filename = "fisier.csv", text = "";
    const ctype = c.req.header("content-type") ?? "";
    if (ctype.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return c.json({ error: "Nu am primit niciun fișier." }, 400);
      if (file.size > MAX_BYTES) return c.json({ error: "Fișierul e prea mare (maxim 5 MB)." }, 413);
      filename = file.name || filename;
      const bytes = new Uint8Array(await file.arrayBuffer());
      text = looksLikeSpreadsheet(filename, bytes) ? spreadsheetToCsv(bytes) : await decodeText(bytes);
    } else {
      const body = await c.req.json().catch(() => ({})) as { filename?: string; text?: string; example?: string };
      if (body.example) {
        const ex = EXAMPLES.find((e) => e.file === body.example);
        const f = ex && await deps.readStatic(`/examples/${ex.file}`);
        if (!ex || !f) return c.json({ error: "Exemplul nu există." }, 404);
        filename = ex.file; text = f.body;
      } else {
        filename = String(body.filename ?? filename).slice(0, 200);
        text = String(body.text ?? "");
      }
    }
    const { analysis } = analyze(text, filename);        // aruncă AnalysisError pe fișiere proaste
    const id = await deps.store.save(filename, text);
    return c.json({ id, analysis });
  });

  const load = async (id: string) => {
    if (!ID_RE.test(id)) return null;
    return await deps.store.get(id);
  };

  // Notă: rutele erau "/api/d/:id" (apoi "/api/view/:id", "/api/view/:id/roles",
  // "/api/view/:id/ask") dar pe Vercel orice rută din /api/... cu 2+ segmente
  // primea 404 direct de la platformă, înainte să ajungă la funcție — indiferent
  // de runtime (Edge/Node), de numele exact al rutei, sau de rescrierile din
  // vercel.json (cauza exactă a rămas neclară după o investigație extinsă).
  // Rutele cu UN singur segment sub /api/... au mers tot timpul fără probleme,
  // deci am rescris id-ul ca query param în loc de segment de path, ca să evităm
  // complet problema: "/api/view?id=...", "/api/set-roles?id=...", "/api/ask?id=...".
  app.get("/api/view", async (c) => {
    const up = await load(c.req.query("id") ?? "");
    if (!up) return c.json({ error: "Nu am găsit acest dashboard. Poate linkul e greșit." }, 404);
    const { analysis } = analyze(up.raw, up.filename, up.overrides);
    return c.json({ id: up.id, analysis });
  });

  // Tabel pivot. Fără parametri → pivotul implicit (Client × Lună, valoare livrată).
  // ?format=csv → același pivot ca fișier CSV.
  app.get("/api/pivot", async (c) => {
    const up = await load(c.req.query("id") ?? "");
    if (!up) return c.json({ error: "Nu am găsit acest dashboard." }, 404);
    const { analysis, records } = analyze(up.raw, up.filename, up.overrides);
    const def = defaultPivotSpec(analysis);
    const q = (k: string) => c.req.query(k);
    const month = q("month") || undefined;
    if (month && !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "Luna trebuie să fie de forma AAAA-LL." }, 400);
    const spec = {
      rows: q("rows") || def.rows,
      cols: q("cols") === "" || q("cols") === "none" ? null : q("cols") || def.cols,
      measure: (q("measure") || def.measure) as Measure,
      currency: q("currency") ?? undefined,
      month,
    };
    const res = buildPivot(analysis, records, spec);
    if (!res.pivot) return c.json({ error: res.error }, 400);
    if (q("format") === "csv") {
      return c.body(pivotCsv(res.pivot), 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="pivot.csv"' });
    }
    return c.json({ pivot: res.pivot, dimensions: pivotDimensions(analysis), measures: MEASURES, default: def });
  });

  // Raportul de trimis: dashboard-urile pe tot fișierul sau pe o singură lună (?month=AAAA-LL).
  app.get("/api/report", async (c) => {
    const up = await load(c.req.query("id") ?? "");
    if (!up) return c.json({ error: "Nu am găsit acest dashboard." }, 404);
    const { analysis, records } = analyze(up.raw, up.filename, up.overrides);
    const month = c.req.query("month") || null;
    const months = [...new Set(records.map((r) => r.month).filter(Boolean) as string[])].sort();
    if (month && !months.includes(month)) return c.json({ error: "Nu există comenzi în luna aleasă." }, 400);
    const subset = month ? records.filter((r) => r.month === month) : records;
    const dashboards = month
      ? buildDashboards(subset, {
          hasStatus: analysis.meta.hasStatus, hasDate: analysis.meta.hasDate,
          customer: analysis.meta.customerColumn ?? undefined, product: analysis.meta.productColumn ?? undefined,
        })
      : analysis.dashboards;
    return c.json({ month, months, meta: analysis.meta, report: analysis.report, dashboards, orders: subset.length });
  });

  // Comparație între două fișiere (două perioade sau două sedii): /api/compare?a=ID&b=ID
  const loadSide = async (id: string): Promise<Side | null> => {
    const up = await load(id);
    if (!up) return null;
    const { analysis, records } = analyze(up.raw, up.filename, up.overrides);
    return { id: up.id, filename: up.filename, analysis, records };
  };
  app.get("/api/compare", async (c) => {
    const [a, b] = await Promise.all([loadSide(c.req.query("a") ?? ""), loadSide(c.req.query("b") ?? "")]);
    if (!a || !b) return c.json({ error: "Nu am găsit unul dintre cele două fișiere." }, 404);
    if (a.id === b.id) return c.json({ error: "Alege un fișier diferit pentru comparație." }, 400);
    return c.json({ a: a.id, b: b.id, compare: compare(a, b, c.req.query("currency") ?? undefined) });
  });
  app.post("/api/compare-ask", async (c) => {
    const [a, b] = await Promise.all([loadSide(c.req.query("a") ?? ""), loadSide(c.req.query("b") ?? "")]);
    if (!a || !b) return c.json({ error: "Nu am găsit unul dintre cele două fișiere." }, 404);
    const body = await c.req.json().catch(() => ({})) as { question?: string };
    const question = String(body.question ?? "").trim().slice(0, 300);
    if (question.length < 3) return c.json({ error: "Scrie o întrebare." }, 400);
    const res = answerCompare(question, a, b);
    // „Descarcă (CSV)”: comenzile folosite dintr-un fișier (side=0 sau 1)
    if (c.req.query("format") === "csv") {
      const d = res.answer?.details[Number(c.req.query("side") ?? 0)]?.detail;
      if (!d) return c.json({ error: res.error ?? "Nu am ce descărca." }, 400);
      const esc = (v: string) => /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const csv = "\uFEFF" + [d.columns, ...d.rows].map((r) => r.map(esc).join(";")).join("\r\n");
      return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="comenzi-folosite.csv"' });
    }
    if (res.answer) res.answer.details = res.answer.details.map((x) => ({ ...x, detail: { ...x.detail, rows: x.detail.rows.slice(0, DETAIL_ROWS) } }));
    return c.json(res);
  });

  app.post("/api/set-roles", async (c) => {
    const up = await load(c.req.query("id") ?? "");
    if (!up) return c.json({ error: "Nu am găsit acest dashboard." }, 404);
    const body = await c.req.json().catch(() => ({})) as { overrides?: Record<string, string> };
    const overrides: Record<string, Role> = {};
    for (const [k, v] of Object.entries(body.overrides ?? {})) {
      if (/^\d{1,3}$/.test(k) && v in ROLE_LABELS) overrides[k] = v as Role;
    }
    await deps.store.setOverrides(up.id, overrides);
    const { analysis } = analyze(up.raw, up.filename, overrides);
    return c.json({ id: up.id, analysis });
  });

  app.post("/api/ask", async (c) => {
    const up = await load(c.req.query("id") ?? "");
    if (!up) return c.json({ error: "Nu am găsit acest dashboard." }, 404);
    const body = await c.req.json().catch(() => ({})) as { question?: string };
    const question = String(body.question ?? "").trim().slice(0, 300);
    if (question.length < 3) return c.json({ error: "Scrie o întrebare." }, 400);
    const { analysis, records } = analyze(up.raw, up.filename, up.overrides);
    // Păstrăm planul brut al modelului ca să vedem în loguri când plasa de siguranță (guardPlan) l-a corectat.
    let modelRaw: unknown;
    const planner: Planner | undefined = deps.planner && (async (s, q) => (modelRaw = await deps.planner!(s, q)));
    const res = await answerQuestion(question, analysis, records, planner);
    if (res.source === "model" && res.plan) {
      const modelPlan = validatePlan(modelRaw, schemaFor(analysis, records)).plan;
      if (JSON.stringify(modelPlan) !== JSON.stringify(res.plan)) {
        console.log(`[ask] plasa de siguranță a corectat planul. model: ${JSON.stringify(modelPlan)} → corectat: ${JSON.stringify(res.plan)}`);
      }
    }
    // „Descarcă toate (CSV)”: toate comenzile din spatele răspunsului, cu coloanele fișierului.
    // „;” + BOM, ca Excel-ul în română să le deschidă direct pe coloane, cu diacritice.
    if (c.req.query("format") === "csv") {
      if (!res.answer) return c.json({ error: res.error ?? "Nu pot răspunde la asta din acest fișier." }, 400);
      const esc = (v: string) => /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const d = res.answer.detail;
      const csv = "\uFEFF" + [d.columns, ...d.rows].map((r) => r.map(esc).join(";")).join("\r\n");
      return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="comenzi-folosite.csv"' });
    }
    // în pagină trimitem doar primele 100 de comenzi; restul se descarcă (vezi mai sus)
    if (res.answer) res.answer.detail = { ...res.answer.detail, rows: res.answer.detail.rows.slice(0, DETAIL_ROWS) };
    return c.json(res);
  });

  return app;
}

/** UTF-8 cu sau fără BOM; dacă nu e UTF-8 valid, încearcă Windows-1250 (Excel românesc vechi). */
async function decodeText(bytes: Uint8Array): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try { return new TextDecoder("windows-1250").decode(bytes); }
    catch { return new TextDecoder("utf-8").decode(bytes); }
  }
}

// Semnătura ZIP (.xlsx/.xlsm, care sunt arhive OOXML) și semnătura OLE/CFB
// (.xls vechi). Verificăm atât extensia cât și octeții, ca să prindem și
// fișiere redenumite greșit sau trimise fără extensie corectă.
const ZIP_SIG = [0x50, 0x4b];
const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const hasSig = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

function looksLikeSpreadsheet(filename: string, bytes: Uint8Array): boolean {
  const ext = filename.toLowerCase().match(/\.(xlsx|xlsm|xls)$/)?.[1];
  if (ext) return true;
  return hasSig(bytes, ZIP_SIG) || hasSig(bytes, OLE_SIG);
}

/** Citește foaia cu date dintr-un Excel (.xlsx/.xlsm/.xls) și o convertește în text CSV,
 * ca analyze() să rămână neschimbat — vede mereu doar CSV, indiferent de formatul fișierului primit.
 *
 * Important: folosim VALOAREA celulei, nu textul afișat. `sheet_to_csv` exporta textul formatat
 * în stil american („2,400”, „3/14/26”), pe care curățarea (gândită pentru format românesc) îl
 * citea greșit: „2,400” → 2,4 și zi↔lună inversate. Acum:
 *  - numerele ies cu virgulă zecimală, fără separator de mii („1234,5”) — neambiguu pentru normalize;
 *  - datele ies ISO („2026-03-14”), citite din codul de dată Excel, fără fus orar.
 * Foaia aleasă = cea cu cele mai multe celule completate (nu prima cu ≥2 rânduri, care putea fi un sumar). */
function spreadsheetToCsv(bytes: Uint8Array): string {
  let wb;
  try {
    wb = readWorkbook(Buffer.from(bytes), { type: "buffer", cellDates: false, cellNF: true });
  } catch {
    throw new AnalysisError("Nu am putut citi acest fișier Excel. Verifică dacă nu e corupt sau protejat cu parolă.");
  }
  if (!wb.SheetNames.length) throw new AnalysisError("Fișierul Excel nu are nicio foaie de calcul.");
  const filled = (name: string) => {
    const ws = wb.Sheets[name];
    return Object.keys(ws).filter((k) => k[0] !== "!" && ws[k] && ws[k].v !== undefined && ws[k].v !== "").length;
  };
  const sheetName = [...wb.SheetNames].sort((a, b) => filled(b) - filled(a))[0];
  const ws = wb.Sheets[sheetName];
  if (!ws["!ref"]) throw new AnalysisError(`Foaia „${sheetName}” din fișierul Excel pare goală.`);
  const range = xlsxUtils.decode_range(ws["!ref"]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const cellText = (c: { t?: string; v?: unknown; z?: unknown; w?: string } | undefined): string => {
    if (!c || c.v === undefined || c.v === null) return "";
    if (c.t === "n") {
      const v = c.v as number;
      const fmt = typeof c.z === "string" ? c.z : "";
      if (fmt && SSF.is_date(fmt)) {
        const d = SSF.parse_date_code(v);
        if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
      }
      return Number.isFinite(v) ? String(v).replace(".", ",") : "";
    }
    if (c.t === "d") {
      const d = c.v instanceof Date ? c.v : new Date(String(c.v));
      return Number.isNaN(d.getTime()) ? String(c.w ?? "") : d.toISOString().slice(0, 10);
    }
    if (c.t === "b") return c.v ? "DA" : "NU";
    if (c.t === "e") return "";
    return String(c.v);
  };
  const esc = (s: string) => /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) row.push(esc(cellText(ws[xlsxUtils.encode_cell({ r, c: col })])));
    lines.push(row.join(","));
  }
  const csv = lines.join("\n");
  if (!csv.replace(/[,\s]/g, "")) throw new AnalysisError(`Foaia „${sheetName}” din fișierul Excel pare goală.`);
  return csv;
}
