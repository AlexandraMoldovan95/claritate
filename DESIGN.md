# DESIGN.md — „Corporate Trust”, adaptat pentru dashboard

Sursa: `materiale-referinta/design-system.md` (design system „Corporate Trust”). Acolo e scris pentru React + Tailwind și pentru o pagină de prezentare; aici e tradus în **CSS vanilla** (fără build step, servit de Val Town) și adaptat pentru o **aplicație de date**, unde cifrele și graficele trebuie să rămână cele mai vizibile lucruri de pe ecran.

## Principiu

Profesional, cald, „SaaS modern”. Efectele (gradient, umbre colorate, blob-uri, 3D) se folosesc **doar în zona de upload și în header**. În dashboard-uri, calmul și lizibilitatea contează mai mult decât decorul: carduri albe, umbre colorate discrete, zero animații care distrag de la cifre.

## Token-uri (`:root` în `styles.css`)

| Token | Valoare | Folosire |
|---|---|---|
| `--bg` | `#F8FAFC` (Slate 50) | fundalul paginii |
| `--surface` | `#FFFFFF` | carduri, panouri |
| `--primary` | `#4F46E5` (Indigo 600) | butoane, linkuri, seria principală din grafice |
| `--secondary` | `#7C3AED` (Violet 600) | capătul gradientului, a doua serie |
| `--text` | `#0F172A` (Slate 900) | text principal |
| `--text-muted` | `#64748B` (Slate 500) | etichete, texte secundare (doar ≥ 14px) |
| `--border` | `#E2E8F0` (Slate 200) | borduri 1px |
| `--success` | `#10B981` (Emerald 500) | venit livrat, variații pozitive (text: `#047857`, pentru contrast) |
| `--danger` | `#E11D48` (Rose 600) | venit pierdut, variații negative — **adăugat de noi**, sistemul original nu are culoare pentru „negativ” |
| `--warning` | `#D97706` (Amber 600) | „În curs” |
| `--gradient` | `linear-gradient(135deg, #4F46E5, #7C3AED)` | buton principal, cuvinte-cheie din titlu |
| `--shadow` | `0 4px 20px -2px rgba(79,70,229,.10)` | card normal |
| `--shadow-hover` | `0 10px 25px -5px rgba(79,70,229,.15), 0 8px 10px -6px rgba(79,70,229,.10)` | card la hover |
| `--shadow-btn` | `0 4px 14px 0 rgba(79,70,229,.30)` | buton principal |
| `--radius-card` | `12px` | carduri |
| `--radius-input` | `8px` | input-uri, dropdown-uri |

Culorile graficelor se validează la build cu skill-ul `dataviz` (contrast, daltonism) înainte să fie fixate.

## Tipografie

- **Plus Jakarta Sans** (400, 500, 600, 700, 800), cu `font-display: swap`.
- Titlu pagină 800, `letter-spacing: -0.02em`, `line-height: 1.1`; titluri de secțiune 700; titluri de card 600; text 400, `line-height: 1.6`.
- **Cifrele din KPI-uri: 700, `font-variant-numeric: tabular-nums`**, ca să nu „danseze” la schimbarea valorilor.
- Scară Major Third (1.25): 12 / 14 / 16 / 20 / 25 / 31 / 39px.

## Componente

- **Buton principal**: gradient, text alb, `border-radius: 999px`, umbră `--shadow-btn`, la hover `translateY(-2px)` + umbră mai puternică.
- **Buton secundar**: alb, bordură `--border`, text Slate 700; hover: fundal Slate 50.
- **Card**: alb, `--radius-card`, bordură Slate 100, `--shadow`; la hover (doar pe cele clickabile) ridicare 4px + `--shadow-hover`.
- **Card KPI**: etichetă mică Slate 500, cifra mare, sub ea variația (verde/roșu + săgeată, nu doar culoare).
- **Zona de upload**: card mare cu bordură punctată indigo, drag & drop + buton, ușoară perspectivă 3D (`rotateX(4deg) rotateY(-8deg)`) doar pe desktop, 2 blob-uri indigo/violet estompate în fundal.
- **Tab-uri dashboard**: 6 pastile orizontale (scroll orizontal *doar în interiorul barei* pe mobil), activa cu gradient.
- **Tabele**: antet lipit sus, rânduri alternante Slate 50, numere aliniate la dreapta, pe mobil scroll orizontal în interiorul cardului, niciodată pe pagină.
- **Input întrebare**: alb, `--radius-input`, focus `outline: 2px solid --primary` + offset 2px; sub el 4 pastile cu întrebări sugerate.
- **Raport de curățare**: listă compactă cu iconițe (rânduri goale, totaluri, duplicate) — arată că aplicația a „înțeles” fișierul.
- **Iconițe**: SVG inline în stil Lucide (stroke 2, capete rotunjite), în cercuri `#EEF2FF`, `aria-hidden` când stau lângă text.

## Layout

- Container max 1280px, padding 16px pe mobil, 24px de la 640px.
- KPI-uri: 1 coloană pe mobil → 2 → 4 de la 1024px. Graficele pe toată lățimea cardului, înălțime fixă (280px mobil, 340px desktop).
- Mobil întâi (375px), **niciun scroll orizontal pe pagină**, ținte tactile ≥ 44px.

## Mișcare

- Tranziții 200ms `ease-out` pe hover; nimic nu se mișcă singur în dashboard-uri.
- Blob-urile din zona de upload pot „respira” lent (4s); cu `prefers-reduced-motion` totul e static.

## Accesibilitate

- Contrast WCAG AA (Slate 500 doar pe text ≥ 14px; textul verde folosește `#047857`).
- Focus vizibil pe tot ce e interactiv. Graficele au titlu + rezumat text și un tabel cu aceleași date.
- Culoarea nu e singurul semnal: pozitiv/negativ au și săgeată/semn.
