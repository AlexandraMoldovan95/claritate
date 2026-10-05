# CLAUDE.md — Dashboard din CSV (temă Vibe Coding, stepIT)

Scris înainte de cod. Citește-l la începutul fiecărei sesiuni. Detaliile de design sunt în `DESIGN.md`, planul pe piese în `PLAN.md`, cerința originală în `TASK.md`, plugin-urile în `PLUGINURI.md`.

## Ce construim

O aplicație web publică (merge și pe telefon) în care urci un CSV și primești automat:
1. structura detectată și datele curățate (cu raport despre ce s-a eliminat și de ce);
2. **6 dashboard-uri** cu cifre cheie, tabele și grafice;
3. un câmp în care pui o întrebare în română despre date și primești răspuns.

## Reguli din temă (nenegociabile)

- **Trebuie să meargă cu orice CSV**, nu doar cu cele 4 din folder. Coloanele pot fi în orice ordine și pot lipsi.
- **Nu se blochează pe date murdare**: rânduri goale, sume scrise ca text, același nume scris în trei feluri, rânduri de total intercalate.
- **Modelul nu calculează numere.** El alege *ce* se calculează; codul face aritmetica.
- Se predau: `PLAN.md` (10 rânduri, scris înainte de cod) + linkul aplicației.

## Decizii luate (cu utilizatoarea)

| Decizie | Ce am ales | De ce |
|---|---|---|
| Hosting | **Val Town** (cont gratuit) | Cerut de temă; server + SQLite + link public, fără Netlify (fără credite acolo). |
| Întrebări în română | **`std/openai` din Val Town**, fără cheie API proprie | Val Town oferă gratuit modele mici (ex. `gpt-5.4-nano`) fără cheie. Respectă „modelul alege, codul calculează”. |
| Denumiri | **Venit livrat / Venit pierdut** | CSV-urile nu au costuri, deci nu există „profit” sau „pierdere” contabilă. „Pierdut” = Retur + Anulată. |
| Chei API | **Niciuna în cod sau în repo** | Nu avem nevoie; `std/openai` se autentifică prin contul Val Town. |

## Stack și structură

- **Val Town**, un singur proiect (HTTP val), TypeScript pe Deno, router **Hono**.
- **SQLite** (`https://esm.town/v/std/sqlite`) — stochează upload-urile și rezultatele.
- **Model**: `https://esm.town/v/std/openai/main.ts`, model mic (`gpt-5.4-nano`), `max_completion_tokens` mic, `response_format` JSON.
- **Frontend**: HTML + CSS + JS vanilla servite de același val, fără build step. Grafice **SVG desenate în `app.js`** (fără Chart.js/CDN), redimensionate la lățimea cardului; paleta de status validată cu scriptul dataviz (`#059669` Livrată, `#4F46E5` În curs, `#D97706` Retur, `#E11D48` Anulată). Font **Plus Jakarta Sans**.

```
main.ts                     HTTP val (Val Town): leagă aplicația de std/sqlite, std/openai, std/utils
dev.ts                      server local pentru teste (stocare în memorie, fără model → doar reguli)
deno.json                   `deno task dev` (local, port 8787) · `deno task test`
backend/app.ts              rutele Hono; nu depinde de Val Town (stocarea și modelul vin din afară)
backend/db.ts               tabelul SQLite `csv_uploads_v1` + variantă în memorie
backend/core/csv.ts         citire CSV robustă (ghilimele, separator , ; tab |, CRLF, BOM)
backend/core/normalize.ts   numere RO/EN, date, statusuri, monede
backend/core/detect.ts      găsește rândul de antet + rolul fiecărei coloane
backend/core/clean.ts       curățare deterministă + raport de rânduri eliminate
backend/core/aggregate.ts   cele 6 dashboard-uri (doar aritmetică în cod)
backend/core/analyze.ts     pipeline complet: text → analiză + rânduri curate
backend/core/ask.ts         întrebare → plan JSON (model sau reguli) → validare → calcul (cod)
frontend/index.html         pagina (upload, dashboard-uri, întrebări)
frontend/app.js             UI + grafice SVG (textContent peste tot, niciun innerHTML cu date)
frontend/styles.css         token-uri din DESIGN.md
tests/core_test.ts          8 teste Deno: cifrele de referință, CSV sintetic murdar, plan invalid
examples/                   cele 4 CSV-uri din temă, servite ca „încearcă un exemplu”
```

