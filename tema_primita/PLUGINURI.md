# Plugin-uri

Se instaleaza din Claude Code. Catalogul complet: [claude.com/plugins](https://claude.com/plugins)

## Val Town — baza de date, server, hosting

```
/plugin install valtown@claude-plugins-official
```

Cont gratuit pe [val.town](https://val.town) (login cu GitHub). La prima folosire iti deschide
browserul sa te loghezi. Fara chei API. [Docs](https://docs.val.town/guides/prompting/plugin/)

## Data — explorare CSV si grafice

```
/plugin marketplace add anthropics/knowledge-work-plugins
/plugin install data@knowledge-work-plugins
```

Comenzi: `/data:explore-data`, `/data:validate-data`, `/data:create-viz`
[Repo](https://github.com/anthropics/knowledge-work-plugins)

## Optional

```
/plugin install typescript-lsp@claude-plugins-official
npm install -g typescript-language-server
```

Claude vede erorile de tip imediat dupa ce editeaza.

---

`/plugin list` ca sa vezi ce ai. Daca nu apar, `/reload-plugins`.
