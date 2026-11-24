# CLAUDE.md — Dashboard din CSV/Excel (Claritate)

Citește-l la începutul fiecărei sesiuni. Detaliile de design sunt în `DESIGN.md`, planul inițial pe piese în `PLAN.md` (istoric — scris pentru versiunea Val Town), cerința inițială în `materiale-referinta/brief.md`, plugin-urile originale în `materiale-referinta/PLUGINURI.md`.

**Status: live pe Vercel.** https://claritate.vercel.app — construit inițial pe Val Town, migrat integral pe Vercel când Val Town s-a închis. Migrarea și tot ce s-a schimbat față de varianta Val Town (runtime, rute, stocare) sunt documentate pe larg în `README-VERCEL.md`; secțiunile de mai jos descriu **starea curentă**, nu varianta originală.

## Ce construim

O aplicație web publică (merge și pe telefon) în care urci un fișier **CSV sau Excel** (`.xlsx`/`.xlsm`/`.xls`) și primești automat:
1. structura detectată și datele curățate (cu raport despre ce s-a eliminat și de ce);
2. **6 dashboard-uri** cu cifre cheie, tabele și grafice, plus un **tabel pivot** configurabil;
3. un câmp în care pui o întrebare în română despre date și primești răspuns;
4. un **raport gata de trimis** (tot fișierul sau o lună), salvat ca PDF din browser;
5. **comparație între două fișiere** (două perioade sau două sedii), cu întrebări pe comparație.

## Cerințe de produs (nenegociabile)

- **Trebuie să meargă cu orice CSV sau Excel**, nu doar cu cele 4 din folder. Coloanele pot fi în orice ordine, pot lipsi, pot fi în orice limbă — detectarea e după conținut, nu după un șablon fix. Verificat explicit cu fișiere reordonate/redenumite (vezi `scripts/validate-shapes.ts`).
- **Nu se blochează pe date neconforme**: rânduri goale, sume scrise ca text, același nume scris în trei feluri, rânduri de total intercalate (în orice coloană, nu doar prima).
- **Modelul nu calculează numere.** El alege *ce* se calculează; codul face aritmetica. (Pe Vercel nu e conectat niciun model — vezi mai jos.)
- Livrabile: `PLAN.md` (10 rânduri, scris înainte de cod, istoric) + linkul aplicației.

## Decizii de produs

| Decizie | Ce am ales | De ce |
|---|---|---|
| Hosting | **Vercel** (migrat de pe Val Town) | Val Town s-a închis. Cod fără build step (`backend/core/*` nu s-a schimbat deloc), funcție serverless Node.js + fișiere statice pe CDN. Detalii și probleme întâlnite în `README-VERCEL.md`. |
| Format fișiere | **CSV și Excel** (`.xlsx`/`.xlsm`/`.xls`) | Un angajator care testează aplicația cu propriile date are șanse mari să aibă un Excel, nu un CSV. Detectat după extensie **și** după semnătura reală a fișierului (octeții ZIP/OLE), ca să prindem și fișiere redenumite greșit. |
| Pachetul de citit Excel | **SheetJS de pe CDN-ul lor oficial** (`xlsx@0.20.3`), nu versiunea de pe npm (`0.18.5`) | Versiunea de pe npm are 2 vulnerabilități cunoscute, de severitate mare (poluare de prototip, ReDoS), nereparate acolo — relevante exact aici, unde oricine poate urca un fișier. |
| Întrebări în română | **Cod, nu AI:** planificator pe reguli (`rulePlan`), fără model și fără cheie API — spus explicit în pagină, README și sub fiecare răspuns. Modul AI e doar pregătit, pentru viitor | Pe Val Town folosea `std/openai` gratuit, fără cheie. Pe Vercel nu există echivalent gratuit; nu s-a adăugat o cheie plătită, deci întrebările merg mereu prin reguli — funcționează, înțelege mai puține formulări decât modelul. |
| Denumiri | **Venit livrat / Venit pierdut** | CSV-urile nu au costuri, deci nu există „profit” sau „pierdere” contabilă. „Pierdut” = Retur + Anulată. |
| Chei API | **Niciuna în cod sau în repo** | Stocarea (Upstash Redis) se autentifică prin variabile de mediu puse automat de integrarea Vercel. |

