# Plugin-uri

Se instalează din Claude Code. Catalogul complet: [claude.com/plugins](https://claude.com/plugins)

## Val Town — bază de date, server, hosting

```
/plugin install valtown@claude-plugins-official
```

Cont gratuit pe [val.town](https://val.town) (login cu GitHub). La prima folosire îți deschide
browserul să te loghezi. Fără chei API. [Docs](https://docs.val.town/guides/prompting/plugin/)

## Data — explorare CSV și grafice

```
/plugin marketplace add anthropics/knowledge-work-plugins
/plugin install data@knowledge-work-plugins
```

Comenzi: `/data:explore-data`, `/data:validate-data`, `/data:create-viz`
[Repo](https://github.com/anthropics/knowledge-work-plugins)

## Opțional

```
/plugin install typescript-lsp@claude-plugins-official
npm install -g typescript-language-server
```

Claude vede erorile de tip imediat după ce editează.

---

`/plugin list` ca să vezi ce ai instalat. Dacă nu apar, `/reload-plugins`.
