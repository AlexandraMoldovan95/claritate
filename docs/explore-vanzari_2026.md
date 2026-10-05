# Explorare date: `vanzari_2026.csv`

Generat cu `/data:explore-data` (plugin `data`), 2026-09-24. Script de profilare: Python stdlib, fără dependențe.

## Prezentare generală

- **Fișier**: UTF-8, fără BOM, **CRLF**, separator `,`, 150 de linii fizice.
- **Preambul**: 3 rânduri narative (`EXPORT VANZARI — sistem intern`, `Perioada: 01.01.2026 - 31.08.2026`, `Generat automat la 15.09.2026 08:41…`) + 1 rând gol → **antetul e pe linia 5**.
- **Coloane (8)**: `Nr comanda, Data, Client, Produs, Cantitate, Pret unitar, Valuta, Status`. Toate rândurile de sub antet au exact 8 celule.
- **Granularitate**: un rând = o comandă (o singură linie de produs per comandă).
- **Cheie primară**: `Nr comanda` (`CMD-100001` … `CMD-100129`, secvență completă, fără goluri).
- **Perioada efectivă**: 2026-01-01 → 2026-08-23 (preambulul declară până la 31.08).

| Etapă | Rânduri |
|---|---|
| Linii sub antet | 145 |
| − rânduri complet goale (`,,,,,,,`) | 3 (liniile 26, 87, 149) |
| − rânduri de total (`TOTAL PARTIAL` ×6, `TOTAL GENERAL` ×1) | 7 |
| = rânduri de date | 135 |
| − duplicate identice pe `Nr comanda` | 6 |
| **= comenzi valide** | **129** |

## Coloane

| Coloană | Rol | Nule | Distincte (brut → normalizat) | Observații |
|---|---|---|---|---|
| `Nr comanda` | id | 0 | 129 unice din 135 | 6 ID-uri apar de 2×, toate identice după normalizare |
| `Data` | date | 0 | 98 | toate `dd.mm.yyyy`, toate valide; 12–23 comenzi/lună |
| `Client` | category | 0 | 18 → **14** | spații la capete (7), dublu spațiu, majuscule diferite |
| `Produs` | category | 0 | 8 → 8 | curat |
| `Cantitate` | quantity | 0 | 6 | întregi {1,2,3,4,5,10}; mediana 2, max 10 |
| `Pret unitar` | unit_price | 0 | 129 | toate în format RO între ghilimele (`"1.841,86"`); 28,61 – 3.768,70 |
| `Valuta` | currency | 0 | 2 | RON 90 · EUR 39 (după dedup) |
| `Status` | status | 0 | 18 → **4** | 58 de valori cu spații la capete, 3 stiluri de majuscule |

### Categorii normalizate

**Status** (după trim + fără diacritice + lowercase): Livrată 95 · Retur 13 · Anulată 13 · În curs 8.

**Client** — variante unificate:
- `Hermes Logistics` ← `Hermes Logistics`, ` Hermes Logistics`, `hermes logistics` (15 comenzi, cel mai mare client ca număr)
- `Delta Foods SA` ← `Delta Foods SA`, `DELTA FOODS SA`, `delta foods sa ` (12)
- `Bistro Central` ← `Bistro Central`, `Bistro  Central` (dublu spațiu), `Bistro Central ` (8)

Restul de 11 clienți sunt consecvenți. Cardinalitate 14 → bun pentru top-uri și filtre.

### Metrici (valoare = cantitate × preț unitar, după dedup)

| Monedă | Comenzi | Total | Livrată | Retur | Anulată | În curs |
|---|---|---|---|---|---|---|
| RON | 90 | 347.826,35 | 265.882,81 (66) | 41.380,86 (9) | 27.750,44 (9) | 12.812,24 (6) |
| EUR | 39 | 38.855,41 | 29.475,32 (29) | 4.342,85 (4) | 4.403,05 (4) | 634,19 (2) |

