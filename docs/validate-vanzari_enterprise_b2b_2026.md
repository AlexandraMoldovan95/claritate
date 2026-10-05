# Validare: `vanzari_enterprise_b2b_2026.csv`

Generat cu `/data:validate-data` (plugin `data`), 2026-09-24.

Nu exista o analiză anterioară pentru acest fișier. Validarea a constat în: (1) calculul valorilor de referință pentru cele 6 dashboard-uri pe **două căi independente**, (2) compararea lor, (3) verificarea regulilor din CLAUDE.md pe cazurile-limită ale fișierului.

- **Metoda 1**: `profile.py` (Python 3.13, `csv` din stdlib) — același script ca la explorarea lui `vanzari_2026.csv`.
- **Metoda 2**: `verify.mjs` (Node 24) — scris separat: parser CSV propriu (automat cu stări), antet detectat după structură, coloane găsite după nume, deduplicare doar pe rânduri identice după normalizare. Codul complet e în Anexa B.
- **Control**: metoda 2 rulată pe `vanzari_2026.csv` reproduce exact valorile din `docs/explore-vanzari_2026.md` (129 comenzi, venit livrat RON 265.882,81 · EUR 29.475,32, pierdut RON 69.131,30 · EUR 8.745,90) → și acele cifre sunt acum confirmate independent.

## Evaluare generală: **Utilizabil, cu 3 decizii de luat**

Cifrele sunt verificate: cele două metode coincid la cent după ce aplică aceeași regulă pentru ID-ul în conflict. Dar fișierul atinge trei cazuri pe care CLAUDE.md nu le tranșează complet, iar valorile de referință din teste depind de cum le decidem (secțiunea „Decizii necesare”).

## Structură

- UTF-8, fără BOM, **LF**, separator `,`, 82 de linii fizice. Preambul de 3 rânduri + 1 gol → **antet pe linia 5**.
- Ordinea coloanelor: `Nr comanda, Status, Client, Produs, Cantitate, Valuta, Pret unitar, Data` (diferită de `vanzari_2026.csv`; detectarea după nume funcționează).
- 77 de rânduri sub antet: 4 goale (liniile 24, 44, 61, 81), 4 de total, **69 de rânduri de date**.
- 0 duplicate identice. **1 ID în conflict**: `CMD-400003`.
- ID-uri `CMD-400001…400075`: 68 unice, **lipsesc 7** (400015, 019, 033, 039, 046, 050, 056).
- Date: toate `dd.mm.yyyy` valide, 2026-01-09 → 2026-08-28. Preambulul declară perioada până la **30.09.2026**, dar septembrie nu are nicio comandă.
- Client: 18 variante brute → **12 clienți**. Produs: 8. Status: 15 variante brute → 4. Monede: RON, EUR.

## Probleme găsite

1. **[Mare] `CMD-400003` apare de două ori cu conținut complet diferit.**
   - linia 8: `In curs · Med Expert Clinic · Abonament Platforma B2B · 2 × 75,19 EUR · 22.06.2026`
   - linia 51: `LIVRATA · Vectra Industrial · Pachet Securitate Endpoint · 3 × 3.766,27 RON · 04.06.2026` (= 11.298,81 RON)

   Pare un ID tastat greșit (secvența are 7 goluri). Regula din CLAUDE.md: „ID-uri identice cu conținut diferit se marchează în raport, nu se șterg în tăcere” → **ambele rânduri rămân, cu avertisment**. Efect: venitul livrat RON crește cu 13,5% (83.969,24 → 95.268,05), iar **tot** venitul livrat RON al lui Vectra Industrial vine din acest rând.

   ⚠️ Metoda 1 (`profile.py`) păstra în tăcere doar primul rând — exact comportamentul interzis. Bug în scriptul de profilare, nu în date; nu afectează `explore-vanzari_2026.md` (acolo 0 conflicte). `backend/clean.ts` trebuie să aibă un test pe acest caz.