Rute: `GET /` (pagina), `POST /api/upload` (multipart, max 5 MB), `GET /api/d/:id` (rezultatul unui upload), `POST /api/d/:id/ask` (întrebare), `GET /d/:id` (link de partajat către un dashboard), `GET /examples/:name`, `POST /api/d/:id/roles` (corectarea manuală a rolului unei coloane).

## Datele de test (ce murdărie există în realitate)

4 fișiere în folder: `vanzari_2026.csv`, `vanzari_distributie_2026.csv`, `vanzari_enterprise_b2b_2026.csv`, `vanzari_servicii_cloud_2026.csv`. Toate au aceleași 8 coloane — `Nr comanda, Data, Client, Produs, Cantitate, Pret unitar, Valuta, Status` — dar **în ordine diferită** în fiecare fișier. Probleme găsite:

- 3 rânduri de preambul narativ (`EXPORT VANZARI — sistem intern`, `Perioada: …`, `Generat automat…`) + un rând gol înainte de antet;
- rânduri `TOTAL PARTIAL` și `TOTAL GENERAL` intercalate (au sumă, dar nu sunt comenzi);
- rânduri complet goale (`,,,,,,,`);
- sume în format RO între ghilimele: `"1.841,86"`;
- status scris în mai multe feluri: `Livrata`, ` Livrata`, `LIVRATA`, `livrata`, `Livrata ` (la fel Retur, Anulata, In curs);
- clienți cu spații/majuscule diferite: ` Med Expert Clinic `, `solaris energy`, `Solaris Energy`;
- comenzi duplicate (ex. `CMD-100043` apare de două ori);
- două monede în același fișier (RON, EUR); `Pret unitar` e preț pe bucată, nu valoarea comenzii;
- CRLF într-un fișier, LF în celelalte.

## Detectarea structurii (`detect.ts`)

1. **Rândul de antet** = primul rând cu ≥ 2 celule nevide, majoritatea non-numerice, urmat de rânduri cu același număr de coloane. Totul înainte e preambul (păstrat ca „titlu/perioadă” dacă arată ca atare).
2. **Separator**: `,` sau `;` (sau tab) — cel care dă cel mai constant număr de coloane pe primele 20 de rânduri.
3. **Rolul coloanelor** — întâi după nume (normalizat: fără diacritice, lowercase), apoi confirmat după conținut:

| Rol | Nume recunoscute (exemple) | Confirmare după conținut |
|---|---|---|
| `id` | nr comanda, id, cod, nr factura, order id | valori mai mult unice |
| `date` | data, date, zi, data comenzii | ≥ 80% se parsează ca dată |
| `quantity` | cantitate, qty, buc, quantity | numere întregi mici |
| `unit_price` | pret unitar, pret, unit price, price | numere |
| `amount` | valoare, total, suma, amount, venit | numere (folosit dacă nu există cantitate × preț) |
| `currency` | valuta, moneda, currency | coduri de 3 litere |
| `status` | status, stare, state | puține valori distincte |
| `category` | client, produs, categorie, regiune, agent… | text cu puține valori distincte față de nr. de rânduri |

Dacă numele nu spune nimic, rolul se deduce din conținut. Utilizatorul vede rolurile detectate și le poate corecta dintr-un dropdown (recalculare imediată).

## Curățare (`clean.ts`) — deterministă, în ordinea asta

