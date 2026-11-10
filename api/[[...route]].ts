// Punctul de intrare pe Vercel (Edge Function). Echivalentul lui main.ts de pe Val Town.
// Diferențe față de Val Town:
//   - stocare: Vercel KV (Redis) în loc de SQLite — vezi backend/db.ts, vercelKvStore.
//   - fără model AI: nu trimitem niciun "planner" către createApp, deci backend/core/ask.ts
//     răspunde mereu cu planificatorul pe reguli (rulePlan), ca în dev.ts local.
//     Când/dacă se adaugă o cheie (OpenAI/Anthropic), se scrie un planner aici și se dă
//     la createApp — restul aplicației nu se schimbă.
//   - fișiere statice: index.html, frontend/*, examples/*.csv și og.jpg sunt în public/,
//     servite direct de Vercel (vezi vercel.json pentru rescrierea /d/:id → /index.html).
//     Singurul lucru pe care tot trebuie să-l citim din interiorul funcției e textul celor
//     4 CSV-uri demo, pentru că POST /api/upload { example } face analiza pe server
//     (api/_examples.generated.ts, generat din public/examples/*.csv).

import { kv } from "@vercel/kv";
import { createApp } from "../backend/app";
import { vercelKvStore } from "../backend/db";
import { EXAMPLE_FILES } from "./_examples.generated";

export const config = { runtime: "edge" };

const app = createApp({
  store: vercelKvStore(kv),
  // planner: omis intenționat — vezi nota de mai sus.
  readStatic: async (path: string) => {
    const file = Object.keys(EXAMPLE_FILES).find((f) => path === `/examples/${f}`);
    if (!file) return null;
    return { body: EXAMPLE_FILES[file], type: "text/csv; charset=utf-8" };
  },
});

export default function handler(request: Request) {
  return app.fetch(request);
}