2. **[Mare] Rândurile de total adună RON cu EUR și le etichetează RON.** Spre deosebire de `vanzari_2026.csv`, aici fiecare `TOTAL PARTIAL` e **exact** suma valorilor de deasupra lui — dar amestecând monedele:

   | Linie | Total declarat („RON”) | Suma segmentului, RON + EUR | Doar RON |
   |---|---|---|---|
   | 20 | 154.372,03 | **154.372,03** ✓ | 151.588,59 |
   | 38 | 117.394,84 | **117.394,84** ✓ | 99.771,41 |
   | 55 | 81.421,23 | **81.421,23** ✓ | 75.102,37 |
   | 82 (GENERAL) | 478.339,90 | 521.827,18 (tot fișierul) | 481.292,55 (tot fișierul) |

   `TOTAL GENERAL` nu se potrivește cu nicio variantă testată. Concluzie: totalurile trebuie eliminate și aici. Dacă cineva ar verifica aplicația comparând cu ele, ar părea că aplicația greșește — de menționat în raportul de curățare („rândurile de total din fișier amestecă monedele”).

3. **[Medie] Ianuarie și februarie: 7 comenzi fiecare, 0 livrate.** Venitul livrat e 0 în ambele luni. Dacă „cea mai slabă lună” se caută doar între lunile cu venit, iese aprilie (RON) / martie (EUR); dacă se includ toate lunile cu comenzi, iese ianuarie/februarie cu 0.

4. **[Medie] Structura statusurilor e foarte diferită de celelalte fișiere.** Doar 21 din 69 de comenzi sunt livrate (30%); 27 sunt „În curs” (39%). Pe valoare, RON: livrat 19,8%, pierdut 46,8%, în curs 33,4%. Nu e o eroare — dar dashboard-urile 2 și 3 vor arăta o companie care pierde mai mult decât încasează. Formularea din UI trebuie să rămână neutră („din valoarea totală a comenzilor”).

5. **[Mică] Nume afișat ales greșit la egalitate.** `Muntenia Telecom` apare de 2 ori, `muntenia telecom` tot de 2 ori; regula „forma cea mai frecventă” nu decide, iar metoda 1 a ales forma cu minuscule. Trebuie un criteriu de departajare.

6. **[Mică] Eșantion EUR mic.** 9 comenzi EUR livrate în 6 luni (1–2 pe lună) → „cea mai bună/slabă lună în EUR” se decide de o singură comandă.

7. **[Info] Prețul unitar variază mult în cadrul aceluiași produs** (până la 13× pentru Training Utilizatori Finali în RON), spre deosebire de `vanzari_2026.csv` (≤ 1,2×). Prețul nu poate fi folosit ca verificare a corectitudinii rândurilor.

## Verificarea calculelor (metoda 1 vs metoda 2)

Toate cu `CMD-400003` păstrat de două ori (regula din CLAUDE.md). Metoda 1 a fost corectată manual adăugând rândul 51 (11.298,81 RON, Livrată, iunie).

| Metrică | Metoda 1 | Metoda 2 | |
|---|---|---|---|
| Comenzi valide | 68 + 1 = 69 | 69 | ✓ |
| Comenzi RON / EUR | 44 / 25 | 44 / 25 | ✓ |
| Status: Livrată / Retur / Anulată / În curs | 21 / 9 / 12 / 27 | 21 / 9 / 12 / 27 | ✓ |
| Valoare totală RON | 469.993,74 + 11.298,81 = 481.292,55 | 481.292,55 | ✓ |
| Valoare totală EUR | 40.534,63 | 40.534,63 | ✓ |
| Venit livrat RON | 83.969,24 + 11.298,81 = 95.268,05 | 95.268,05 | ✓ |
| Venit livrat EUR | 6.550,59 | 6.550,59 | ✓ |
| Venit pierdut RON (Retur 70.738,79 + Anulată 154.342,62) | 225.081,41 | 225.081,41 | ✓ |
| Venit pierdut EUR (Retur 11.818,64 + Anulată 12.639,56) | 24.458,20 | 24.458,20 | ✓ |
| În curs RON / EUR | 160.943,09 / 9.525,84 | 160.943,09 / 9.525,84 | ✓ |
| Livrat + Retur + Anulat + În curs = Total (RON) | 481.292,55 | — | ✓ suma se închide |
| Livrat pe lună (toate cele 12 perechi lună × monedă) | identic | identic | ✓ |
| Control pe `vanzari_2026.csv` | — | identic cu explorarea | ✓ |

**Verificare punctuală**: `CMD-400017` = 10 × 4.190,17 = 41.901,70 RON (cea mai mare comandă RON, Audit Conformitate GDPR, Anulată) — apare în Anulată RON în ambele metode.

## Valori de referință pentru teste

### Venit livrat pe lună