## Stack și structură

- **Vercel**, funcție serverless **Node.js** (nu Edge — pe Edge, rutele catch-all cu 2+ segmente sub `/api/...` dădeau 404 direct de la platformă, pe orice proiect fără framework; vezi `README-VERCEL.md`), TypeScript, router **Hono**, pachete npm.
- **Stocare**: Upstash Redis (prin integrarea Vercel Marketplace) — `vercelKvStore()` din `backend/db.ts`. TTL 90 de zile per upload.
- **Model**: niciunul conectat — `backend/core/ask.ts` răspunde mereu prin `rulePlan` (planificatorul pe reguli).
- **Excel**: `xlsx` (SheetJS, de pe CDN-ul lor, nu npm) — prima foaie cu date e convertită în text CSV înainte să intre în pipeline-ul existent (`backend/app.ts`, `spreadsheetToCsv()`), care rămâne neschimbat.
- **Frontend**: HTML + CSS + JS vanilla, servite ca fișiere statice din `public/` (CDN Vercel, nu prin funcție). Grafice **SVG desenate în `app.js`** (fără Chart.js/CDN), redimensionate la lățimea cardului; paleta de status validată cu scriptul dataviz (`#059669` Livrată, `#4F46E5` În curs, `#D97706` Retur, `#E11D48` Anulată). Font **Plus Jakarta Sans**. **Temă deschisă / închisă** (dark mode): buton în antet; implicit după setarea dispozitivului, alegerea se ține minte în browser; culorile sunt variabile CSS (`[data-theme="dark"]` în `styles.css`), deci și graficele se schimbă singure; raportul se tipărește mereu pe alb.

```
api/[...route].ts           funcția Node.js (Vercel) — punctul de intrare activ
api/_examples.generated.ts  cele 5 CSV-uri demo, embedate — se regenerează cu `npx tsx scripts/generate-examples.ts` după orice schimbare în public/examples/
backend/app.ts              rutele Hono + detectarea/conversia fișierelor Excel înainte de analyze()
backend/db.ts                vercelKvStore() (activ, Upstash Redis) · sqliteStore()/memoryStore() (istoric/teste locale)
backend/core/csv.ts         citire CSV robustă (ghilimele, separator , ; tab |, CRLF, BOM)
backend/core/normalize.ts   numere RO/EN, date, statusuri, monede
backend/core/detect.ts      găsește rândul de antet + rolul fiecărei coloane (independent de ordine/nume)
backend/core/clean.ts       curățare deterministă + raport de rânduri eliminate
backend/core/aggregate.ts   cele 6 dashboard-uri (doar aritmetică în cod)
backend/core/analyze.ts     pipeline complet: text → analiză + rânduri curate
backend/core/ask.ts         întrebare → plan JSON (reguli, fără model) → validare → calcul (cod)
backend/core/pivot.ts       tabel pivot: rânduri × coloane × valoare, cu totaluri + export CSV
backend/core/compare.ts     comparație 2 fișiere: potrivire coloane, FULL OUTER JOIN pe valori, întrebări pe ambele
public/                     fișiere statice servite direct de Vercel: index.html, frontend/, examples/, og.jpg
vercel.json                 rewrite /d/:id → /index.html, ca linkurile de dashboard partajate să funcționeze
scripts/smoke-test.ts              backend/app.ts + db.ts rulează corect sub Node real cu hono din npm
scripts/smoke-test-node-handler.ts simulează exact invocarea Vercel (http.createServer + getRequestListener)
scripts/validate-shapes.ts         CSV-uri cu coloane în altă ordine/denumire/mai puține sau mai multe — fără model fix
scripts/validate-xlsx.ts           un .xlsx real (nu CSV redenumit), cu mai multe foi, date/numere native Excel
scripts/validate-upload-xlsx.ts    /api/upload cu .xlsx prin multipart, inclusiv fișier fără extensia corectă în nume
tests/core_test.ts          10 teste Deno: cifrele de referință, CSV sintetic neconform, plan invalid (rulate în CI la fiecare push: .github/workflows/tests.yml)
PLAN.md · CLAUDE.md · DESIGN.md · docs/ · README.md · README-VERCEL.md

legacy/                     varianta originală Val Town/Deno (frontend/, examples/, main.ts, dev.ts) — doar istoric, nu mai rulează;
                            public/ e copia activă. deno.json rămâne în rădăcină pentru `deno task test`.
```

