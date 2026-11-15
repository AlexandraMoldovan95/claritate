# Claritate pe Vercel

**Live:** https://claritate.vercel.app — migrarea de pe Val Town (închis) e completă și verificată, inclusiv upload → 6 dashboard-uri → întrebare → link partajat, testat direct în browser pe producție. Documentul ăsta e istoricul migrării și al problemelor reale întâlnite, nu un plan de făcut.

Codul din `backend/core/*` (detectarea coloanelor, curățarea, cele 6 dashboard-uri, întrebările) **nu s-a schimbat deloc** față de Val Town — era deja scris fără nicio dependență de platformă. Tot ce urmează e strat de integrare: cum ajunge un request HTTP la codul ăla, și cum se stochează un upload.

## Arhitectura finală

- **Runtime: Node.js serverless function**, nu Edge (vezi motivul la secțiunea 404 de mai jos). Punct de intrare: `api/[...route].ts` — catch-all **obligatoriu** (nu opțional: `[...route]`, nu `[[...route]]`; am testat ambele, nu a fost cauza bug-ului de mai jos, dar required e corect semantic pentru o funcție care oricum nu trebuie să prindă `/api` gol).
- Funcția primește `(req, res)` brute de Node (nu un `Request` din Fetch API). Adaptorul `getRequestListener` din `@hono/node-server` le transformă înainte să le dea lui `app.fetch()` — fără el, orice request dă `500 FUNCTION_INVOCATION_FAILED`.
- **Stocare**: Upstash Redis, prin integrarea Vercel Marketplace (`@upstash/redis`, `Redis.fromEnv()`). Inițial am încercat `@vercel/kv`, dar e deprecat — avertismentul apare chiar la build. `vercelKvStore()` din `backend/db.ts` nu s-a schimbat de atunci (ia orice obiect cu `.get`/`.set`, indiferent cine e în spate).
- **Fișiere statice** (`public/`): `index.html`, `frontend/*`, `examples/*.csv`, `og.jpg` — servite direct de CDN-ul Vercel, nu prin funcție. `vercel.json` rescrie `/d/:id` → `/index.html`, ca linkurile de dashboard partajate să încarce pagina (care apoi cere datele de la API prin JS).
- **`api/_examples.generated.ts`** — textul celor 4 CSV-uri demo, embedat ca string în cod, generat din `public/examples/*.csv`. Nu are legătură cu Edge/Node — pur și simplu nu are sens să citim de pe disc la fiecare request fișiere care nu se schimbă niciodată.
- **Rutele dashboard-ului iau id-ul din query string, nu din path**: `/api/view?id=...`, `/api/set-roles?id=...`, `/api/ask?id=...` — nu `/api/view/:id` etc. Motivul e bug-ul de mai jos.

`main.ts`, `dev.ts`, `deno.json`, `frontend/`, `examples/` (la rădăcină) au rămas ca istoric Val Town/Deno — nu mai rulează, `public/` e copia activă.

## Bug-ul de 404 pe rute cu 2+ segmente (cea mai lungă investigație)

Rutele erau inițial `/api/d/:id`, apoi `/api/view/:id`, `/api/view/:id/roles`, `/api/view/:id/ask`. **Orice** rută sub `/api/...` cu 2 sau mai multe segmente de path dădea 404 direct de la platforma Vercel — un 404 cu formatul lor de eroare (`NOT_FOUND`, cod de urmărire `fra1::...`), nu `c.notFound()` din Hono, adică request-ul nu ajungea niciodată la funcție. Rutele cu un singur segment (`/api/roles`, `/api/examples`) au mers mereu.

Eliminat, pe rând, fără succes:
- redenumirea rutelor (nu conta numele, orice rută cu 2+ segmente pica);
- catch-all opțional vs obligatoriu (`[[...route]]` vs `[...route]`);
- rescrieri explicite în `vercel.json` (`/api/(.*)` → `/api/$1`) — no-op;
- runtime Edge vs Node.js (ambele aveau problema);
- `functions.includeFiles` pentru `backend/**` — testat ca ipoteză, dovedit inutil (eliminat după, nu era cauza);
- Deployment Protection și Firewall din Vercel — verificate, ambele inactive.

**Nu am găsit cauza exactă** nici după investigație extinsă (documentat ca atare, nu ascuns). **Soluție pragmatică**, aleasă explicit în locul continuării investigației: id-ul dashboard-ului s-a mutat din segment de path în query string. Rutele cu un singur segment sub `/api/...` au fost 100% stabile pe tot parcursul investigației, deci asta a eliminat complet problema.

## De ce Node.js, nu Edge (al doilea bug, real, găsit pe parcurs)

Pe Edge Runtime, funcția primește un `Request` nativ din Fetch API — `app.fetch(request)` merge direct. Trecerea pe Node.js a introdus o regresie reală: funcția primește `(req, res)` brute de Node, nu un `Request`, deci `app.fetch(req)` crăpa cu `500`. Fix: `getRequestListener(app.fetch)` din `@hono/node-server`. Verificat local printr-un test care pornește un `http.createServer` real (`scripts/smoke-test-node-handler.ts`) — testarea cu `app.fetch()` direct nu ar fi prins problema asta, pentru că simulează greșit cum invocă Vercel funcția.

