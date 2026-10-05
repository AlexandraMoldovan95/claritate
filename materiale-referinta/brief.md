# Brief: dashboard din CSV

Aplicație web în care urci un CSV și primești automat tabele și grafice.

## Ce face aplicația

1. Urci un fișier CSV.
2. Îl citește, identifică ce coloane are și curăță datele.
3. Îți arată tabele, grafice și câteva cifre importante.
4. Poți să întrebi ceva în română despre date și îți răspunde.

## Ce folosim

- Claude Code
- Val Town — bază de date, server și găzduire (cont gratuit)
- Plugin-urile din `PLUGINURI.md`

## Scopul final

Un link public care se deschide și pe telefon. Intri, urci un CSV, vezi dashboard-ul.

## Cerințe

- Trebuie să meargă cu orice CSV, nu doar cu unul pregătit anume pentru demo.
- Nu se blochează pe date murdare: rânduri goale, sume scrise ca text, același nume scris
  în trei feluri, rânduri de total intercalate.
- Modelul nu calculează numere. El alege *ce* se calculează, codul face aritmetica.

## Livrabile

- `PLAN.md` — 10 rânduri, scrise înainte de orice cod: ce piese are aplicația și ce plugin
  face fiecare piesă
- linkul aplicației
