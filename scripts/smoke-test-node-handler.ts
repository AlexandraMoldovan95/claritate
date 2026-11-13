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
  const roles = await fetch(`${base}/api/roles`);
  assert(roles.status === 200, `GET /api/roles status 200 (got ${roles.status})`);

  // Rutele /api/view, /api/set-roles, /api/ask iau id-ul din query string,
  // nu din path (vezi comentariul din backend/app.ts - orice ruta /api/...
  // cu 2+ segmente de path primea 404 direct de la platforma Vercel, deci
  // am mutat id-ul in query ca sa ramanem mereu pe un singur segment).
  // id "x" nu trece regexul de id (prea scurt) -> load() intoarce null fara
  // sa atinga Redis, deci testele astea nu au nevoie de UPSTASH_REDIS_REST_URL.
  const view = await fetch(`${base}/api/view?id=x`);
  assert(view.status === 404, `GET /api/view?id=x ajunge la Hono => 404 (got ${view.status})`);

  const ask = await fetch(`${base}/api/ask?id=x`, { method: "POST" });
  assert(ask.status === 404, `POST /api/ask?id=x ajunge la Hono => 404 (got ${ask.status})`);

  console.log("\nRutele /api/view, /api/ask (id ca query param) ajung corect la functie sub Node.js (http.createServer).");
  console.log("(Testele cu Redis real raman pentru verificarea live pe Vercel, unde avem UPSTASH_REDIS_REST_URL/TOKEN.)");
} finally {
  server.close();
}