- Distribuție **puternic asimetrică la dreapta**: RON medie 3.864,74 vs mediană 2.343,61; cea mai mare comandă 32.521,60 RON (`CMD-100032`, Implementare × 10). Media pe comandă e trasă în sus de câteva comenzi cu cantitate 10 — de afișat și mediana.
- **Prețul depinde de produs și monedă**, cu variație mică (max/min ≤ 1,2 per produs per monedă). Prețurile EUR ≈ prețurile RON / 5 → aceleași produse, facturate în altă monedă. Confirmă regula: fără însumare RON + EUR.

### Venit livrat pe lună

| Lună | RON | EUR |
|---|---|---|
| 2026-01 | 37.307,61 | 5.752,95 |
| 2026-02 | 34.646,27 | 583,38 |
| 2026-03 | 48.628,44 | 2.018,65 |
| 2026-04 | 44.636,87 | 4.075,81 |
| 2026-05 | **9.368,47** (min) | **166,30** (min) |
| 2026-06 | **51.610,69** (max) | **8.499,06** (max) |
| 2026-07 | 28.450,39 | 7.518,17 |
| 2026-08 | 11.234,07 | 861,00 |

Aceeași lună e cea mai bună (iunie) și cea mai slabă (mai) pe ambele monede. August e parțial (date până la 23.08).

## Probleme de calitate

| Severitate | Problemă | Impact asupra aplicației |
|---|---|---|
| 🔴 Mare | **Rândurile `TOTAL` nu se potrivesc cu datele.** `TOTAL GENERAL = 568.840,57 RON`, dar suma reală e 347.826,35 RON (sau 394.886,81 amestecând monede și păstrând duplicatele). Nicio subtotalizare nu se potrivește cu segmentul de deasupra. | Sunt valori-capcană: **trebuie eliminate, nu folosite pentru verificare**. Un parser care le păstrează adaugă 776.212,34 RON (6 parțiale + general) → totalul RON ar ieși de ~3,2× mai mare. |
| 🔴 Mare | 6 comenzi duplicate (`CMD-100043, -016, -111, -090, -127, -033`), la distanță în fișier | Fără dedup: +7.816,73 RON și +388,32 EUR fals. |
| 🟠 Medie | `Status` cu 18 variante brute (spații, majuscule) | Fără normalizare, dashboard-urile 2, 3 și 6 ar fi greșite. |
| 🟠 Medie | `Client`: 18 variante → 14 clienți reali | Top clienți ar dubla/tripla Hermes, Delta Foods și Bistro Central. |
| 🟡 Mică | Preambul de 3 rânduri + rând gol înainte de antet | Detectarea antetului trebuie să sară peste el. |
| 🟡 Mică | Numere în format RO între ghilimele | Virgula din valoare e protejată de ghilimele → parser CSV corect obligatoriu. |
| 🟡 Mică | CRLF | Trebuie tratat de parser. |
| ⚪ Info | Două monede | Totalurile se afișează separat pe fiecare monedă. |

Fără: valori nule în rândurile de date, date invalide, cantități/prețuri negative sau zero, ID-uri cu conținut diferit.

## Ce înseamnă pentru cod (verificări pentru `tests/`)

După `parse → detect → clean` pe acest fișier, testul trebuie să obțină exact:

- antet la linia 5; 3 goale, 7 totaluri, 6 duplicate eliminate → **129 de comenzi**;
- 14 clienți, 8 produse, 4 statusuri, 2 monede;
- venit livrat **RON 265.882,81 · EUR 29.475,32**;
- venit pierdut (Retur + Anulată) **RON 69.131,30 · EUR 8.745,90**;
- cea mai bună lună **2026-06**, cea mai slabă **2026-05** (ambele monede).

## Analize recomandate