| Lună | Comenzi (toate) | Livrat RON | Livrat EUR |
|---|---|---|---|
| 2026-01 | 7 | 0,00 | 0,00 |
| 2026-02 | 7 | 0,00 | 0,00 |
| 2026-03 | 6 | 6.263,25 | **260,06** (min) |
| 2026-04 | 8 | 4.509,85 (min dintre lunile cu venit) | **1.963,83** (max) |
| 2026-05 | 12 | 7.399,20 | 935,29 |
| 2026-06 | 11 + 1 conflict | 33.769,24 (22.470,43 fără rândul în conflict) | 1.738,57 |
| 2026-07 | 8 | 6.111,38 | 861,95 |
| 2026-08 | 10 | **37.215,13** (max) | 790,89 |

Cea mai bună lună RON e **august** indiferent de regula pentru `CMD-400003`.

### Top clienți

| Venit livrat RON | | Venit pierdut RON | |
|---|---|---|---|
| Global Spedition SRL | 22.757,45 | Oltenia Power SA | 61.505,40 |
| Sirius Retail Group | 21.797,05 | Med Expert Clinic | 58.148,97 |
| Oltenia Power SA | 15.418,08 | Quantum Dynamics SRL | 40.917,09 |
| Vectra Industrial ⚠️ | 11.298,81 | Proiect Expert Consult | 39.225,22 |
| Terra Terra Construct | 11.049,96 | Global Spedition SRL | 9.677,10 |

⚠️ Tot venitul livrat al lui Vectra Industrial vine din rândul `CMD-400003` în conflict.

Venit livrat EUR, top 3: Muntenia Telecom 2.928,38 · Quantum Dynamics SRL 1.034,08 · Global Spedition SRL 861,95.

### Sănătatea comenzilor (după număr)

Rata de retur 13,0% (9/69) · rata de anulare 17,4% (12/69) · în curs 39,1% (27/69). Valoare blocată în „În curs”: RON 160.943,09 · EUR 9.525,84.

## Decizii necesare

| # | Întrebare | Recomandare |
|---|---|---|
| 1 | ID duplicat cu conținut diferit: păstrăm ambele rânduri? | **Da**, cum spune CLAUDE.md, cu avertisment vizibil în raportul de curățare și în dashboard-ul Top clienți. Valorile de mai sus presupun asta. |
| 2 | Luni cu comenzi dar fără venit livrat: intră în „cea mai slabă lună”? | **Da, cu 0**, și le afișăm explicit („ian. și feb. 2026: nicio comandă livrată”). Ascunderea lor ar face aprilie să pară cea mai slabă lună, ceea ce e fals. Lunile fără nicio comandă (septembrie) nu se afișează. |
| 3 | Egalitate la forma afișată a unui nume | La egalitate, preferă forma care nu e toată cu minuscule sau toată cu majuscule; apoi prima apariție. |

## Îmbunătățiri sugerate

1. Adaugă în `tests/` un fixture cu un ID în conflict și unul cu egalitate de forme afișate — ambele cazuri apar în acest fișier și ar trece neobservate.
2. În raportul de curățare, arată lângă „4 rânduri de total eliminate” și motivul: „amestecau RON și EUR”.
3. Pentru dashboard-ul 4, când o monedă are ≤ 2 comenzi pe lună, afișează numărul de comenzi lângă sumă — altfel extremele EUR par mai semnificative decât sunt.

## Avertismente de afișat utilizatorului

- „1 număr de comandă (`CMD-400003`) apare de două ori cu date diferite. Am păstrat ambele rânduri.”
- „Totalurile din fișier au fost ignorate: adună RON și EUR la un loc.”
- „Perioada din antetul fișierului se termină pe 30.09.2026, dar ultima comandă e din 28.08.2026.”

---

## Anexa A — Metoda 2, ieșire brută