1. Trim pe fiecare celulă; `""`, `-`, `N/A` → gol.
2. Elimină rândurile complet goale.
3. Elimină rândurile de total: prima celulă nevidă conține `total`, `subtotal`, `sumar`, `grand total` (fără diacritice, orice majuscule) **sau** rândul are doar sumă și restul gol.
4. Numere: acceptă `1.234,56`, `1,234.56`, `1234.56`, `1 234,56`, cu sau fără ghilimele/monedă; decide separatorul zecimal după ultima apariție a `,`/`.` și numărul de cifre după el.
5. Date: `dd.mm.yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd`; date invalide → rândul rămâne, dar e exclus din graficele pe lună (numărat în raport).
6. Text categoric: spații multiple → unul, apoi o **cheie de grupare** fără diacritice/lowercase; afișarea folosește forma cea mai frecventă (ex. `Solaris Energy`). La egalitate: preferă forma care nu e toată cu minuscule sau toată cu majuscule, apoi prima apariție (ex. `Muntenia Telecom` 2× vs `muntenia telecom` 2× → `Muntenia Telecom`).
7. Status: normalizat la `Livrată`, `Retur`, `Anulată`, `În curs` prin sinonime (`livrat*`, `delivered`, `retur*`, `return*`, `anulat*`, `cancel*`, `in curs`, `pending`, `in progress`…); necunoscut → păstrat ca atare.
8. Deduplicare pe `id` (dacă există): rândurile identice după ID se păstrează o dată; ID-uri identice cu conținut diferit se marchează în raport, nu se șterg în tăcere. **Decizie**: ambele rânduri rămân și intră în toate calculele, cu avertisment vizibil în raportul de curățare și în dashboard-ul Top clienți (ex. `CMD-400003` în `vanzari_enterprise_b2b_2026.csv` → 69 de comenzi, nu 68).
9. **Raport de curățare** afișat în UI: câte rânduri citite, câte eliminate și de ce (gol / total / duplicat / fără valoare), câte valori reparate.

## Valoare și monede

- `valoare = cantitate × preț unitar` dacă ambele există; altfel coloana `amount`; altfel dashboard-urile de venit arată doar numărători.
- **Fiecare sumă se calculează și se afișează pe monedă separat.** Nicio conversie RON↔EUR, niciun curs. În KPI-uri: „RON 1.234.567,89 · EUR 45.678,90”.
- Formatare numere în stil românesc (`Intl.NumberFormat('ro-RO')`).

## Cele 6 dashboard-uri (`aggregate.ts`)

| # | Nume | Ce arată | Grafic | Dacă lipsesc date |
|---|---|---|---|---|
| 1 | **Sumar general** | nr. comenzi valide, valoare totală / monedă, valoare medie **și mediana** pe comandă, perioada, nr. clienți și produse, raportul de curățare | KPI + bară pe status | merge cu orice CSV (măcar numărători) |
| 2 | **Venit livrat** | doar status Livrată: total / monedă, evoluție pe lună, top produse | linie pe lună | fără `status` → tratează toate rândurile ca venit și spune asta |
| 3 | **Venit pierdut** | Retur + Anulată: total / monedă, % din total, pe tip (retur vs anulare), clienții cu cele mai multe pierderi | bare stivuite | fără `status` → mesaj „nu există coloană de status” |
| 4 | **Cea mai bună / cea mai slabă lună** | venit livrat pe lună, luna maximă și minimă, variația față de luna anterioară | bare pe lună, extremele evidențiate | fără `date` → mesaj explicit |
| 5 | **Top clienți și produse** | top 10 după venit livrat, cu ponderea din total | bare orizontale | folosește prima coloană `category` disponibilă |
| 6 | **Sănătatea comenzilor** | distribuția pe status, rata de retur, rata de anulare, valoarea blocată în „În curs” | donut | fără `status` → mesaj explicit |

„Luna” = anul + luna din coloana `date`. Best/worst month se calculează pe fiecare monedă.

Reguli pentru dashboard-ul 4:
- Lunile **cu comenzi, dar fără venit livrat** intră în calcul cu 0 și pot fi „cea mai slabă lună”; se afișează explicit (ex. „ian. și feb. 2026: nicio comandă livrată”). Lunile fără nicio comandă nu se afișează.
- Ultima lună din date se marchează **„lună incompletă”** dacă datele se opresc înainte de sfârșitul ei (ultima dată < ultima zi a lunii).

## Întrebări în română (`ask.ts`)

1. Modelul primește **doar** întrebarea + schema: coloanele cu rolul lor, valorile distincte ale coloanelor categorice (max 50), intervalul de date, monedele. **Nu primește rândurile și nu primește cifre.**
2. Întoarce un plan JSON strict, de forma:
   `{ "metric": "sum|count|avg|min|max|share", "field": "valoare|cantitate|<coloana>", "filters": [{ "column": "...", "op": "eq|in|between|contains", "value": ... }], "groupBy": "<coloana>|luna|null", "sort": "desc|asc", "limit": 10, "answerable": true }`