Rute active: `GET /` (pagina), `POST /api/upload` (multipart sau JSON, CSV **sau** Excel, max 5 MB), `GET /api/view?id=` (rezultatul unui upload), `POST /api/set-roles?id=` (corectarea manuală a rolului unei coloane), `POST /api/ask?id=` (întrebare; `&format=csv` = comenzile folosite), `GET /api/pivot?id=&rows=&cols=&measure=&currency=&month=` (pivot; `&format=csv`), `GET /api/report?id=&month=` (datele raportului), `GET /api/compare?a=&b=&currency=` (comparație), `POST /api/compare-ask?a=&b=` (întrebare pe comparație), `GET /c/:a/:b` (link de partajat pentru comparație, rescris către `/index.html`), `GET /d/:id` (link de partajat, rescris către `/index.html`), `GET /api/examples`, `GET /examples/:name`, `GET /api/roles`.

**De ce `?id=` și nu `/api/view/:id`:** pe Vercel, orice rută `/api/...` cu 2+ segmente de path dădea 404 direct de la platformă, înainte să ajungă la funcție — indiferent de runtime sau de configurarea din `vercel.json`. Cauza exactă nu a fost găsită după o investigație extinsă; rutele cu un singur segment sub `/api/...` au mers mereu fără probleme, deci id-ul dashboard-ului s-a mutat din path în query string. Detalii în `README-VERCEL.md`.

## Datele de test (ce neconformități există în realitate)

**Exemplul 5, `vanzari_2025.csv`** (adăugat 15 nov. 2026): aceeași firmă ca `vanzari_2026.csv`, cu un an în urmă — generat din el (date mutate în 2025, cantități/prețuri ușor schimbate, ~15% din comenzi scoase, „Jupiter Media” scos ca să apară „nou” în 2026, „Vechi Partener SRL” adăugat ca să apară „dispărut”), cu aceeași murdărie de export. Folosit de butonul „Încearcă o comparație: 2025 → 2026” de pe pagina de start.

4 fișiere CSV în `public/examples/` (originalele): `vanzari_2026.csv`, `vanzari_distributie_2026.csv`, `vanzari_enterprise_b2b_2026.csv`, `vanzari_servicii_cloud_2026.csv`. Toate au aceleași 8 coloane — `Nr comanda, Data, Client, Produs, Cantitate, Pret unitar, Valuta, Status` — dar **în ordine diferită** în fiecare fișier. Probleme găsite:

- 3 rânduri de preambul narativ (`EXPORT VANZARI — sistem intern`, `Perioada: …`, `Generat automat…`) + un rând gol înainte de antet;
- rânduri `TOTAL PARTIAL` și `TOTAL GENERAL` intercalate (au sumă, dar nu sunt comenzi);
- rânduri complet goale (`,,,,,,,`);
- sume în format RO între ghilimele: `"1.841,86"`;
- status scris în mai multe feluri: `Livrata`, ` Livrata`, `LIVRATA`, `livrata`, `Livrata ` (la fel Retur, Anulata, In curs);
- clienți cu spații/majuscule diferite: ` Med Expert Clinic `, `solaris energy`, `Solaris Energy`;
- comenzi duplicate (ex. `CMD-100043` apare de două ori);
- două monede în același fișier (RON, EUR); `Pret unitar` e preț pe bucată, nu valoarea comenzii;
- CRLF într-un fișier, LF în celelalte.

