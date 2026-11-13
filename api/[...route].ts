// Punctul de intrare pe Vercel (Edge Function). Echivalentul lui main.ts de pe Val Town.
// Diferente fata de Val Town:
//   - stocare: Redis (Upstash, prin Vercel Marketplace) in loc de SQLite - vezi
//     backend/db.ts, vercelKvStore. Am folosit "@vercel/kv" initial, dar e deprecat
//     (vezi avertismentul din build); "@upstash/redis" e pachetul actual, si citeste
//     automat variabilele de mediu puse de integrarea Vercel (Redis.fromEnv()).
//   - fara model AI: nu trimitem niciun "planner" catre createApp, deci backend/core/ask.ts
//     raspunde mereu cu planificatorul pe reguli (rulePlan), ca in dev.ts local.
//     Cand/daca se adauga o cheie (OpenAI/Anthropic), se scrie un planner aici si se da
//     la createApp - restul aplicatiei nu se schimba.
//   - fisiere statice: index.html, frontend/*, examples/*.csv si og.jpg sunt in public/,
//     servite direct de Vercel (vezi vercel.json pentru rescrierea /d/:id -> /index.html).
//     Singurul lucru pe care tot trebuie sa-l citim din interiorul functiei e textul celor
//     4 CSV-uri demo, pentru ca POST /api/upload { example } face analiza pe server
//     (api/_examples.generated.ts, generat din public/examples/*.csv).

import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Redis } from "@upstash/redis";
import { createApp } from "../backend/app.js";
import { vercelKvStore } from "../backend/db.js";
import { EXAMPLE_FILES } from "./_examples.generated.js";

// Fara "export const config = { runtime: 'edge' }": functia ruleaza ca
// Node.js Serverless Function (implicit pe Vercel). Motiv: pe runtime-ul Edge,
// pentru proiecte fara framework ("Other"), Vercel nu a prins corect rutele
// catch-all cu mai mult de un segment sub /api/... (ex. /api/view/:id/ask
// pica mereu cu 404 la nivel de platforma, desi /api/examples mergea). Pe
// Node.js functia primeste (req, res) brute de Node, nu un Request din Fetch
// API, deci avem nevoie de adaptorul getRequestListener din @hono/node-server
// ca sa-l transformam corect inainte sa-l dam lui app.fetch().

// Redis.fromEnv() cauta UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN - numele
// pe care integrarea "Upstash" din Vercel Marketplace le pune automat. Daca in
// Vercel apar sub alt nume (ex. un KV_REST_API_URL ramas de la vechiul Vercel KV),
// citim si varianta aia, ca rezerva.
const redis =
  process.env.UPSTASH_REDIS_REST_URL
    ? Redis.fromEnv()
    : new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });

const app = createApp({
  store: vercelKvStore(redis),
  // planner: omis intentionat - vezi nota de mai sus.
  readStatic: async (path: string) => {
    const file = Object.keys(EXAMPLE_FILES).find((f) => path === `/examples/${f}`);
    if (!file) return null;
    return { body: EXAMPLE_FILES[file], type: "text/csv; charset=utf-8" };
  },
});

const listener = getRequestListener(app.fetch);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return listener(req, res);
}
