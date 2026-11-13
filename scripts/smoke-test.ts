// Test manual, rulat o singură dată, ca să confirme că backend/app.ts + db.ts
// chiar merg sub Node/npm hono (nu doar sub Deno). Nu face parte din deploy.
import { createApp } from "../backend/app.ts";
import { memoryStore } from "../backend/db.ts";
import { EXAMPLE_FILES } from "../api/_examples.generated.ts";

const app = createApp({
  store: memoryStore(),
  // fără planner => rulePlan (exact ce se va întâmpla pe Vercel, pentru moment)
  readStatic: async (path: string) => {
    const file = Object.keys(EXAMPLE_FILES).find((f) => path === `/examples/${f}`);
    return file ? { body: EXAMPLE_FILES[file], type: "text/csv" } : null;
  },
});

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const up = await app.request("/api/upload", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ example: "vanzari_2026.csv" }),
});
assert(up.status === 200, `upload example status 200 (got ${up.status})`);
const upBody = await up.json();
assert(typeof upBody.id === "string" && upBody.id.length > 0, "upload returned an id");
console.log("analysis keys:", Object.keys(upBody.analysis ?? {}));
console.log(JSON.stringify(upBody.analysis).slice(0, 500));
const id = upBody.id;

const get = await app.request(`/api/view/${id}`);
assert(get.status === 200, "GET /api/view/:id status 200");

const ask = await app.request(`/api/view/${id}/ask`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ question: "Care a fost cea mai slabă lună?" }),
});
assert(ask.status === 200, "ask status 200");
const askBody = await ask.json();
assert(askBody.source === "reguli", `fără planner => sursa e "reguli" (got ${askBody.source})`);
assert(!!askBody.answer, "ask a primit un răspuns, nu doar o eroare");
console.log("Răspuns:", JSON.stringify(askBody.answer).slice(0, 200));

const badId = await app.request("/api/view/nuexista123");
assert(badId.status === 404, `id inexistent => 404 (got ${badId.status})`);

const badUpload = await app.request("/api/upload", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ filename: "gol.csv", text: "" }),
});
assert(badUpload.status === 400, `CSV gol => 400 (got ${badUpload.status})`);

console.log("\nToate verificările au trecut.");
