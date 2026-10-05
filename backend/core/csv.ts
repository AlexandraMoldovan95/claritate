// Citire CSV robustă: ghilimele, ghilimele dublate, rânduri noi în ghilimele,
// CRLF / LF / CR, BOM, separator detectat automat (, ; tab |).
// Nu aruncă niciodată: un fișier ciudat dă cel mult rânduri ciudate, pe care
// detect.ts și clean.ts le tratează mai departe.

export type Delimiter = "," | ";" | "\t" | "|";
const CANDIDATES: Delimiter[] = [",", ";", "\t", "|"];

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Împarte textul în rânduri de celule, respectând ghilimelele. */
export function parseRows(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell.trim() === "") { inQuotes = true; cell = ""; i++; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      i++; continue;
    }
    cell += ch; i++;
  }
  // ultimul rând (fișier fără rând nou la final)
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Alege separatorul care dă cel mai constant număr de coloane (> 1) pe primele
 * rânduri nevide. Preambulul narativ (1 celulă) nu contează, așa că îl ignorăm.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 20000);
  let best: Delimiter = ",";
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const rows = parseRows(sample, d).slice(0, 60)
      .map((r) => r.length)
      .filter((len) => len > 1);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const len of rows) counts.set(len, (counts.get(len) ?? 0) + 1);
    const [modeWidth, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    // câte rânduri au lățimea dominantă, ponderat ușor cu lățimea
    const score = modeCount * 10 + Math.min(modeWidth, 30);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function readCsv(text: string): { rows: string[][]; delimiter: Delimiter } {
  const clean = stripBom(text);
  const delimiter = detectDelimiter(clean);
  return { rows: parseRows(clean, delimiter), delimiter };
}