3. Codul **validează** planul (coloane existente, operații permise; altfel „Nu pot răspunde din aceste date”), îl execută și **construiește singur propoziția** din șablon (ex. „Venitul livrat de la Solaris Energy în martie 2026: RON 12.345,67”), plus tabelul folosit. Utilizatorul vede și planul („Am calculat: suma valorii, filtrat pe…”) — transparent.
4. **Plasă de siguranță** (`guardPlan`): dacă planul modelului contrazice ce scrie explicit în întrebare, codul îl corectează înainte de calcul — statusul cerut („retururi” = doar Retur, „anulări” = doar Anulată, „pierdut” = ambele) și „cel mai / cea mai …” = o singură grupă (cu egalitățile păstrate), „cea mai bună/slabă lună” = după venit livrat. Motiv: live, `gpt-5.4-nano` a răspuns la „cea mai slabă lună” cu toate lunile, fără status, și la „retururi” a adăugat și Anulată. Testat în `tests/core_test.ts`.
5. Model indisponibil / limită atinsă (10 cereri/minut pe planul gratuit) → trece automat pe planificatorul pe reguli (`rulePlan`); sub răspuns scrie „plan ales de: model” sau „reguli”, iar în logurile Val Town apare `[ask] model … a întors planul` sau `[ask] model indisponibil`.
6. **Orice CSV:** schema trimisă modelului conține și numele real al coloanei numerice (`"column": "Nota"` lângă `valoare`); planurile care folosesc numele real sunt acceptate, iar răspunsul afișează numele real („Media (Nota)”). Dacă modelul zice „nu se poate”, dar regulile înțeleg întrebarea, răspund regulile. Testat live pe un CSV de note școlare.

## Securitate și robustețe

- Fără chei API în cod. Toate interogările SQLite parametrizate.
- **Tot textul din CSV e escapat** înainte de afișare (CSV-ul poate conține HTML/JS).
- Limită 5 MB / 50.000 rânduri; fișier ne-CSV → mesaj prietenos, nu eroare 500.
- Datele urcate sunt vizibile oricui are linkul `/d/:id` — spus clar în UI („Nu urca date confidențiale”).

## Design

Stilul „**Corporate Trust**” din `designer_agent..md`, adaptat pentru HTML/CSS vanilla în `DESIGN.md`. Mobil întâi (375px), fără scroll orizontal, ținte tactile ≥ 44px, contrast WCAG AA, `prefers-reduced-motion` respectat.

## Plugin-uri — cine ce folosește

Codul îl scrie Claude (Cowork) în acest folder; plugin-urile rulează în **Claude Code**, pe calculatorul utilizatoarei.

| Plugin | Marketplace | Pentru ce |
|---|---|---|
| `valtown` | `claude-plugins-official` | creare val, SQLite, deploy, loguri |
| `data` | `knowledge-work-plugins` (`anthropics/knowledge-work-plugins`) | `/data:explore-data`, `/data:validate-data` pe CSV-uri (rezultatele salvate în `docs/`) |
| `impeccable` | `pbakaus/impeccable` | audit design/accesibilitate pe linkul live |

În README se trec doar plugin-urile folosite efectiv, cu ce a făcut fiecare concret.

## Definiția de „gata”

- [x] Link public Val Town, merge pe telefon (375px, fără scroll orizontal) — https://claritate.val.run
- [x] Cele 4 CSV-uri din temă + 1 CSV murdar inventat (`;`, format EN, fără status, coloane lipsă) dau dashboard-uri corecte, fără erori
- [x] Totalurile verificate independent (script separat) pe cel puțin 2 fișiere — `tests/core_test.ts` compară cu `docs/`
- [x] Nicio cifră din răspunsuri nu vine de la model (modelul întoarce doar un plan JSON; testat și cu un plan invalid)
- [x] Impeccable rulat, problemele reale reparate (15/20 înainte; ținte 44px, contrast AA, titluri h1→h2)
- [x] `README.md` (prezentare + plugin-uri) · [x] mesajul pentru profesor