1. **Trend lunar al venitului livrat pe monedă** — scăderea din mai și recuperarea din iunie (dashboard 4).
2. **Rata de pierdere pe client** — cine are cele mai multe retururi/anulări raportat la volum (dashboard 3).
3. **Mix produs × cantitate** — Implementare și Audit securitate cu cantitate 10 domină venitul; de verificat concentrarea (dashboard 5).
4. **Comparație între cele 4 fișiere** — aceleași coloane în ordine diferită; confirmă că detectarea după nume funcționează independent de poziție.
5. **`/data:validate-data`** pe cifrele de mai sus, cu un script independent, înainte să le folosim ca valori de referință în teste.

---

## Anexa A — Ieșirea completă a scriptului de profilare

Rulat cu `py profile.py vanzari_2026.csv` (Python 3.13, doar stdlib). Valorile brute, înainte de formatarea în stil RO.

```text
BOM: False CRLF: True
Total physical lines: 150
0 ['EXPORT VANZARI — sistem intern']
1 ['Perioada: 01.01.2026 - 31.08.2026']
2 ['Generat automat la 15.09.2026 08:41. NU MODIFICATI ACEST FISIER.']
3 []
4 ['Nr comanda', 'Data', 'Client', 'Produs', 'Cantitate', 'Pret unitar', 'Valuta', 'Status']
5 ['CMD-100043', '27.04.2026', 'Electra Mobil', 'Training on-site', '2', '1.841,86', 'RON', ' Livrata']
Header at line 5 ['Nr comanda', 'Data', 'Client', 'Produs', 'Cantitate', 'Pret unitar', 'Valuta', 'Status']
Width distribution: Counter({8: 145})

Empty rows: 3 [26, 87, 149]
Total rows: 7
   (20, ['TOTAL PARTIAL', '', '', '', '', '54.854,12', 'RON', ''])
   (23, ['TOTAL PARTIAL', '', '', '', '', '24.314,12', 'RON', ''])
   (50, ['TOTAL PARTIAL', '', '', '', '', '52.425,77', 'RON', ''])
   (82, ['TOTAL PARTIAL', '', '', '', '', '11.968,74', 'RON', ''])
   (129, ['TOTAL PARTIAL', '', '', '', '', '12.038,29', 'RON', ''])
   (137, ['TOTAL PARTIAL', '', '', '', '', '51.770,73', 'RON', ''])
   (150, ['TOTAL GENERAL', '', '', '', '', '568.840,57', 'RON', ''])
Data rows: 135

=== Raw column profile ===

[Nr comanda] nulls=0 distinct=129 leading/trailing ws=0
  top: [('CMD-100043', 2), ('CMD-100016', 2), ('CMD-100111', 2), ('CMD-100090', 2), ('CMD-100127', 2), ('CMD-100033', 2), ('CMD-100013', 1), ('CMD-100037', 1)]
  bottom: [('CMD-100085', 1), ('CMD-100071', 1), ('CMD-100049', 1), ('CMD-100020', 1), ('CMD-100065', 1)]

[Data] nulls=0 distinct=98 leading/trailing ws=0
  top: [('27.04.2026', 3), ('11.03.2026', 3), ('12.01.2026', 3), ('17.07.2026', 3), ('04.05.2026', 3), ('03.08.2026', 3), ('14.04.2026', 3), ('20.08.2026', 2)]
  bottom: [('27.07.2026', 1), ('27.06.2026', 1), ('01.05.2026', 1), ('15.04.2026', 1), ('24.05.2026', 1)]

[Client] nulls=0 distinct=20 leading/trailing ws=7
  top: [('Nova Print', 14), ('Electra Mobil', 12), ('Jupiter Media', 12), ('Kappa Textile', 10), ('Carpat Distribution', 9), ('Farmacia Vita', 8), ('Lumina Energy', 8), ('Meridian Auto', 8)]
  bottom: [(' Hermes Logistics', 4), ('DELTA FOODS SA', 3), ('delta foods sa ', 2), ('Bistro  Central', 2), ('Bistro Central ', 1)]

[Produs] nulls=0 distinct=8 leading/trailing ws=0
  top: [('Abonament Cloud Pro', 24), ('Suport Premium', 22), ('Abonament Cloud Basic', 20), ('Implementare', 16), ('Audit securitate', 16), ('Modul Raportare', 14), ('Licenta Desktop', 13), ('Training on-site', 10)]

[Cantitate] nulls=0 distinct=6 leading/trailing ws=0
  top: [('1', 47), ('2', 29), ('4', 17), ('5', 17), ('3', 13), ('10', 12)]

[Pret unitar] nulls=0 distinct=129 leading/trailing ws=0
  top: [('1.841,86', 2), ('3.517,99', 2), ('157,53', 2), ('457,49', 2), ('89,64', 2), ('29,76', 2), ('701,99', 1), ('121,46', 1)]
  bottom: [('416,33', 1), ('83,04', 1), ('651,90', 1), ('184,17', 1), ('1.201,08', 1)]

[Valuta] nulls=0 distinct=2 leading/trailing ws=0
  top: [('RON', 94), ('EUR', 41)]

[Status] nulls=0 distinct=18 leading/trailing ws=58
  top: [('Livrata ', 26), ('livrata', 22), ('Livrata', 21), (' Livrata', 18), ('LIVRATA', 14), ('retur', 5), ('Anulata ', 4), ('anulata', 4)]
  bottom: [('Anulata', 2), ('In curs ', 2), (' Anulata', 2), ('ANULATA', 1), (' In curs', 1)]

=== Numeric ===
Unparseable qty: 0 price: 0
Non-integer qty: []

[Cantitate] n=135 min=1.00 p5=1.00 p25=1.00 median=2.00 mean=3.09 p75=4.00 p95=10.00 max=10.00 sd=2.57 zeros=0 neg=0

[Pret unitar] n=135 min=28.61 p5=88.17 p25=158.87 median=510.59 mean=955.59 p75=1203.11 p95=3475.25 max=3768.70 sd=1045.50 zeros=0 neg=0
Price formats: [('RO(1.234,56)', 135)]

=== Dates ===
Unparseable dates: []
Range: 2026-01-01 -> 2026-08-23
Per month: [('2026-01', 19), ('2026-02', 12), ('2026-03', 13), ('2026-04', 20), ('2026-05', 18), ('2026-06', 23), ('2026-07', 15), ('2026-08', 15)]
Invalid calendar dates: []

=== Duplicates on Nr comanda ===
  CMD-100043 x2 lines [6, 22] -> identical after normalization
  CMD-100016 x2 lines [19, 97] -> identical after normalization
  CMD-100111 x2 lines [24, 147] -> identical after normalization
  CMD-100090 x2 lines [42, 135] -> identical after normalization
  CMD-100127 x2 lines [85, 140] -> identical after normalization
  CMD-100033 x2 lines [131, 136] -> identical after normalization
Removable exact dups: 6 conflicting IDs: 0
ID pattern ok: True
ID range CMD-100001..CMD-100129, unique=129, missing=[]

=== Categorical after normalization (clean, n=129) ===

Client: raw distinct=18, normalized distinct=14
   15  'Hermes Logistics'  variants={'Hermes Logistics': 10, 'hermes logistics': 5}
   14  'Nova Print'  variants=
   12  'Delta Foods SA'  variants={'Delta Foods SA': 7, 'delta foods sa': 2, 'DELTA FOODS SA': 3}
   12  'Jupiter Media'  variants=
   10  'Electra Mobil'  variants=
    9  'Carpat Distribution'  variants=
    9  'Kappa Textile'  variants=
    8  'Farmacia Vita'  variants=
    8  'Meridian Auto'  variants=
    8  'Bistro Central'  variants={'Bistro Central': 6, 'Bistro  Central': 2}
    7  'Aurora Retail SRL'  variants=
    7  'Lumina Energy'  variants=
    6  'Grand Hotel Olt'  variants=
    4  'Ideal Construct'  variants=

Produs: raw distinct=8, normalized distinct=8
   22  'Suport Premium'  variants=
   22  'Abonament Cloud Pro'  variants=
   18  'Abonament Cloud Basic'  variants=
   16  'Audit securitate'  variants=
   15  'Implementare'  variants=
   14  'Modul Raportare'  variants=
   13  'Licenta Desktop'  variants=
    9  'Training on-site'  variants=

Status raw variants: Counter({"'Livrata'": 65, "'livrata'": 22, "'LIVRATA'": 14, "'Anulata'": 8, "'Retur'": 5, "'retur'": 5, "'anulata'": 4, "'IN CURS'": 3, "'RETUR'": 3, "'In curs'": 3, "'in curs'": 2, "'ANULATA'": 1})
Status normalized: Counter({'Livrată': 95, 'Retur': 13, 'Anulată': 13, 'În curs': 8})
Valuta: Counter({'RON': 90, 'EUR': 39})

=== Value (qty x price) per currency ===

[valoare EUR] n=39 min=29.76 p5=80.46 p25=181.75 median=377.19 mean=996.29 p75=1255.85 p95=3200.91 max=6962.90 sd=1537.34 zeros=0 neg=0
   Livrată  n= 29 sum=29,475.32
   Retur    n=  4 sum=4,342.85
   Anulată  n=  4 sum=4,403.05
   În curs  n=  2 sum=634.19
   TOTAL    n= 39 sum=38,855.41
   top orders: [('CMD-100080', 'Implementare', 10.0, 696.29, 6962.9), ('CMD-100113', 'Implementare', 10.0, 673.75, 6737.5), ('CMD-100013', 'Implementare', 4.0, 701.99, 2807.96)]

[valoare RON] n=90 min=137.57 p5=158.30 p25=743.01 median=2343.61 mean=3864.74 p75=3807.57 p95=11282.81 max=32521.60 sd=5430.56 zeros=0 neg=0
   Livrată  n= 66 sum=265,882.81
   Retur    n=  9 sum=41,380.86
   Anulată  n=  9 sum=27,750.44
   În curs  n=  6 sum=12,812.24
   TOTAL    n= 90 sum=347,826.35
   top orders: [('CMD-100032', 'Implementare', 10.0, 3252.16, 32521.6), ('CMD-100109', 'Audit securitate', 10.0, 2400.76, 24007.6), ('CMD-100026', 'Audit securitate', 10.0, 2361.84, 23618.4)]

=== Delivered revenue by month x currency ===
   ('2026-01', 'EUR') 5,752.95
   ('2026-01', 'RON') 37,307.61
   ('2026-02', 'EUR') 583.38
   ('2026-02', 'RON') 34,646.27
   ('2026-03', 'EUR') 2,018.65
   ('2026-03', 'RON') 48,628.44
   ('2026-04', 'EUR') 4,075.81
   ('2026-04', 'RON') 44,636.87
   ('2026-05', 'EUR') 166.30
   ('2026-05', 'RON') 9,368.47
   ('2026-06', 'EUR') 8,499.06
   ('2026-06', 'RON') 51,610.69
   ('2026-07', 'EUR') 7,518.17
   ('2026-07', 'RON') 28,450.39
   ('2026-08', 'EUR') 861.00
   ('2026-08', 'RON') 11,234.07

=== Product -> price consistency (per currency) ===
  ('abonament cloud basic', 'EUR'): n=3 min=28.61 max=29.76 ratio=1.0
  ('abonament cloud basic', 'RON'): n=15 min=137.12 max=159.80 ratio=1.2
  ('abonament cloud pro', 'EUR'): n=9 min=83.04 max=96.58 ratio=1.2
  ('abonament cloud pro', 'RON'): n=13 min=415.25 max=470.62 ratio=1.1
  ('audit securitate', 'EUR'): n=6 min=470.07 max=510.59 ratio=1.1
  ('audit securitate', 'RON'): n=10 min=2234.09 max=2543.72 ratio=1.1
  ('implementare', 'EUR'): n=3 min=673.75 max=701.99 ratio=1.0
  ('implementare', 'RON'): n=12 min=3230.02 max=3768.70 ratio=1.2
  ('licenta desktop', 'EUR'): n=3 min=179.34 max=189.35 ratio=1.1
  ('licenta desktop', 'RON'): n=10 min=833.30 max=937.55 ratio=1.1
  ('modul raportare', 'EUR'): n=6 min=231.72 max=269.52 ratio=1.2
  ('modul raportare', 'RON'): n=8 min=1163.91 max=1297.57 ratio=1.1
  ('suport premium', 'EUR'): n=6 min=115.56 max=125.73 ratio=1.1
  ('suport premium', 'RON'): n=16 min=578.04 max=666.17 ratio=1.2
  ('training on-site', 'EUR'): n=3 min=347.26 max=351.45 ratio=1.0
  ('training on-site', 'RON'): n=6 min=1815.58 max=1930.39 ratio=1.1

=== Totals rows vs computed ===
  line 20 ['TOTAL PARTIAL', '54.854,12', 'RON']
  line 23 ['TOTAL PARTIAL', '24.314,12', 'RON']
  line 50 ['TOTAL PARTIAL', '52.425,77', 'RON']
  line 82 ['TOTAL PARTIAL', '11.968,74', 'RON']
  line 129 ['TOTAL PARTIAL', '12.038,29', 'RON']
  line 137 ['TOTAL PARTIAL', '51.770,73', 'RON']
  line 150 ['TOTAL GENERAL', '568.840,57', 'RON']
```