```json
{
 "headerLine": 5,
 "empty": 4,
 "totals": 4,
 "exactDup": 0,
 "conflictIds": [
  "CMD-400003"
 ],
 "orders": 69,
 "clients": 12,
 "products": 8,
 "byCurrencyCount": {
  "RON": 44,
  "EUR": 25
 },
 "statusCount": {
  "Anulata": 12,
  "In curs": 27,
  "Livrata": 21,
  "Retur": 9
 },
 "total": {
  "RON": 481292.55,
  "EUR": 40534.63
 },
 "byStatusCur": {
  "Anulata|RON": 154342.62,
  "In curs|EUR": 9525.84,
  "Livrata|RON": 95268.05,
  "In curs|RON": 160943.09,
  "Livrata|EUR": 6550.59,
  "Retur|RON": 70738.79,
  "Anulata|EUR": 12639.56,
  "Retur|EUR": 11818.64
 },
 "delivered": {
  "RON": 95268.05,
  "EUR": 6550.59
 },
 "lost": {
  "RON": 225081.41,
  "EUR": 24458.2
 },
 "deliveredByMonth": {
  "2026-07|RON": 6111.38,
  "2026-07|EUR": 861.95,
  "2026-05|EUR": 935.29,
  "2026-08|EUR": 790.89,
  "2026-06|EUR": 1738.57,
  "2026-06|RON": 33769.24,
  "2026-03|RON": 6263.25,
  "2026-05|RON": 7399.2,
  "2026-04|RON": 4509.85,
  "2026-04|EUR": 1963.83,
  "2026-08|RON": 37215.13,
  "2026-03|EUR": 260.06
 },
 "topClientsDeliveredRON": [
  [
   "global spedition srl",
   22757.45
  ],
  [
   "sirius retail group",
   21797.05
  ],
  [
   "oltenia power sa",
   15418.08
  ],
  [
   "vectra industrial",
   11298.81
  ],
  [
   "terra terra construct",
   11049.96
  ]
 ],
 "topClientsDeliveredEUR": [
  [
   "muntenia telecom",
   2928.38
  ],
  [
   "quantum dynamics srl",
   1034.08
  ],
  [
   "global spedition srl",
   861.95
  ],
  [
   "med expert clinic",
   790.89
  ],
  [
   "vectra industrial",
   602.17
  ]
 ],
 "lostByClientRON": [
  [
   "oltenia power sa",
   61505.4
  ],
  [
   "med expert clinic",
   58148.97
  ],
  [
   "quantum dynamics srl",
   40917.09
  ],
  [
   "proiect expert consult",
   39225.22
  ],
  [
   "global spedition srl",
   9677.1
  ]
 ]
}
```

## Anexa B — Metoda 2, cod (`verify.mjs`)

