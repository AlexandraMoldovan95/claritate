# Claritate pe Vercel

Val Town se închide, deci am scos aplicația din `main.ts`/`std/sqlite`/`std/openai`
(specifice Val Town) și am pus-o pe un strat Vercel standard: `api/` pentru
funcția serverless, `public/` pentru tot ce e static. Codul din `backend/core/*`
(detectarea coloanelor, curățarea, cele 6 dashboard-uri, întrebările) **nu s-a
schimbat deloc** — era deja scris fără nicio dependență de Val Town.

## Ce s-a schimbat față de versiunea Val Town

- **`backend/app.ts`** — o singură linie: `import { Hono } from "npm:hono@4.6.14"`
  (specific Deno) → `import { Hono } from "hono"` (pachet npm normal).
- **`backend/db.ts`** — am adăugat `vercelKvStore()`, lângă `sqliteStore()` și
  `memoryStore()` care existau deja (nu le-am șters, dar `sqliteStore` nu se mai
  folosește pe Vercel).
- **`api/[[...route]].ts`** (nou) — echivalentul lui `main.ts`. Rulează pe Edge
  Runtime (exact ca pe Val Town/Deno — Hono e făcut pentru asta). Nu dă niciun
  `planner` la `createApp`, deci întrebările răspund mereu prin planificatorul
  pe reguli (`rulePlan`), nu prin model AI — vezi mai jos de ce.
- **`public/`** (nou) — `index.html`, `frontend/app.js`, `frontend/styles.css`,
  `examples/*.csv`, `og.jpg` sunt copii identice ale fișierelor din `frontend/`
  și `examples/`, servite direct de Vercel (CDN static), nu prin funcție.
  `vercel.json` rescrie `/d/:id` către `/index.html`, ca să meargă linkurile
  de dashboard partajate.
- **`api/_examples.generated.ts`** (nou) — textul celor 4 CSV-uri demo, băgat
  ca string în cod. Edge Runtime-ul nu are acces la filesystem, deci fluxul
  "încearcă un exemplu" (`POST /api/upload { example }`) citește din aici,
  nu de pe disc.

`main.ts`, `dev.ts`, `deno.json` au rămas neschimbate, dar **nu mai merg local**
din cauza liniei de import de mai sus — le-am lăsat doar ca istoric (Val Town
se închide oricum). Dacă vrei să le ștergi din repo, zi-mi.

## De ce fără model AI acum

Val Town îți dădea gratis acces la `gpt-5.4-nano` fără cheie. Vercel nu are
echivalent — ai nevoie de o cheie proprie (OpenAI/Anthropic), cu cost pe
request. Ai decis să nu adaugi cheie acum și să faci un demo pentru angajatori
pe cele 4 seturi de date deja existente în `examples/`. Codul deja are un
fallback pe reguli (`rulePlan` din `backend/core/ask.ts`) — îl folosește automat
când nu există planner, exact ca în `dev.ts` local. Răspunsul la întrebări va
arăta `"plan ales de: reguli"` în loc de `"model"`, dar funcționează pentru
întrebările obișnuite (venit pe lună, retururi, top clienți etc.).

**Când vrei să adaugi o cheie:** scrii un `planner` în `api/[[...route]].ts`
(la fel ca în `main.ts` vechi, dar cu SDK-ul OpenAI sau Anthropic pentru npm),
citești cheia din `process.env.OPENAI_API_KEY` (sau similar) setată ca
Environment Variable în Vercel — zero alte schimbări în `backend/`.

## Pași de deploy (o singură dată)

1. **Push pe GitHub** — fișierele astea sunt deja puse în folderul local al
   repo-ului (`aplicatie 0921`, care e `AlexandraMoldovan95/claritate` pe
   GitHub). Rulează tu, din terminalul tău (eu nu am acces la credențialele
   tale de GitHub din sesiunea asta):
   ```
   git add -A
   git commit -m "Migrare de pe Val Town pe Vercel"
   git push
   ```
2. **Vercel → New Project** — pe vercel.com, "Add New Project", alege repo-ul
   `claritate` de pe GitHub. Framework preset: **Other** (nu e Next.js).
   Build command / Output directory: lasă implicit (nu e nevoie de build step,
   `public/` e servit direct).
3. **Storage → Vercel KV** — din dashboard-ul proiectului, tab "Storage",
   creează un KV store (planul gratuit e suficient pentru un demo) și
   leagă-l de proiect. Vercel îți pune automat variabilele de mediu
   (`KV_REST_API_URL` etc.) — nu trebuie să copiezi tu nimic.
4. **Deploy.** Link-ul final va fi ceva ca `claritate.vercel.app` sau
   `claritate-<nume>.vercel.app`, în funcție de ce e liber.
5. După ce ai link-ul final, zi-mi să actualizez:
   - cele 3 linii `og:url` / `og:image` / `twitter:image` din `public/index.html`
     (acum au un placeholder `claritate.vercel.app`),
   - butonul "Live demo" din `portfolio-hub/projects/claritate.html`, care
     încă arată spre `claritate.val.run`.

## Verificare făcută înainte de livrare

Am rulat codul `backend/app.ts` + `backend/db.ts` sub Node real (nu Deno), cu
pachetul `hono` din npm (nu din Val Town), printr-un test (`scripts/smoke-test.ts`):
upload exemplu → 6 dashboard-uri corecte, întrebare în română → răspuns corect
prin planificatorul pe reguli ("mai 2026" pentru luna cu cel mai mic venit livrat
pe `vanzari_2026.csv`, verificat manual), id inexistent → 404, CSV gol → 400.
Toate au trecut. **Nu am putut testa efectiv pe Vercel** (nu am acces la contul
tău Vercel/GitHub din sesiunea asta) — pasul 2-4 de mai sus trebuie făcut de tine.