## Anexa B — Verificarea rândurilor de total

Ipoteze testate pentru `TOTAL GENERAL = 568.840,57 RON`. Niciuna nu se potrivește:

| Ipoteză | Rezultat |
|---|---|
| Toate rândurile, cu duplicate, RON + EUR amestecate | 394.886,81 |
| Fără duplicate, RON + EUR amestecate | 386.681,76 |
| Cu duplicate, doar RON | 355.643,08 |
| Fără duplicate, doar RON (valoarea corectă) | 347.826,35 |
| Suma celor 6 `TOTAL PARTIAL` | 207.371,77 |

`TOTAL PARTIAL` comparat cu rândurile de date dintre el și totalul anterior:

| Linie | Total declarat | Rânduri în segment | Suma segmentului (toate monedele) | Suma segmentului (RON) |
|---|---|---|---|---|
| 20 | 54.854,12 | 14 | 33.019,87 | 29.098,21 |
| 23 | 24.314,12 | 2 | 14.951,93 | 14.951,93 |
| 50 | 52.425,77 | 25 | 61.157,11 | 57.503,40 |
| 82 | 11.968,74 | 31 | 63.887,85 | 45.479,37 |
| 129 | 12.038,29 | 45 | 188.597,94 | 177.426,71 |
| 137 | 51.770,73 | 7 | 18.165,05 | 16.702,17 |
| 150 (GENERAL) | 568.840,57 | 11 | 15.107,06 | 14.481,29 |