**Teste adăugate ulterior**, pentru cazuri pe care cele 4 fișiere nu le acopereau (`scripts/validate-shapes.ts`, `validate-xlsx.ts`):
- coloane în altă ordine, denumite altfel (inclusiv în engleză), mai puține sau mai multe decât cele 8 din fișierele demo, inclusiv fără coloană de client/produs/status/monedă;
- un `.xlsx` real cu 2 foi (prima aproape goală — testează alegerea automată a foii cu date), cu celule native Excel de tip Dată și Număr (nu text), rând gol/duplicat/total intercalate;
- un rând de total cu eticheta în **ultima** coloană (nu prima) — a scos la iveală un bug real în `clean.ts` (vezi secțiunea de curățare de mai jos), reparat.

## Detectarea structurii (`detect.ts`)

1. **Rândul de antet** = primul rând cu ≥ 2 celule nevide, majoritatea non-numerice, urmat de rânduri cu o lățime compatibilă. Totul înainte e preambul (păstrat ca „titlu/perioadă” dacă arată ca atare).
2. **Separator**: `,` sau `;` (sau tab) — cel care dă cel mai constant număr de coloane pe primele 20 de rânduri.
3. **Rolul coloanelor** — întâi după nume (normalizat: fără diacritice, lowercase), apoi confirmat după conținut:

| Rol | Nume recunoscute (exemple) | Confirmare după conținut |
|---|---|---|
| `id` | nr comanda, id, cod, nr factura, order id | valori mai mult unice |
| `date` | data, date, zi, data comenzii | ≥ 80% se parsează ca dată |
| `quantity` | cantitate, cant., qty, buc, quantity | numere întregi mici |
| `unit_price` | pret unitar, pret, unit price, price | numere |
| `amount` | valoare, total, suma, amount, venit | numere (folosit dacă nu există cantitate × preț) |
| `currency` | valuta, moneda, currency | coduri de 3 litere |
| `status` | status, stare, state | puține valori distincte |
| `category` | client, produs, categorie, regiune, agent… | text cu puține valori distincte față de nr. de rânduri |

Dacă numele nu spune nimic, rolul se deduce din conținut. Utilizatorul vede rolurile detectate și le poate corecta dintr-un dropdown (recalculare imediată).

## Format Excel (`.xlsx`/`.xlsm`/`.xls`)

- Detectat în `backend/app.ts` prin extensie **și** prin semnătura fișierului (ZIP pentru `.xlsx`/`.xlsm`, OLE/CFB pentru `.xls`) — merge și dacă fișierul e redenumit greșit sau trimis fără extensie corectă.
- Se alege automat **foaia cu cele mai multe celule completate** (nu prima foaie: un sumar/pivot pus primul era analizat în locul datelor — bug real, reparat).
- Foaia aleasă e convertită în text CSV **înainte** să intre în `analyze()` — restul pipeline-ului (detectare, curățare, agregare) nu știe și nu trebuie să știe că fișierul original era Excel.
- **Se folosește valoarea celulei, nu textul afișat.** Varianta veche (`sheet_to_csv`) exporta textul formatat în stil american — `2,400` pentru 2400 și `3/14/26` pentru date — iar curățarea (gândită pentru format românesc) le citea greșit: **sume de 1000× mai mici** și **zi↔lună inversate** când toate zilele erau ≤ 12. Acum numerele ies cu virgulă zecimală, fără separator de mii (`1234,5`), iar datele ies ISO (`2026-03-14`), citite din codul de dată Excel (fără fus orar).

## Curățare (`clean.ts`) — deterministă, în ordinea asta

