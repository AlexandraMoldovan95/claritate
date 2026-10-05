# Claritate: dashboard din orice CSV

**Link live:** https://claritate.val.run (merge pe telefon)
**Exemplu gata încărcat:** https://claritate.val.run/d/w8a9nyaqcr (fișierul „Enterprise B2B”)

Urci un CSV cu vânzări și aplicația îl **citește**, îi **detectează coloanele**, îl **curăță** și îți arată **6 dashboard-uri** cu cifre, grafice și tabele. Poți pune și **întrebări în română** despre date. Modelul AI alege doar **ce** se calculează. **Toate cifrele le calculează codul.**

---

## Cum se folosește

1. Deschizi linkul și **tragi un CSV** în pagină sau apeși pe unul dintre cele **4 exemple murdare**.
2. Vezi imediat **ce a înțeles aplicația** din fișier (rolul fiecărei coloane, pe care îl poți corecta) și **ce a curățat** (rândurile scoase și motivul).
3. Treci prin cele **6 tab-uri**, alegi **moneda** (RON / EUR) și pui întrebări.
4. **Copiază linkul** ca să trimiți dashboard-ul cuiva (fiecare fișier urcat are adresa lui, `/d/…`).

## Cele 6 dashboard-uri

| # | Dashboard | Ce arată |
|---|---|---|
| 1 | **Sumar general** | nr. comenzi, valoare totală, **medie și mediană**, cea mai mare comandă, comenzi pe status |
| 2 | **Venit livrat** | doar comenzile **Livrată**, evoluția pe luni, top produse |
| 3 | **Venit pierdut** | **Retur + Anulată**, împărțirea între ele, clienții cu cele mai mari pierderi |
| 4 | **Cea mai bună / slabă lună** | după venitul livrat; lunile cu comenzi dar **0 livrări** intră cu 0; ultima lună e marcată „**lună incompletă**” dacă datele se opresc înainte de final |
| 5 | **Top clienți și produse** | după venit livrat, cu **ponderea** din total și avertisment pentru ID-uri duplicate |
| 6 | **Sănătatea comenzilor** | rata de livrare, retur, anulare și **banii blocați „În curs”** |

Am ales „**venit livrat / venit pierdut**”, nu „profit / pierdere”: fișierele nu au costuri, deci profitul nu se poate calcula corect. Dacă lipsește o coloană (de exemplu **statusul**), dashboard-ul spune explicit ce lipsește, în loc să inventeze.

## Date murdare: ce găsește și ce face

Exemplu real, `vanzari_2026.csv`: **145 de rânduri** sub antet → **129 de comenzi valide**.

| Problemă din fișier | Ce face aplicația |
|---|---|
| 3 rânduri de text înainte de tabel | găsește singură **rândul real de antet** (linia 5) |
| rânduri complet goale | le scoate (**3**) |
| rânduri `TOTAL PARTIAL` / `TOTAL GENERAL` intercalate | le scoate (**7**), altfel ar dubla sumele |
| aceeași comandă de două ori | păstrează una (**6** duplicate identice) |
| același ID cu **conținut diferit** (ex. `CMD-400003`) | le **păstrează pe amândouă** și avertizează, pentru că nu știm care e corectă |
| sume ca text: `"1.841,86"`, `1,841.86`, `RON 2.500` | le citește în **format românesc și englezesc** |
| „Delta Foods SA”, „DELTA FOODS SA”, „delta foods sa ” | le **unifică** într-un singur client |
| `Livrata`, `LIVRATA`, `livrata`, ` Livrata` | le aduce la **4 statusuri**: Livrată, În curs, Retur, Anulată |
| coloane în altă ordine, separator `;` sau tab | detectează **rolul fiecărei coloane** din nume **și** conținut |
| RON și EUR amestecate | calculează **separat pe fiecare monedă**, **fără conversie** și fără curs inventat |

Tot raportul de curățare e vizibil în pagină („**Ce am curățat**” → „Vezi rândurile eliminate”).

## Regula „modelul nu calculează numere”

```
întrebare în română
   → modelul primește DOAR întrebarea + numele coloanelor (fără rânduri, fără cifre)
   → întoarce un PLAN JSON: ce metrică, ce coloană, ce filtre, ce grupare
   → codul VALIDEAZĂ planul (coloane existente, operații permise)
   → plasa de siguranță corectează planul dacă contrazice întrebarea
   → codul CALCULEAZĂ și scrie singur propoziția
```