```js
// Verificare independentă (metoda 2): parser propriu, reguli din CLAUDE.md.
import { readFileSync } from "node:fs";

const text = readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, "");

// CSV parser: state machine, handles quotes, "" escapes, CRLF/LF
function parseCSV(s, sep = ",") {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const fold = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const isNum = (x) => /^[\d\s.,]+$/.test(x.trim()) && /\d/.test(x);

const rows = parseCSV(text);
// header: first row with >=2 non-empty mostly-non-numeric cells, followed by a row of same width
const hIdx = rows.findIndex((r, i) => {
  const ne = r.filter((c) => c.trim());
  return ne.length >= 2 && ne.filter((c) => !isNum(c)).length > ne.length / 2 && rows[i + 1]?.length === r.length;
});
const header = rows[hIdx].map(fold);
const find = (...names) => header.findIndex((h) => names.includes(h));
const C = {
  id: find("nr comanda", "id"), date: find("data", "date"), client: find("client"), prod: find("produs"),
  qty: find("cantitate", "qty"), price: find("pret unitar", "pret"), cur: find("valuta", "moneda"), status: find("status", "stare"),
};

function num(raw) {
  let x = raw.replace(/[\s"]/g, "");
  if (!x) return null;
  const lc = x.lastIndexOf(","), ld = x.lastIndexOf(".");
  const decSep = lc > ld ? "," : ld > lc ? "." : null;
  if (decSep === ",") x = x.replace(/\./g, "").replace(",", ".");
  else if (decSep === ".") {
    // "1.234" with exactly 3 digits after and no comma → thousands (RO); else decimal
    if (lc === -1 && x.length - ld - 1 === 3 && x.split(".").length === 2) x = x.replace(".", "");
    else x = x.replace(/,/g, "");
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function status(s) {
  const f = fold(s);
  if (/^livrat|^delivered/.test(f)) return "Livrata";
  if (/^retur|^return/.test(f)) return "Retur";
  if (/^anulat|^cancel/.test(f)) return "Anulata";
  if (/^in curs|^pending|^in progress/.test(f)) return "In curs";
  return s.trim();
}

const report = { empty: 0, totals: 0, exactDup: 0, conflictIds: [] };
const seenSig = new Map(); const recs = [];
for (const r of rows.slice(hIdx + 1)) {
  const cells = r.map((c) => c.trim());
  if (!cells.some(Boolean)) { report.empty++; continue; }
  if (/\b(total|subtotal|sumar)\b/.test(fold(cells.find(Boolean)))) { report.totals++; continue; }
  const [d, m, y] = cells[C.date].split(".");
  const rec = {
    id: cells[C.id], month: `${y}-${m}`, client: fold(cells[C.client]), clientRaw: cells[C.client].replace(/\s+/g, " "),
    prod: fold(cells[C.prod]), cur: cells[C.cur].toUpperCase(), status: status(cells[C.status]),
    val: num(cells[C.qty]) * num(cells[C.price]),
  };
  const sig = JSON.stringify([rec.month, d, rec.client, rec.prod, rec.cur, rec.status, rec.val]);
  if (seenSig.has(rec.id)) {
    if (seenSig.get(rec.id).includes(sig)) { report.exactDup++; continue; }
    report.conflictIds.push(rec.id); seenSig.get(rec.id).push(sig);
  } else seenSig.set(rec.id, [sig]);
  recs.push(rec);
}

const r2 = (x) => Math.round(x * 100) / 100;
const sumBy = (arr, key) => arr.reduce((m, r) => { const k = key(r); m[k] = r2((m[k] || 0) + r.val); return m; }, {});
const cnt = (arr, key) => arr.reduce((m, r) => { const k = key(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const deliv = recs.filter((r) => r.status === "Livrata");
const lost = recs.filter((r) => r.status === "Retur" || r.status === "Anulata");

const out = {
  headerLine: hIdx + 1, ...report, orders: recs.length,
  clients: new Set(recs.map((r) => r.client)).size, products: new Set(recs.map((r) => r.prod)).size,
  byCurrencyCount: cnt(recs, (r) => r.cur), statusCount: cnt(recs, (r) => r.status),
  total: sumBy(recs, (r) => r.cur), byStatusCur: sumBy(recs, (r) => `${r.status}|${r.cur}`),
  delivered: sumBy(deliv, (r) => r.cur), lost: sumBy(lost, (r) => r.cur),
  deliveredByMonth: sumBy(deliv, (r) => `${r.month}|${r.cur}`),
  topClientsDeliveredRON: Object.entries(sumBy(deliv.filter((r) => r.cur === "RON"), (r) => r.client)).sort((a, b) => b[1] - a[1]).slice(0, 5),
  topClientsDeliveredEUR: Object.entries(sumBy(deliv.filter((r) => r.cur === "EUR"), (r) => r.client)).sort((a, b) => b[1] - a[1]).slice(0, 5),
  lostByClientRON: Object.entries(sumBy(lost.filter((r) => r.cur === "RON"), (r) => r.client)).sort((a, b) => b[1] - a[1]).slice(0, 5),
};
console.log(JSON.stringify(out, null, 1));
```

## Anexa C — Metoda 1, ieșire brută (`profile.py`)

Codul lui `profile.py` e în `docs/explore-vanzari_2026.md`, Anexa C. Atenție: la „Duplicates on Nr comanda” scriptul raportează `CONFLICT`, dar în secțiunile de după păstrează doar primul rând `CMD-400003` (68 de comenzi). Cifrele din tabelul de verificare adaugă manual rândul 51.