1. Trim pe fiecare celulă; `""`, `-`, `N/A` → gol.
2. Elimină rândurile complet goale.
3. Elimină rândurile de total: eticheta (`total`, `subtotal`, `sumar`, `grand total`, fără diacritice, orice majuscule) apare în **orice coloană de id sau categorie**, nu neapărat prima celulă din rând — poziția ei depinde de ordinea coloanelor, care diferă de la un export la altul. **(Bug reparat:** varianta veche verifica doar prima celulă nevidă; un fișier cu coloana de ID ultima nu avea rândul de total eliminat. Scos la iveală de `scripts/validate-xlsx.ts`.) La fel dacă rândul **începe** cu eticheta, oricare ar fi rolul coloanei (ex. `TOTAL;;;1650.49`, eticheta în coloana de sumă) — verificarea veche, păstrată lângă cea nouă după ce testul „CSV sintetic” a arătat că fusese pierdută. Alternativ: rândul are doar sumă și restul gol.
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

## Tabel pivot (`pivot.ts`) și raport

- **Pivot** = al 7-lea tab. Rânduri: orice coloană categorică, Lună, Status (sau Monedă, dacă sunt mai multe). Coloane: la fel sau „fără”. Valoare: valoare livrată (implicit), valoare pe toate statusurile, număr de comenzi, cantitate livrată. **Implicit: Client × Lună, valoare livrată** (decizie Meko). Totaluri pe rânduri, coloane și total general; sumele de bani sunt pe moneda aleasă sus (fără conversie). Peste 24 de coloane → restul în „Altele”. Descărcare CSV (`;` + BOM). Prima coloană și rândul de total rămân fixe la derulare; pe telefon tabelul se derulează doar în interiorul lui.
- **Raport** = butonul „Raport PDF” din antet. Perioada: **tot fișierul sau o lună aleasă**. Conține (decizie Meko): cifre cheie + grafic pe luni (graficul doar pe tot fișierul), top clienți și produse, **pivotul configurat în tab**, venit pierdut + ce s-a curățat. „Salvează ca PDF” = tipărirea browserului (`window.print()`), cu stil `@media print` pe A4 — fără bibliotecă și fără server de PDF. Curățarea din raport se referă mereu la tot fișierul.
- **În afara scope-ului (pentru mai târziu):** VLOOKUP / îmbogățire cu un fișier de alt tip (ex. listă de costuri → profit), conturi/date private. Detalii în README → „Next steps”.

## Comparație între două fișiere (`compare.ts`)

- Pentru **același tip de date**: două perioade (2025 vs 2026) sau două sedii. Butonul „Compară cu alt fișier” urcă al doilea fișier; linkul e `/c/<id1>/<id2>`. Fișierele se ordonează cronologic (primul = mai vechi). Etichete: anul, dacă fiecare fișier e într-un singur an; altfel numele fișierelor.
- **Potrivirea coloanelor** (decizie Meko, „ca în SQL”): întâi după nume (fără cuvinte generice: „Nume client” = „Client”), apoi după **valorile comune** (≥ 2 valori comune și ≥ 20% suprapunere). Fiecare coloană e folosită o singură dată. Ce există doar într-un fișier e spus explicit și nu se compară.
- **FULL OUTER JOIN pe valoare** pentru fiecare coloană comună (cheia = textul normalizat): venit livrat în fișierul 1 / 2, diferența, % și eticheta **nou / dispărut / crescut / scăzut** („nou”/„dispărut” după prezența în fișier, pe orice status).
- **Cifre cheie alăturat**: venit livrat, comenzi livrate, valoare medie, toate comenzile, venit pierdut, rata de retur + anulare (diferența în puncte procentuale). Pe moneda aleasă, fără conversie.
- **Lunile**: pe dată, dacă perioadele se suprapun (două sedii); altfel după numele lunii (ianuarie cu ianuarie).
- **Raport PDF al comparației** (butonul din antetul comparației): aceeași fereastră și același stil de tipărire ca raportul unui fișier; conține pe ce se compară, cifrele cheie, lunile (grafic + tabel) și câte un tabel pe fiecare coloană comună (primele 15 după valoare).
- **Întrebări** (`answerCompare`), cu **comenzile folosite din fiecare fișier** sub răspuns (primele 100 + CSV, `?format=csv&side=0|1`): „ce clienți noi am / au dispărut” (diferență de mulțimi); orice altă întrebare = același plan `rulePlan` pe ambele fișiere, apoi alăturat + diferența; „a crescut / a scăzut cel mai mult” = clasament după diferență; „martie” = martie din fiecare fișier când perioadele nu se suprapun; rata de retur = procentul fiecărui fișier. Sumele: implicit doar comenzi livrate.
- Testat cu `A_magazin_online.xlsx` (2026) + un CSV 2025 cu antete diferite („Nume client”, „Agent”), fără „Oraș” și cu un client dispărut — toate cifrele verificate independent.

