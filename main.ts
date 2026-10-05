// Punctul de intrare pe Val Town (HTTP val).
// Leagă aplicația de: SQLite-ul val-ului, modelul gratuit Val Town (fără cheie API)
// și fișierele din proiect (frontend/, examples/).

import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { OpenAI } from "https://esm.town/v/std/openai/main.ts";
import { readFile } from "https://esm.town/v/std/utils/index.ts";
import { createApp, type Planner } from "./backend/app.ts";
import { sqliteStore } from "./backend/db.ts";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  csv: "text/csv; charset=utf-8", svg: "image/svg+xml", png: "image/png", ico: "image/x-icon",
  webmanifest: "application/manifest+json",
};

const openai = new OpenAI();

// Modelul primește doar schema (nume de coloane + valori categorice) și întrebarea,
// și întoarce un plan JSON. Nu vede rândurile și nu scrie cifre.
// În loguri apare dacă modelul a răspuns (și cu ce plan) sau a eșuat → atunci ask.ts trece pe reguli.
const planner: Planner = async (system, question) => {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [{ role: "system", content: system }, { role: "user", content: question }],
      response_format: { type: "json_object" },
      max_completion_tokens: 400,
    });
    const plan = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    console.log(`[ask] model ${res.model} a întors planul: ${JSON.stringify(plan)}`);
    return plan;
  } catch (err) {
    console.warn(`[ask] model indisponibil, răspuns pe reguli: ${err instanceof Error ? err.message : err}`);
    throw err;
  }
};

const app = createApp({
  store: await sqliteStore(sqlite),
  planner,
  readStatic: async (path) => {
    try {
      const body = await readFile(path, import.meta.url);
      const ext = path.split(".").pop() ?? "";
      return { body, type: TYPES[ext] ?? "text/plain; charset=utf-8" };
    } catch {
      return null;
    }
  },
});

export default app.fetch;