Concluzie: totalurile din fișier sunt zgomot și nu pot fi folosite ca sumă de control.

## Anexa C — Scriptul de profilare

```python
import csv, sys, re, unicodedata, statistics
from collections import Counter, defaultdict

path = sys.argv[1]
raw = open(path, encoding="utf-8-sig", newline="").read()
print("BOM:", raw.startswith("﻿"), "CRLF:", "\r\n" in raw)
rows = list(csv.reader(raw.splitlines()))
print("Total physical lines:", len(rows))
for i, r in enumerate(rows[:6]):
    print(i, r)

# header = first row with >=2 non-empty, mostly non-numeric cells
hi = next(i for i, r in enumerate(rows) if sum(1 for c in r if c.strip()) >= 2 and "comanda" in ",".join(r).lower())
header = rows[hi]
print("Header at line", hi + 1, header)
body = rows[hi + 1:]
ncols = len(header)
print("Width distribution:", Counter(len(r) for r in body))

def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()

empty, totals, data = [], [], []
for idx, r in enumerate(body, start=hi + 2):
    cells = [c.strip() for c in r]
    if not any(cells):
        empty.append(idx); continue
    first = next(c for c in cells if c)
    if re.search(r"\b(total|subtotal|sumar)\b", fold(first)):
        totals.append((idx, r)); continue
    data.append((idx, r))
print("\nEmpty rows:", len(empty), empty)
print("Total rows:", len(totals))
for t in totals: print("  ", t)
print("Data rows:", len(data))

col = {h: i for i, h in enumerate(header)}
def colvals(name): return [r[col[name]] for _, r in data]

print("\n=== Raw column profile ===")
for h in header:
    v = colvals(h)
    nulls = sum(1 for x in v if not x.strip())
    ws = sum(1 for x in v if x != x.strip())
    c = Counter(v)
    print(f"\n[{h}] nulls={nulls} distinct={len(c)} leading/trailing ws={ws}")
    print("  top:", c.most_common(8))
    if len(c) > 8: print("  bottom:", c.most_common()[-5:])

def num(s):
    s = s.strip().replace(" ", "")
    if not s: return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."): s = s.replace(".", "").replace(",", ".")
        else: s = s.replace(",", "")
    elif "," in s: s = s.replace(",", ".")
    try: return float(s)
    except: return None

def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p; f = int(k)
    return xs[f] + (xs[min(f + 1, len(xs) - 1)] - xs[f]) * (k - f)

def describe(name, xs):
    print(f"\n[{name}] n={len(xs)} min={min(xs):.2f} p5={pct(xs,.05):.2f} p25={pct(xs,.25):.2f} "
          f"median={pct(xs,.5):.2f} mean={statistics.mean(xs):.2f} p75={pct(xs,.75):.2f} "
          f"p95={pct(xs,.95):.2f} max={max(xs):.2f} sd={statistics.pstdev(xs):.2f} "
          f"zeros={sum(1 for x in xs if x==0)} neg={sum(1 for x in xs if x<0)}")

print("\n=== Numeric ===")
q = [num(x) for x in colvals("Cantitate")]
p = [num(x) for x in colvals("Pret unitar")]
print("Unparseable qty:", sum(1 for x in q if x is None), "price:", sum(1 for x in p if x is None))
print("Non-integer qty:", [x for x in q if x is not None and x != int(x)])
describe("Cantitate", [x for x in q if x is not None])
describe("Pret unitar", [x for x in p if x is not None])
print("Price formats:", Counter("RO(1.234,56)" if re.fullmatch(r"\d{1,3}(\.\d{3})*,\d+", x.strip()) else "other:" + x for x in colvals("Pret unitar")).most_common(5))

# normalized dataset
STATUS = [("livrat", "Livrată"), ("retur", "Retur"), ("anulat", "Anulată"), ("in curs", "În curs")]
def norm_status(s):
    f = fold(s)
    for k, v in STATUS:
        if f.startswith(k): return v
    return s.strip()

recs = []
for idx, r in data:
    d = {h: r[col[h]].strip() for h in header}
    d["_line"] = idx
    d["_q"], d["_p"] = num(d["Cantitate"]), num(d["Pret unitar"])
    d["_val"] = d["_q"] * d["_p"] if d["_q"] is not None and d["_p"] is not None else None
    d["_status"] = norm_status(d["Status"])
    d["_client"] = re.sub(r"\s+", " ", fold(d["Client"]))
    d["_prod"] = re.sub(r"\s+", " ", fold(d["Produs"]))
    m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{4})", d["Data"])
    d["_month"] = f"{m[3]}-{m[2]}" if m else None
    d["_date"] = f"{m[3]}-{m[2]}-{m[1]}" if m else None
    recs.append(d)

print("\n=== Dates ===")
bad = [r["Data"] for r in recs if not r["_date"]]
print("Unparseable dates:", bad)
ds = sorted(r["_date"] for r in recs if r["_date"])
print("Range:", ds[0], "->", ds[-1])
print("Per month:", sorted(Counter(r["_month"] for r in recs).items()))
invalid = []
import datetime
for r in recs:
    if r["_date"]:
        try: datetime.date.fromisoformat(r["_date"])
        except: invalid.append(r["Data"])
print("Invalid calendar dates:", invalid)

print("\n=== Duplicates on Nr comanda ===")
byid = defaultdict(list)
for r in recs: byid[r["Nr comanda"]].append(r)
exact = conflict = 0
for k, v in byid.items():
    if len(v) > 1:
        sig = {tuple((r["_date"], r["_client"], r["_prod"], r["_q"], r["_p"], r["Valuta"], r["_status"])) for r in v}
        kind = "identical after normalization" if len(sig) == 1 else "CONFLICT"
        if len(sig) == 1: exact += len(v) - 1
        else: conflict += 1
        print(f"  {k} x{len(v)} lines {[r['_line'] for r in v]} -> {kind}")
print("Removable exact dups:", exact, "conflicting IDs:", conflict)
ids = [r["Nr comanda"] for r in recs]
print("ID pattern ok:", all(re.fullmatch(r"CMD-\d{6}", i) for i in ids))
nums = sorted({int(i[4:]) for i in ids})
gaps = sorted(set(range(nums[0], nums[-1] + 1)) - set(nums))
print(f"ID range CMD-{nums[0]}..CMD-{nums[-1]}, unique={len(nums)}, missing={gaps}")

# dedupe
seen, clean = set(), []
for r in recs:
    if r["Nr comanda"] in seen: continue
    seen.add(r["Nr comanda"]); clean.append(r)

print("\n=== Categorical after normalization (clean, n=%d) ===" % len(clean))
for key, raw_key in (("_client", "Client"), ("_prod", "Produs")):
    groups = defaultdict(Counter)
    for r in clean: groups[r[key]][r[raw_key]] += 1
    print(f"\n{raw_key}: raw distinct={len({r[raw_key] for r in recs})}, normalized distinct={len(groups)}")
    for g, c in sorted(groups.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"  {sum(c.values()):3d}  {c.most_common(1)[0][0]!r}  variants={dict(c) if len(c)>1 else ''}")
print("\nStatus raw variants:", Counter(repr(r["Status"]) for r in recs))
print("Status normalized:", Counter(r["_status"] for r in clean))
print("Valuta:", Counter(r["Valuta"] for r in clean))

print("\n=== Value (qty x price) per currency ===")
for cur in sorted({r["Valuta"] for r in clean}):
    sub = [r for r in clean if r["Valuta"] == cur]
    vals = [r["_val"] for r in sub]
    describe(f"valoare {cur}", vals)
    for st in ("Livrată", "Retur", "Anulată", "În curs"):
        s = [r["_val"] for r in sub if r["_status"] == st]
        print(f"   {st:8s} n={len(s):3d} sum={sum(s):,.2f}")
    print(f"   TOTAL    n={len(sub):3d} sum={sum(vals):,.2f}")
    top = sorted(sub, key=lambda r: -r["_val"])[:3]
    print("   top orders:", [(r["Nr comanda"], r["Produs"], r["_q"], r["_p"], round(r["_val"], 2)) for r in top])

print("\n=== Delivered revenue by month x currency ===")
agg = defaultdict(float)
for r in clean:
    if r["_status"] == "Livrată": agg[(r["_month"], r["Valuta"])] += r["_val"]
for k in sorted(agg): print("  ", k, f"{agg[k]:,.2f}")

print("\n=== Product -> price consistency (per currency) ===")
pp = defaultdict(list)
for r in clean: pp[(r["_prod"], r["Valuta"])].append(r["_p"])
for k in sorted(pp):
    v = pp[k]; print(f"  {k}: n={len(v)} min={min(v):.2f} max={max(v):.2f} ratio={max(v)/min(v):.1f}")

print("\n=== Totals rows vs computed ===")
for idx, r in totals:
    print("  line", idx, [c for c in r if c.strip()])
```