## Întrebări în română (`ask.ts`)

0. **Starea actuală: răspunsurile sunt 100% cod, fără AI și fără cheie API** — spus explicit în pagină, în README (GitHub) și sub fiecare răspuns („reguli fixe, fără AI”). Pașii 1–4 descriu modul AI **pregătit pentru viitor**, neactivat; detalii și costuri în `README-VERCEL.md` → „Mod AI — luat în calcul pentru viitor”.
1. Dacă ar exista un model conectat, ar primi **doar** întrebarea + schema: coloanele cu rolul lor, valorile distincte ale coloanelor categorice (max 50), intervalul de date, monedele — **niciodată rândurile sau cifrele**. **Pe Vercel nu e conectat niciun model**, deci acest pas nu rulează în practică; întrebările merg direct la planificatorul pe reguli (pasul 5).
2. Planul e un JSON strict, de forma:
   `{ "metric": "sum|count|avg|min|max|share", "field": "valoare|cantitate|<coloana>", "filters": [{ "column": "...", "op": "eq|in|between|contains", "value": ... }], "groupBy": "<coloana>|luna|null", "sort": "desc|asc", "limit": 10, "answerable": true }`
3. Codul **validează** planul (coloane existente, operații permise; altfel „Nu pot răspunde din aceste date”), îl execută și **construiește singur propoziția** din șablon (ex. „Venitul livrat de la Solaris Energy în martie 2026: RON 12.345,67”), plus tabelul folosit. Utilizatorul vede și planul — transparent.
4. **Plasă de siguranță** (`guardPlan`): dacă planul de la model contrazice ce scrie explicit în întrebare, codul îl corectează înainte de calcul — statusul cerut („retururi” = doar Retur, „anulări” = doar Anulată, „pierdut” = ambele) și „cel mai / cea mai …” = o singură grupă, „cea mai bună/slabă lună” = după venit livrat. Se aplică **doar planurilor de la model**; `rulePlan` face deja aceste lucruri singur.
5. **Pe Vercel, mereu `rulePlan`** (planificatorul pe reguli, fără model). Sub răspuns scrie „plan ales de: reguli”. Ce înțelege (testat cu ~80 de întrebări pe Excel-uri realiste + CSV-urile demo, comparate cu cifre calculate independent):
   - **Nume parțiale**, potrivite pe cuvinte cu valorile din orice coloană categorică: „agentul Ionescu” → Ionescu Mihai, „Cluj” → Cluj-Napoca, „de la Hermes” → Hermes Logistics. Dacă un cuvânt se potrivește cu mai multe valori → **întreabă** care („Ionescu Mihai (Agent) sau Ionescu Construct (Client)?”). Ce urmează după numele coloanei („agentul X”) se caută doar în acea coloană.
   - **Coloane după nume și sinonime** (agent/vânzător, oraș/localitate/județ, client/firmă, produs/articol): „cel mai bun agent”, „vânzări pe orașe”, „cât a vândut fiecare agent”.
   - **Perioade**: luni (și mai multe, în ordinea din întrebare), „între februarie și aprilie”, trimestru/Q1, semestru, „ultimele N luni”, „ultima lună”, an; **„martie față de februarie”** → ambele luni + diferența (sumă și %).
   - **Filtre numerice**: „peste/sub/cel puțin/cel mult N lei/euro/bucăți”.
   - **Metrici**: sumă, număr, medie, mediană, **cea mai mare/mică comandă** (cu ID, client, dată, status), **valori distincte** („câți clienți am?”), **procente** („rata de retur”, „ce procent din vânzări vine de la X”), „cele mai multe comenzi/anulări” = numărare.
   - **Regula de bază: refuz în loc de total.** Dacă întrebarea pomenește un nume, oraș, lună sau coloană care nu există în fișier, răspunsul e „Nu găsesc «X» în fișier (am căutat în: …)”, nu totalul firmei. Varianta veche ignora pe tăcute ce nu înțelegea și răspundea convingător la altă întrebare.
   - Interpretările făcute de reguli apar în răspuns („Am înțeles: «Cluj» = Cluj-Napoca (Oraș)”).
