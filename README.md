# Claritate: a dashboard from any CSV

![Claritate — upload a CSV, get the dashboard](docs/og-preview.jpg)

**Live link:** https://claritate.val.run (works on mobile)
**Pre-loaded example:** https://claritate.val.run/d/w8a9nyaqcr (the "Enterprise B2B" file)

You upload a sales CSV and the app **reads** it, **detects its columns**, **cleans** it, and shows you **6 dashboards** with figures, charts, and tables. You can also ask **questions in natural language** about the data. The AI model only chooses **what** gets calculated. **The code calculates every figure.**

> **Portfolio demo project** — scoped, built, and tested like a live product delivered to a real client. The "Testing and quality" and "How it was built" sections below show the process behind it, for anyone who wants to see how it came together.

---

## How to use it

1. Open the link and **drag a CSV** onto the page, or click one of the **4 non-conforming examples**.
2. See immediately **what the app understood** from the file (each column's detected role, which you can correct) and **what it cleaned** (the rows removed and why).
3. Go through the **6 tabs**, pick a **currency** (RON / EUR), and ask questions.
4. **Copy the link** to send the dashboard to someone (every uploaded file gets its own address, `/d/…`).

## The 6 dashboards

| # | Dashboard | What it shows |
|---|---|---|
| 1 | **General summary** | order count, total value, **mean and median**, the largest order, orders by status |
| 2 | **Delivered revenue** | only **Delivered**-status orders, the month-by-month trend, top products |
| 3 | **Lost revenue** | **Returns + Cancellations**, the split between them, the customers with the biggest losses |
| 4 | **Best / worst month** | based on delivered revenue; months with orders but **0 deliveries** are counted as 0; the last month is flagged as "**incomplete month**" if the data cuts off before month's end |
| 5 | **Top customers and products** | ranked by delivered revenue, with each one's **share** of the total, and a warning for duplicate IDs |
| 6 | **Order health** | delivery, return, and cancellation rates, plus the money tied up **"In progress"** |

The app uses "**delivered revenue / lost revenue**", not "profit / loss": the files carry no cost data, so profit can't be calculated correctly. If a column is missing (e.g. **status**), the dashboard says explicitly what's missing instead of inventing it.

## Messy data: what it finds and what it does

A real example, `vanzari_2026.csv`: **145 rows** under the header → **129 valid orders**.

| Problem in the file | What the app does |
|---|---|
| 3 lines of text before the table | finds the **real header row** on its own (line 5) |
| completely empty rows | removes them (**3**) |
| `PARTIAL TOTAL` / `GRAND TOTAL` rows mixed in | removes them (**7**), otherwise they'd double the sums |
| the same order twice | keeps one (**6** exact duplicates) |
| the same ID with **different content** (e.g. `CMD-400003`) | **keeps both** and warns, since there's no way to know which is correct |
| amounts as text: `"1.841,86"`, `1,841.86`, `RON 2.500` | reads both **Romanian and English number formats** |
| "Delta Foods SA", "DELTA FOODS SA", "delta foods sa " | **merges** them into a single customer |
| `Livrata`, `LIVRATA`, `livrata`, ` Livrata` | normalizes to **4 statuses**: Delivered, In progress, Return, Cancelled |
| columns in a different order, `;` or tab separator | detects **each column's role** from its name **and** its content |
| RON and EUR mixed together | calculates **separately per currency**, with **no conversion** and no invented exchange rate |

The full cleaning report is visible on the page ("**What I cleaned**" → "See the removed rows").

## The "the model never calculates numbers" rule

```
question in natural language
   → the model receives ONLY the question + the column names (no rows, no figures)
   → returns a JSON plan: which metric, which column, which filters, which grouping
   → the code VALIDATES the plan (columns exist, operations allowed)
   → the safety net corrects the plan if it contradicts the question
   → the code CALCULATES and writes the answer sentence itself
```

- Under every answer it shows **exactly what was calculated** ("Calculated: sum of value; where status = Return…") and **who chose the plan**: the model or the rules.
- **Safety net:** in early live testing, the model answered "how much did I lose to **returns**" by including Returns + Cancellations. For "worst month," it returned every month, ignoring status entirely. Since then, the code checks the plan before calculating: if the question explicitly says "returns," "cancellations," or "best/worst month," the plan is corrected before the calculation runs, and the correction is logged.
- **Any CSV:** the model also sees the **real name** of the numeric column (e.g. "Grade," "Amount"), so questions work on files that aren't sales data at all. If the model says "not possible" but the rule-based planner understands the question, the rules answer instead.
- **No API key needed:** the model used is Val Town's free one (`std/openai`). If it doesn't respond (the limit is 10 requests/minute), the question automatically falls back to a **rule-based planner**, which also works without the model.

## Testing and quality

- **10 automated tests** (`deno task test`): figures from 2 files cross-checked **to the cent** against independent reports built with the `data` plugin (in `docs/`), a **synthetic non-conforming CSV** (`;` separator, English numbers, no status column, reordered columns), invalid files, a "bad" plan from the model that must be rejected, real malformed plans seen live, and a CSV that **isn't sales data at all** (school grades).
- **Live tests** on https://claritate.val.run, with Val Town logs: the plan returned by the model and, where relevant, the correction applied.
- **Impeccable accessibility audit** (desktop 1280px and mobile 375px): initial score 15/20. Fixed: tap targets under **44px**, **contrast** below AA, a long filename wrapping badly on mobile, and **heading order** (h1 → h2). After the fixes: no horizontal scroll, no low-contrast text, no undersized tap targets (except the chart bars on mobile, which have a table alternative).

## How it was built

| Plugin | Marketplace | What it concretely did |
|---|---|---|
| **`valtown`** | `claude-plugins-official` | checked Val Town imports against current docs (`std/sqlite`, `std/openai`, `std/utils`), created the val `AlexandraM/claritate`, uploaded the files, set the short link `claritate.val.run`, and read the logs for the live tests |
| **`data`** | `knowledge-work-plugins` | `/data:explore-data` on `vanzari_2026.csv` and `/data:validate-data` on `vanzari_enterprise_b2b_2026.csv`: the catalog of non-conformities and the **reference figures** the tests check against (`docs/`) |
| **`impeccable`** | `impeccable` | the design/accessibility audit above and the fixes in `frontend/` |

**Other tools (not plugins):** Claude (Cowork) wrote the code. A **designer agent** used as a reference (`materiale-referinta/design-system.md`, the "Corporate Trust" style) set the visual direction, adapted in `DESIGN.md`. The **dataviz** skill validated the chart palette (including for color blindness).
**Not used:** `/data:create-viz` (the charts are SVG written directly in code) and `typescript-lsp` (type checking was done with `deno check`).

## Project structure

```
main.ts                   Val Town entry point (SQLite, the model, static files)
backend/app.ts            routes (upload, dashboard, questions)
backend/db.ts             SQLite table for uploaded files
backend/core/csv.ts       CSV reading (quotes, separator, BOM)
backend/core/normalize.ts numbers, dates, statuses, currencies
backend/core/detect.ts    header and each column's role
backend/core/clean.ts     cleaning + the report
backend/core/aggregate.ts the 6 dashboards
backend/core/ask.ts       question → plan → validation → safety net → calculation
frontend/                 page, styles, SVG charts
tests/core_test.ts        the 10 tests
examples/                 the 4 demo datasets
PLAN.md · CLAUDE.md · DESIGN.md · docs/
materiale-referinta/      the original brief, the plugin list, the reference design system, and the original demo datasets
```

**Running locally:** `deno task dev` → http://localhost:8787 (no model, rules only) · **Tests:** `deno task test`

## Known limits

- Files up to **5 MB** / **50,000** rows.
- Currencies are **not converted**: each keeps its own figures.
- Anyone with a dashboard's link can view it (there's no login), so the page explicitly says **not to upload confidential data**.
- The free model has a rate limit; past it, the **rules** take over, which understand fewer phrasings.
- After an update, the site may show the old files for up to **5 minutes** (Val Town cache).