- Sub fiecare răspuns scrie **exact ce s-a calculat** („Am calculat: suma pe valoare; unde status = Retur…”) și **cine a ales planul**: modelul sau regulile.
- **Plasă de siguranță:** la primele teste live, modelul a răspuns la „cât am pierdut din **retururi**” cu Retur + Anulată. La „cea mai slabă lună” a dat toate lunile, fără status. De atunci codul verifică planul: dacă întrebarea spune explicit „retururi”, „anulări” sau „cea mai … lună”, planul e corectat înainte de calcul, iar corecția apare în loguri.
- **Orice CSV:** modelul vede și **numele real** al coloanei numerice (ex. „Nota”, „Suma”), deci întrebările merg și pe fișiere care nu sunt de vânzări. Dacă modelul spune „nu se poate”, dar regulile înțeleg întrebarea, răspund regulile.
- **Fără cheie API:** modelul e cel gratuit din Val Town (`std/openai`). Dacă nu răspunde (limita e 10 cereri pe minut), întrebarea trece automat pe un **planificator pe reguli**, care merge și fără model.

## Cum am verificat

- **10 teste automate** (`deno task test`): cifrele de pe 2 fișiere comparate **la ban** cu rapoartele independente făcute cu pluginul `data` (în `docs/`), un **CSV sintetic murdar** (`;`, numere englezești, fără status, coloane în altă ordine), fișiere invalide, un plan „rău” de la model care trebuie respins, planurile greșite văzute live și un CSV care **nu e de vânzări** (note școlare).
- **Teste live** pe https://claritate.val.run, cu logurile Val Town: planul întors de model și, când e cazul, corecția.
- **Audit Impeccable** (desktop 1280px și telefon 375px), înainte de reparații **15/20**. Am reparat: ținte de atins sub **44px**, **contrast** sub AA, numele lung de fișier rupt urât pe telefon și **ordinea titlurilor** (h1 → h2). După reparații: fără scroll orizontal, fără contrast slab, fără ținte prea mici (în afară de barele graficului pe telefon, care au alternativă în tabel).

## Plugin-uri folosite

| Plugin | Marketplace | Ce a făcut concret |
|---|---|---|
| **`valtown`** | `claude-plugins-official` | a verificat importurile Val Town după documentația actuală (`std/sqlite`, `std/openai`, `std/utils`), a creat val-ul `AlexandraM/claritate`, a urcat fișierele, a setat linkul scurt `claritate.val.run` și a citit logurile pentru testele live |
| **`data`** | `knowledge-work-plugins` | `/data:explore-data` pe `vanzari_2026.csv` și `/data:validate-data` pe `vanzari_enterprise_b2b_2026.csv`: catalogul de murdării și **cifrele de referință** pe care le verifică testele (`docs/`) |
| **`impeccable`** | `impeccable` | auditul de design și accesibilitate de mai sus și reparațiile din `frontend/` |

**Alte unelte (nu sunt plugin-uri):** Claude (Cowork) a scris codul. **Designer agent**-ul folosit ca referință (`materiale-referinta/designer_agent..md`, stilul „Corporate Trust”) a dat direcția vizuală, adaptată în `DESIGN.md`. Skill-ul **dataviz** a validat paleta graficelor (inclusiv pentru daltonism).
**Nefolosite:** `/data:create-viz` (graficele sunt SVG scrise direct în cod) și `typescript-lsp` (verificarea de tipuri s-a făcut cu `deno check`).

## Structura proiectului

```
main.ts                   intrarea pe Val Town (SQLite, modelul, fișierele statice)
backend/app.ts            rutele (upload, dashboard, întrebări)
backend/db.ts             tabelul SQLite cu fișierele urcate
backend/core/csv.ts       citirea CSV (ghilimele, separator, BOM)
backend/core/normalize.ts numere, date, statusuri, monede
backend/core/detect.ts    antetul și rolul fiecărei coloane
backend/core/clean.ts     curățarea + raportul
backend/core/aggregate.ts cele 6 dashboard-uri
backend/core/ask.ts       întrebare → plan → validare → plasa de siguranță → calcul
frontend/                 pagina, stilurile, graficele SVG
tests/core_test.ts        cele 10 teste
examples/                 cele 4 seturi de date demo
PLAN.md · CLAUDE.md · DESIGN.md · docs/
materiale-referinta/      brief-ul inițial, lista de plugin-uri, sistemul de design folosit ca referință și seturile de date demo originale
```

**Rulare locală:** `deno task dev` → http://localhost:8787 (fără model, doar reguli) · **Teste:** `deno task test`

## Limite cunoscute

- Fișiere de maximum **5 MB** / **50.000** de rânduri.
- Monedele **nu se convertesc**: fiecare are cifrele ei.
- Oricine are linkul unui dashboard îl poate vedea, deci **nu urca date confidențiale** (pagina spune asta).
- Modelul gratuit are limită de cereri; peste ea răspund **regulile**, care înțeleg mai puține formulări.
- După o actualizare, site-ul poate afișa până la **5 minute** fișierele vechi (cache Val Town).