6. **Anulate și retururi — decizie de produs:** la sume, medii și clasamente pe valoare, când întrebarea nu cere un status, se calculează **doar comenzile livrate** (la fel ca dashboard-urile „Venit livrat”), iar **anulatele, retururile și cele în curs se arată separat în aceeași propoziție** („Separat, nelivrate: În curs RON … (n comenzi) · Retur … · Anulată …”), ca utilizatorul să vadă tot. La numărători („câte comenzi”) se numără toate, cu defalcarea pe status. Dacă întrebarea cere explicit retururi/anulări/în curs, se răspunde doar la asta. Luna incompletă (ultima lună, dacă datele se opresc înainte de sfârșitul ei) e semnalată direct în răspuns.
7. **Răspunsul e schematic, nu paragraf:** `execute()` întoarce `sections` (titlu + puncte, ex. „Suma (Total), doar comenzi livrate” → „RON 741,17 — 4 comenzi”; „Nelivrate, separat” → „Retur: EUR 57,89 — 1 comandă”) și `notes` (lună incompletă, „Am înțeles: …”, „fără conversie”), afișate ca liste în UI. `text` rămâne, ca variantă lipită, pentru loguri/teste. Tabelul de sub răspuns apare doar când are grupe (clienți, luni…), nu când ar repeta totalul. Antetul tabelului spune exact ce s-a numărat (`table`: ex. „Client | Monedă | Total (doar livrate) | Comenzi livrate”), nu un generic „Comenzi folosite”. „Fiecare client/agent/lună” = toate grupele, nu primele 10.
8. **Comenzile din spatele răspunsului** (`detail`): sub răspuns, „Vezi cele N comenzi folosite” deschide un tabel cu **coloanele fișierului urcat** (în ordinea și cu denumirile lui, inclusiv coloanele pe care aplicația nu le-a recunoscut), plus „Rând” = linia din fișier. Valorile sunt **exact ca în fișier** (`CleanRecord.raw`), necurățate. La Excel înseamnă valoarea celulei din conversie (`1249,9`, `2026-04-07`), nu formatul de afișare — SheetJS formatează în stil american, deci nu ar arăta oricum ca în Excel-ul românesc. În pagină se trimit primele 100 (`DETAIL_ROWS`); „Descarcă toate (CSV)” = `POST /api/ask?id=…&format=csv` (separator `;` + BOM, se deschide direct în Excel). Tabelul se derulează doar în interiorul lui (orizontal și vertical), pagina nu.
9. **Orice CSV/Excel:** schema conține și numele real al coloanei numerice (ex. `"column": "Nota"` lângă `valoare`); planul pe reguli înțelege și denumiri reale de coloană, nu doar „valoare”/„cantitate”. Testat live pe un CSV de note școlare.

## Securitate și robustețe

