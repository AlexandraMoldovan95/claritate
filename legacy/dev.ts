// Rulare locală, fără Val Town: stocare în memorie, fără model (doar regulile).
//   deno run --allow-net --allow-read dev.ts
import { createApp } from "./backend/app.ts";
import { memoryStore } from "./backend/db.ts";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  csv: "text/csv; charset=utf-8", svg: "image/svg+xml",
};
const root = new URL(".", import.meta.url);

const app = createApp({
  store: memoryStore(),
  readStatic: async (path) => {
    try {
      const body = await Deno.readTextFile(new URL("." + path, root));
      return { body, type: TYPES[path.split(".").pop() ?? ""] ?? "text/plain" };
    } catch { return null; }
  },
});

const port = Number(Deno.env.get("PORT") ?? 8787);
Deno.serve({ port }, app.fetch);
