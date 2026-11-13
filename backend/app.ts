// Rutele aplicației. Nu depinde de Val Town: primește din afară stocarea,
// planificatorul (modelul) și cititorul de fișiere statice. main.ts le leagă de
// Val Town (SQLite + std/openai), dev.ts de variante locale pentru teste.

import { Hono } from "hono";
import { read as readWorkbook, utils as xlsxUtils } from "xlsx";
import { analyze, AnalysisError, MAX_BYTES } from "./core/analyze.js";
import { answerQuestion, schemaFor, validatePlan } from "./core/ask.js";
import { ROLE_LABELS, type Role } from "./core/detect.js";
import { OG_IMAGE } from "./og_image.js";

export interface StoredUpload { id: string; filename: string; raw: string; overrides: Record<string, Role> }

export interface Store {
  save(filename: string, raw: string): Promise<string>;
  get(id: string): Promise<StoredUpload | null>;
  setOverrides(id: string, overrides: Record<string, Role>): Promise<void>;
}

export type Planner = (system: string, question: string) => Promise<unknown>;

export interface Deps {
  store: Store;
  planner?: Planner;
  readStatic: (path: string) => Promise<{ body: string; type: string } | null>;
}

export const EXAMPLES = [
  { file: "vanzari_2026.csv", label: "Vânzări 2026" },
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

/** Citește prima foaie nevidă dintr-un Excel (.xlsx/.xlsm/.xls) și o convertește în text CSV,
 * ca analyze() să rămână neschimbat — vede mereu doar CSV, indiferent de formatul fișierului primit. */
function spreadsheetToCsv(bytes: Uint8Array): string {
  let wb;
  try {
    wb = readWorkbook(Buffer.from(bytes), { type: "buffer", cellDates: true });
  } catch {
    throw new AnalysisError("Nu am putut citi acest fișier Excel. Verifică dacă nu e corupt sau protejat cu parolă.");
  }
  if (!wb.SheetNames.length) throw new AnalysisError("Fișierul Excel nu are nicio foaie de calcul.");
  const sheetName =
    wb.SheetNames.find((name) => {
      const rows = xlsxUtils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }) as unknown[][];
      return rows.length >= 2;
    }) ?? wb.SheetNames[0];
  const csv = xlsxUtils.sheet_to_csv(wb.Sheets[sheetName]);
  if (!csv.trim()) throw new AnalysisError(`Foaia „${sheetName}” din fișierul Excel pare goală.`);
  return csv;
}
