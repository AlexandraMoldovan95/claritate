// Regenerează api/_examples.generated.ts din public/examples/*.csv.
// Funcția Vercel nu citește de pe disc la fiecare cerere, așa că exemplele sunt incluse ca text.
// Rulare: npx tsx scripts/generate-examples.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../public/examples/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".csv")).sort();
const body = files.map((f) => `  ${JSON.stringify(f)}: ${JSON.stringify(readFileSync(new URL(f, dir), "utf8"))},`).join("\n");
writeFileSync(new URL("../api/_examples.generated.ts", import.meta.url),
  `// GENERAT din public/examples/*.csv cu scripts/generate-examples.ts — nu edita de mână.\n` +
  `// Funcția Vercel nu citește de pe disc la fiecare cerere, deci CSV-urile demo sunt incluse aici ca text,\n` +
  `// ca să funcționeze fluxul "încearcă un exemplu" din POST /api/upload { example }.\n\n` +
  `export const EXAMPLE_FILES: Record<string, string> = {\n${body}\n};\n`);
console.log(`api/_examples.generated.ts: ${files.length} fișiere (${files.join(", ")})`);