```text
BOM: False CRLF: False
Total physical lines: 82
0 ['EXPORT COMENZI B2B ENTERPRISE — sistem intern']
1 ['Perioada: 01.01.2026 - 30.09.2026']
2 ['Generat automat la 21.09.2026 17:40. NU MODIFICATI ACEST FISIER.']
3 []
4 ['Nr comanda', 'Status', 'Client', 'Produs', 'Cantitate', 'Valuta', 'Pret unitar', 'Data']
5 ['CMD-400001', 'anulata', ' Med Expert Clinic ', 'Abonament Platforma B2B', '10', 'RON', '4.017,69', '05.08.2026']
Header at line 5 ['Nr comanda', 'Status', 'Client', 'Produs', 'Cantitate', 'Valuta', 'Pret unitar', 'Data']
Width distribution: Counter({8: 77})

Empty rows: 4 [24, 44, 61, 81]
Total rows: 4
   (20, ['TOTAL PARTIAL', '', '', '', '', 'RON', '154.372,03', ''])
   (38, ['TOTAL PARTIAL', '', '', '', '', 'RON', '117.394,84', ''])
   (55, ['TOTAL PARTIAL', '', '', '', '', 'RON', '81.421,23', ''])
   (82, ['TOTAL GENERAL', '', '', '', '', 'RON', '478.339,90', ''])
Data rows: 69

=== Raw column profile ===

[Nr comanda] nulls=0 distinct=68 leading/trailing ws=0
  top: [('CMD-400003', 2), ('CMD-400001', 1), ('CMD-400002', 1), ('CMD-400004', 1), ('CMD-400005', 1), ('CMD-400006', 1), ('CMD-400007', 1), ('CMD-400008', 1)]
  bottom: [('CMD-400071', 1), ('CMD-400072', 1), ('CMD-400073', 1), ('CMD-400074', 1), ('CMD-400075', 1)]

[Status] nulls=0 distinct=15 leading/trailing ws=17
  top: [('In curs', 9), ('in curs', 8), ('Anulata', 5), (' In curs', 5), ('Livrata ', 5), ('IN CURS', 5), ('Livrata', 5), ('anulata', 4)]
  bottom: [('livrata', 3), ('ANULATA', 3), (' Retur', 3), ('RETUR', 3), ('Retur', 3)]

[Client] nulls=0 distinct=21 leading/trailing ws=4
  top: [('Proiect Expert Consult', 8), ('Smart Data Analytics', 8), ('Quantum Dynamics SRL', 5), ('Med Expert Clinic', 5), ('Global Spedition SRL', 5), ('Terra Terra Construct', 5), ('Vectra Industrial', 5), ('Sirius Retail Group', 4)]
  bottom: [('proiect expert consult', 1), ('med expert clinic', 1), (' Oltenia Power SA ', 1), ('delta express curier', 1), ('quantum dynamics srl', 1)]

[Produs] nulls=0 distinct=8 leading/trailing ws=0
  top: [('Custom Connector ERP', 12), ('Audit Conformitate GDPR', 10), ('Modul CRM Avansat', 10), ('Training Utilizatori Finali', 10), ('Suport Dedicat VIP', 8), ('Pachet Securitate Endpoint', 7), ('Abonament Platforma B2B', 6), ('Instalare & Configurare On-Prem', 6)]

[Cantitate] nulls=0 distinct=7 leading/trailing ws=0
  top: [('1', 22), ('10', 12), ('3', 11), ('8', 9), ('2', 6), ('4', 5), ('5', 4)]

[Valuta] nulls=0 distinct=2 leading/trailing ws=0
  top: [('RON', 44), ('EUR', 25)]

[Pret unitar] nulls=0 distinct=69 leading/trailing ws=0
  top: [('4.017,69', 1), ('3.656,10', 1), ('75,19', 1), ('942,00', 1), ('3.979,55', 1), ('172,39', 1), ('57,60', 1), ('3.108,41', 1)]
  bottom: [('1.927,26', 1), ('169,53', 1), ('4.359,41', 1), ('260,06', 1), ('4.356,09', 1)]

[Data] nulls=0 distinct=64 leading/trailing ws=0
  top: [('22.06.2026', 2), ('25.07.2026', 2), ('05.02.2026', 2), ('26.06.2026', 2), ('26.05.2026', 2), ('05.08.2026', 1), ('19.03.2026', 1), ('11.07.2026', 1)]
  bottom: [('19.08.2026', 1), ('10.04.2026', 1), ('27.08.2026', 1), ('11.03.2026', 1), ('17.01.2026', 1)]

=== Numeric ===
Unparseable qty: 0 price: 0
Non-integer qty: []

[Cantitate] n=69 min=1.00 p5=1.00 p25=1.00 median=3.00 mean=4.33 p75=8.00 p95=10.00 max=10.00 sd=3.42 zeros=0 neg=0

[Pret unitar] n=69 min=57.60 p5=170.67 p25=445.66 median=870.26 mean=1688.73 p75=3225.70 p95=4358.08 max=4604.49 sd=1478.61 zeros=0 neg=0
Price formats: [('RO(1.234,56)', 69)]

=== Dates ===
Unparseable dates: []
Range: 2026-01-09 -> 2026-08-28
Per month: [('2026-01', 7), ('2026-02', 7), ('2026-03', 6), ('2026-04', 8), ('2026-05', 12), ('2026-06', 11), ('2026-07', 8), ('2026-08', 10)]
Invalid calendar dates: []

=== Duplicates on Nr comanda ===
  CMD-400003 x2 lines [8, 51] -> CONFLICT
Removable exact dups: 0 conflicting IDs: 1
ID pattern ok: True
ID range CMD-400001..CMD-400075, unique=68, missing=[400015, 400019, 400033, 400039, 400046, 400050, 400056]

=== Categorical after normalization (clean, n=68) ===

Client: raw distinct=18, normalized distinct=12
   10  'Proiect Expert Consult'  variants={'Proiect Expert Consult': 9, 'proiect expert consult': 1}
    8  'Med Expert Clinic'  variants={'Med Expert Clinic': 7, 'med expert clinic': 1}
    8  'Smart Data Analytics'  variants=
    6  'Quantum Dynamics SRL'  variants={'Quantum Dynamics SRL': 5, 'quantum dynamics srl': 1}
    6  'Carpati Food Distribution'  variants={'carpati food distribution': 2, 'Carpati Food Distribution': 4}
    5  'Global Spedition SRL'  variants=
    5  'Terra Terra Construct'  variants=
    4  'Delta Express Curier'  variants={'Delta Express Curier': 3, 'delta express curier': 1}
    4  'Sirius Retail Group'  variants=
    4  'Vectra Industrial'  variants=
    4  'Oltenia Power SA'  variants=
    4  'muntenia telecom'  variants={'muntenia telecom': 2, 'Muntenia Telecom': 2}

Produs: raw distinct=8, normalized distinct=8
   12  'Custom Connector ERP'  variants=
   10  'Audit Conformitate GDPR'  variants=
   10  'Modul CRM Avansat'  variants=
   10  'Training Utilizatori Finali'  variants=
    8  'Suport Dedicat VIP'  variants=
    6  'Abonament Platforma B2B'  variants=
    6  'Pachet Securitate Endpoint'  variants=
    6  'Instalare & Configurare On-Prem'  variants=

Status raw variants: Counter({"'In curs'": 14, "'Livrata'": 14, "'in curs'": 8, "'Retur'": 6, "'Anulata'": 5, "'IN CURS'": 5, "'anulata'": 4, "'LIVRATA'": 4, "'livrata'": 3, "'ANULATA'": 3, "'RETUR'": 3})
Status normalized: Counter({'În curs': 27, 'Livrată': 20, 'Anulată': 12, 'Retur': 9})
Valuta: Counter({'RON': 43, 'EUR': 25})

=== Value (qty x price) per currency ===

[valoare EUR] n=25 min=57.60 p5=169.49 p25=333.12 median=780.99 mean=1621.39 p75=1473.14 p95=6134.99 max=6406.24 sd=1947.28 zeros=0 neg=0
   Livrată  n=  9 sum=6,550.59
   Retur    n=  2 sum=11,818.64
   Anulată  n=  4 sum=12,639.56
   În curs  n= 10 sum=9,525.84
   TOTAL    n= 25 sum=40,534.63
   top orders: [('CMD-400063', 'Modul CRM Avansat', 8.0, 800.78, 6406.24), ('CMD-400032', 'Custom Connector ERP', 8.0, 785.68, 6285.44), ('CMD-400029', 'Abonament Platforma B2B', 10.0, 553.32, 5533.2)]

[valoare RON] n=43 min=519.51 p5=864.65 p25=3211.00 median=4738.32 mean=10930.09 p75=14701.14 p95=37725.60 max=41901.70 sd=11568.07 zeros=0 neg=0
   Livrată  n= 11 sum=83,969.24
   Retur    n=  7 sum=70,738.79
   Anulată  n=  8 sum=154,342.62
   În curs  n= 17 sum=160,943.09
   TOTAL    n= 43 sum=469,993.74
   top orders: [('CMD-400017', 'Audit Conformitate GDPR', 10.0, 4190.17, 41901.7), ('CMD-400001', 'Abonament Platforma B2B', 10.0, 4017.69, 40176.9), ('CMD-400022', 'Audit Conformitate GDPR', 10.0, 3785.5, 37855.0)]

=== Delivered revenue by month x currency ===
   ('2026-03', 'EUR') 260.06
   ('2026-03', 'RON') 6,263.25
   ('2026-04', 'EUR') 1,963.83
   ('2026-04', 'RON') 4,509.85
   ('2026-05', 'EUR') 935.29
   ('2026-05', 'RON') 7,399.20
   ('2026-06', 'EUR') 1,738.57
   ('2026-06', 'RON') 22,470.43
   ('2026-07', 'EUR') 861.95
   ('2026-07', 'RON') 6,111.38
   ('2026-08', 'EUR') 790.89
   ('2026-08', 'RON') 37,215.13

=== Product -> price consistency (per currency) ===
  ('abonament platforma b2b', 'EUR'): n=5 min=75.19 max=811.81 ratio=10.8
  ('abonament platforma b2b', 'RON'): n=1 min=4017.69 max=4017.69 ratio=1.0
  ('audit conformitate gdpr', 'EUR'): n=2 min=485.08 max=790.89 ratio=1.6
  ('audit conformitate gdpr', 'RON'): n=8 min=1715.39 max=4604.49 ratio=2.7
  ('custom connector erp', 'EUR'): n=5 min=245.94 max=785.68 ratio=3.2
  ('custom connector erp', 'RON'): n=7 min=417.45 max=4563.10 ratio=10.9
  ('instalare & configurare on-prem', 'EUR'): n=1 min=320.45 max=320.45 ratio=1.0
  ('instalare & configurare on-prem', 'RON'): n=5 min=445.66 max=3257.73 ratio=7.3
  ('modul crm avansat', 'EUR'): n=4 min=83.28 max=800.78 ratio=9.6
  ('modul crm avansat', 'RON'): n=6 min=303.19 max=3650.76 ratio=12.0
  ('pachet securitate endpoint', 'EUR'): n=2 min=533.89 max=736.57 ratio=1.4
  ('pachet securitate endpoint', 'RON'): n=4 min=942.00 max=3979.55 ratio=4.2
  ('suport dedicat vip', 'EUR'): n=3 min=57.60 max=525.15 ratio=9.1
  ('suport dedicat vip', 'RON'): n=5 min=415.86 max=2731.27 ratio=6.6
  ('training utilizatori finali', 'EUR'): n=3 min=361.85 max=749.20 ratio=2.1
  ('training utilizatori finali', 'RON'): n=7 min=332.55 max=4359.41 ratio=13.1

=== Totals rows vs computed ===
  line 20 ['TOTAL PARTIAL', 'RON', '154.372,03']
  line 38 ['TOTAL PARTIAL', 'RON', '117.394,84']
  line 55 ['TOTAL PARTIAL', 'RON', '81.421,23']
  line 82 ['TOTAL GENERAL', 'RON', '478.339,90']
```