- Fără chei API în cod. Stocarea (Upstash Redis) se autentifică prin variabile de mediu Vercel.
- **Tot textul din fișier e escapat** înainte de afișare (fișierul poate conține HTML/JS).
- Limită 5 MB / 50.000 rânduri; fișier nerecunoscut (nici CSV, nici Excel valid) → mesaj prietenos, nu eroare 500.
- **Parsarea Excel folosește `xlsx@0.20.3` de pe CDN-ul SheetJS, nu versiunea de pe npm** (`0.18.5`, cu 2 vulnerabilități de severitate mare nereparate acolo) — relevant pentru că aplicația parsează fișiere urcate de public. Dacă se actualizează pachetul, verifică din nou sursa (npm vs CDN-ul lor).
- Datele urcate sunt vizibile oricui are linkul `/d/:id` — spus clar în UI („Nu urca date confidențiale”).

## Design

Stilul „**Corporate Trust**” din `materiale-referinta/design-system.md`, adaptat pentru HTML/CSS vanilla în `DESIGN.md`. Mobil întâi (375px), fără scroll orizontal, ținte tactile ≥ 44px, contrast WCAG AA, `prefers-reduced-motion` respectat.

## Plugin-uri — cine ce folosește (versiunea originală, Val Town)

Codul original a fost scris cu Claude (Cowork) în acest folder; plugin-urile au rulat local, în **Claude Code**. Migrarea pe Vercel și suportul Excel au fost făcute direct în Claude (Cowork), fără plugin-uri.

| Plugin | Marketplace | Pentru ce |
|---|---|---|
| `valtown` | `claude-plugins-official` | creare val, SQLite, deploy, loguri (versiunea originală, acum închisă) |
| `data` | `knowledge-work-plugins` (`anthropics/knowledge-work-plugins`) | `/data:explore-data`, `/data:validate-data` pe CSV-uri (rezultatele salvate în `docs/`) |
| `impeccable` | `pbakaus/impeccable` | audit design/accesibilitate pe linkul live (Val Town) |

## Definiția de „gata”

- [x] Link public, merge pe telefon (375px, fără scroll orizontal) — https://claritate.vercel.app (inițial Val Town, migrat pe Vercel)
- [x] Cele 4 seturi de date demo + CSV-uri neconforme inventate (`;`, format EN, fără status, coloane lipsă, ordine diferită) dau dashboard-uri corecte, fără erori
- [x] Totalurile verificate independent (script separat) pe cel puțin 2 fișiere
- [x] Nicio cifră din răspunsuri nu vine de la model (planificatorul pe reguli calculează tot; codul validator rămâne pregătit și pentru un plan de model, dacă se adaugă vreodată o cheie)
- [x] Impeccable rulat, problemele reale reparate (15/20 înainte; ținte 44px, contrast AA, titluri h1→h2) — versiunea Val Town
- [x] Suport pentru fișiere Excel (`.xlsx`/`.xlsm`/`.xls`), verificat cu un fișier real, multi-foaie, pe producție
- [x] Detectarea coloanelor confirmată independentă de template (ordine/denumire/nr. de coloane) cu teste automate
- [x] `README.md` + `README-VERCEL.md` (prezentare, arhitectură curentă, istoric migrare)
- [x] Excel citit după valoarea celulei (sume și date corecte), foaia cu date aleasă automat — 15 nov. 2026
- [x] Întrebări pe reguli: refuz în loc de total, nume parțiale, perioade, filtre numerice, procente; anulate/retururi arătate separat; răspuns pe puncte + comenzile folosite (coloanele fișierului, CSV) — verificat cu ~80 de întrebări față de cifre calculate independent
- [x] Spus explicit peste tot (pagină, README, sub fiecare răspuns) că răspunsurile vin din cod, fără AI; modul AI doar pregătit, pentru viitor
- [x] Tabel pivot, raport PDF (fișier și comparație), comparație între două fișiere cu întrebări, dark mode — verificate live pe desktop/tabletă/telefon
- [x] Cele 10 teste originale (`tests/core_test.ts`) re-rulate: 10/10 (au prins o regresie la rândurile de total, reparată)
