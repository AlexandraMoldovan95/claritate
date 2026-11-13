// Test manual: verifica fix-ul exact pentru bug-ul de pe Vercel (Edge -> Node.js
// getRequestListener), pornind un server HTTP real cu Node, nu doar apeland
// app.fetch() direct. Simuleaza exact ce face Vercel cand invoca functia
// /api/[...route].ts ca Node.js Serverless Function: (req, res) brute de Node.
import { createServer } from "node:http";
import handler from "../api/[...route].ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const server = createServer((req, res) => {
  handler(req, res);
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${port}`;

try {
  // 1 segment (asta mergea si pe Edge)
  const roles = await fetch(`${base}/api/roles`);
  assert(roles.status === 200, `GET /api/roles (1 segment) status 200 (got ${roles.status})`);

  // 2 segmente, pe o ruta care NU exista in Hono -> daca ajunge la Hono, primim
  // 404 de la APLICATIA noastra (JSON {error}), nu 404 de la platforma Vercel.
  // Asta era exact simptomul de pe Vercel: cererea nici nu ajungea la functie.
  const missing2 = await fetch(`${base}/api/roles/foo`);
  assert(missing2.status === 404, `GET /api/roles/foo (2 segmente) ajunge la Hono => 404 (got ${missing2.status})`);

  // 3 segmente, tot pe o ruta inexistenta
  // id "x" nu trece regexul de id (prea scurt) -> load() intoarce null fara
  // sa atinga Redis, deci testul asta nu are nevoie de UPSTASH_REDIS_REST_URL.
  const missing3 = await fetch(`${base}/api/view/x/ask`, { method: "POST" });
  assert(missing3.status === 404 || missing3.status === 400, `POST /api/view/x/ask (3 segmente) ajunge la Hono (got ${missing3.status})`);

  console.log("\nRutarea pe mai multe segmente ajunge corect la functie sub Node.js (http.createServer).");
  console.log("(Testele cu Redis real raman pentru verificarea live pe Vercel, unde avem UPSTASH_REDIS_REST_URL/TOKEN.)");
} finally {
  server.close();
}