## Al treilea bug, real: `ERR_MODULE_NOT_FOUND`

Sub Node.js real (nu Edge, care bundluiește tot cu esbuild și ascunde problema), importurile relative fără extensie explicită (`from "./app"`) pică la runtime cu `Cannot find module`. Node ESM cere extensia `.js` chiar și când sursa e `.ts` (convenția standard TypeScript + Node ESM: scrii `.js`, se rezolvă la `.js`-ul compilat alăturat). Găsit abia după ce am citit **Project Logs** din Vercel (nu Build Logs — logurile de build arată doar procesul de build, erorile de la runtime sunt în secțiunea "Logs" de la nivel de proiect). Fix: extensie `.js` pe toate importurile relative din `api/` și `backend/**`.

## Suport Excel (`.xlsx`/`.xlsm`/`.xls`)

Adăugat după migrare, când a venit întrebarea „dacă un angajator testează cu Excel-ul lui propriu, aplicația trebuie să știe să-l citească, nu?" — da, trebuia. Detectare după extensie **și** după semnătura fișierului (ZIP pentru Office modern, OLE/CFB pentru `.xls` vechi), conversie la CSV (`XLSX.utils.sheet_to_csv`, prima foaie cu date) înainte de `analyze()`. Pachet: `xlsx` de pe **CDN-ul oficial SheetJS** (`cdn.sheetjs.com`, versiunea `0.20.3`), nu de pe npm (`0.18.5`, cu 2 CVE-uri de severitate mare nereparate acolo — relevante aici, unde oricine urcă un fișier). `package.json` are deja URL-ul CDN ca dependență; un `npm install` normal îl instalează corect.

În același timp, am verificat explicit cerința „merge cu orice CSV/Excel, indiferent de coloane" cu teste automate (`scripts/validate-shapes.ts`) — și am găsit un bug real de poziție în detectarea rândurilor de total (vezi `CLAUDE.md`, secțiunea de curățare), reparat.

## Răspunsurile sunt date de cod, nu de AI

**Starea actuală:** nu se folosește niciun model AI și nicio cheie API. Fiecare întrebare e interpretată de reguli fixe scrise în cod (`rulePlan`), iar cifrele le calculează codul. Pagina spune asta explicit, iar sub fiecare răspuns scrie „plan ales de: reguli fixe, fără AI”.

### De ce fără model AI

Val Town dădea acces gratuit la `gpt-5.4-nano`, fără cheie. Vercel nu are echivalent — ar trebui o cheie proprie (OpenAI/Anthropic), cu cost per request. Nu s-a adăugat o cheie; aplicația merge pe planificatorul pe reguli (`rulePlan` din `backend/core/ask.ts`), care funcționează pentru întrebările obișnuite, doar înțelege mai puține formulări. Răspunsul arată explicit `"plan ales de: reguli"`.

### Mod AI — luat în calcul pentru viitor

Codul e pregătit pentru un model care ar alege **doar planul** (ce se calculează), nu cifrele: `plannerPrompt`, `validatePlan` și `guardPlan` din `backend/core/ask.ts` există deja. Ce ar aduce: înțelegerea formulărilor libere pe care regulile nu le acoperă. Ce ar costa / cere: o cheie plătită (sub un cent pe întrebare cu un model mic), o limită de cereri și o mențiune în pagină că modelul vede numele coloanelor și valorile categorice (clienți, produse), nu cifrele. Regulile ar rămâne ca rezervă.

**Dacă se adaugă o cheie mai târziu:** se scrie un `planner` în `api/[...route].ts` (vezi tipul `Planner` din `backend/app.ts`), se citește cheia dintr-o variabilă de mediu Vercel — zero alte schimbări în `backend/`.

## Variabile de mediu necesare pe Vercel

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — puse automat de integrarea Upstash din Vercel Marketplace (Storage → Connect Store). `api/[...route].ts` are și o rezervă pe `KV_REST_API_URL`/`KV_REST_API_TOKEN`, dacă apar sub numele vechi de Vercel KV.
- Nimic altceva — fără chei API, fără secrete de configurat manual.

## Verificare

- `scripts/smoke-test.ts` — `backend/app.ts` + `db.ts` sub Node real, cu `hono` din npm: upload exemplu → 6 dashboard-uri corecte, întrebare → răspuns corect prin reguli, id inexistent → 404, fișier gol → 400.
- `scripts/smoke-test-node-handler.ts` — simulează exact invocarea Vercel (`http.createServer` + `getRequestListener`), nu doar `app.fetch()` direct.
- `scripts/validate-shapes.ts`, `validate-xlsx.ts`, `validate-upload-xlsx.ts` — formă liberă de fișier (CSV și Excel) + un `.xlsx` real.
- **Verificat live, direct în browser, pe `claritate.vercel.app`**: upload CSV și Excel reale, 6 dashboard-uri, întrebare, link `/d/:id` deschis într-un tab nou (simulează un vizitator anonim) — toate corecte.