## Anexa D — Verificarea rândurilor de total și a ponderilor

Script (`b2b_totals.py`):

```python
import csv
rows=list(csv.reader(open("vanzari_enterprise_b2b_2026.csv",encoding="utf-8",newline="").read().splitlines()))
n=lambda s: float(s.strip().replace(".","").replace(",","."))
seg=[];allr=[]
for i,r in enumerate(rows[5:],start=6):
    if not any(c.strip() for c in r): continue
    if r[0].startswith("TOTAL"):
        print(i,r[0],r[6],"seg n=",len(seg),"all=",round(sum(v for v,_ in seg),2),"RON=",round(sum(v for v,c in seg if c=="RON"),2)); seg=[]; continue
    v=n(r[4])*n(r[6]); seg.append((v,r[5])); allr.append((v,r[5]))
print("RON all rows:",round(sum(v for v,c in allr if c=="RON"),2),"mixed:",round(sum(v for v,_ in allr),2))
R=481292.55;E=40534.63
for k,a,b in [("livrat",95268.05,6550.59),("pierdut",225081.41,24458.20),("in curs",160943.09,9525.84),("retur",70738.79,11818.64),("anulat",154342.62,12639.56)]:
    print(k,f"RON {a/R*100:.1f}%  EUR {b/E*100:.1f}%")
print("rata retur (nr)",round(9/69*100,1),"anulare",round(12/69*100,1),"in curs",round(27/69*100,1))
print("fara conflict: livrat RON share",round(83969.24/469993.74*100,1))
```

Ieșire:

```text
20 TOTAL PARTIAL 154.372,03 seg n= 14 all= 154372.03 RON= 151588.59
38 TOTAL PARTIAL 117.394,84 seg n= 16 all= 117394.84 RON= 99771.41
55 TOTAL PARTIAL 81.421,23 seg n= 15 all= 81421.23 RON= 75102.37
82 TOTAL GENERAL 478.339,90 seg n= 24 all= 168639.08 RON= 154830.18
RON all rows: 481292.55 mixed: 521827.18
livrat RON 19.8%  EUR 16.2%
pierdut RON 46.8%  EUR 60.3%
in curs RON 33.4%  EUR 23.5%
retur RON 14.7%  EUR 29.2%
anulat RON 32.1%  EUR 31.2%
rata retur (nr) 13.0 anulare 17.4 in curs 39.1
fara conflict: livrat RON share 17.9
```
