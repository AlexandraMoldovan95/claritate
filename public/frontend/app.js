// Claritate — interfața. Vanilla JS, fără build.
// Tot textul care vine din CSV intră în pagină prin textContent (niciodată innerHTML).
"use strict";

(() => {
  // ------------------------------------------------------------------ utilitare
  const $ = (sel, root = document) => root.querySelector(sel);
  const NS = "http://www.w3.org/2000/svg";

  /** el("div", { class: "x", onclick: fn }, [copii…]) — text sigur prin textContent. */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v; // folosit DOAR cu SVG-uri statice din acest fișier
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "style") node.setAttribute("style", v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }
  const svgText = (x, y, str, cls, anchor = "start") => { const t = svg("text", { x, y, class: cls, "text-anchor": anchor }); t.textContent = str; return t; };

  const nf2 = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 });
  const pf = new Intl.NumberFormat("ro-RO", { style: "percent", maximumFractionDigits: 1 });
  // „1 comandă”, „5 comenzi”, „20 de comenzi” (în română, „de” după numere care se termină în 00 sau 20–99)
  const nComenzi = (n) => { const r = Math.abs(n) % 100; return `${nf0.format(n)} ${n === 1 ? "comandă" : (r === 0 && n !== 0) || r >= 20 ? "de comenzi" : "comenzi"}`; };
  const money = (v, cur) => `${cur ? cur + " " : ""}${nf2.format(v)}`;
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} mil.`;
    if (a >= 1e3) return `${(v / 1e3).toLocaleString("ro-RO", { maximumFractionDigits: a >= 1e4 ? 0 : 1 })}k`;
    return nf0.format(v);
  };
  const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
  const MONTHS_SHORT = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sep.", "oct.", "nov.", "dec."];
  const monthLong = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const monthShort = (m) => MONTHS_SHORT[+m.slice(5, 7) - 1];
  const dateRo = (d) => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—";
  const curLabel = (c) => c || "fără monedă";

  const ICON = {
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/></svg>',
    sum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H6l6 8-6 8h12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6a6 6 0 0 0 6 6h6M15 12l3 3-3 3M6 21v-3"/></svg>',
    num: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 9v8H9"/></svg>',
  };
  const iconBadge = (name) => el("span", { class: "icon-badge", "aria-hidden": "true", html: ICON[name] });

  const STATUS_COLOR = { "Livrată": "var(--st-livrata)", "În curs": "var(--st-curs)", "Retur": "var(--st-retur)", "Anulată": "var(--st-anulata)" };
  const STATUS_ORDER = ["Livrată", "În curs", "Retur", "Anulată"];
  const statusColor = (s) => STATUS_COLOR[s] || "var(--series-muted)";

  // ------------------------------------------------------------------ tooltip
  const tip = $("#tooltip");
  function showTip(evt, value, label) {
    tip.replaceChildren(el("div", { class: "tt-value", text: value }), el("div", { class: "tt-label", text: label }));
    const r = evt.target.getBoundingClientRect ? evt.target.getBoundingClientRect() : null;
    const x = evt.clientX ?? (r ? r.left + r.width / 2 : 0);
    const y = evt.clientY ?? (r ? r.top : 0);
    tip.classList.add("show");
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8)}px`;
    tip.style.top = `${Math.max(8, y - h - 12)}px`;
  }
  const hideTip = () => tip.classList.remove("show");
  window.addEventListener("scroll", hideTip, { passive: true });

  // ------------------------------------------------------------------ stare
  const state = { id: null, analysis: null, currency: null, tab: "summary", roles: {}, pivot: null };

  const TABS = [
    { id: "summary", label: "Sumar general" },
    { id: "delivered", label: "Venit livrat" },
    { id: "lost", label: "Venit pierdut" },
    { id: "months", label: "Cea mai bună / slabă lună" },
    { id: "top", label: "Top clienți și produse" },
    { id: "health", label: "Sănătatea comenzilor" },
    { id: "pivot", label: "Tabel pivot" },
  ];

  // ------------------------------------------------------------------ API
  async function api(url, opts = {}) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch { /* răspuns ne-JSON */ }
    if (!res.ok) throw new Error((data && data.error) || `Eroare ${res.status}. Încearcă din nou.`);
    return data;
  }

  const statusLine = $("#uploadStatus");
  function setStatus(text, kind) {
    statusLine.className = "status-line" + (kind === "error" ? " error" : "");
    statusLine.replaceChildren();
    if (kind === "loading") statusLine.append(el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), text]));
    else if (text) statusLine.append(text);
  }

  async function uploadFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setStatus("Fișierul e prea mare (maxim 5 MB).", "error");
    setStatus(`Citesc „${file.name}”…`, "loading");
    const form = new FormData();
    form.append("file", file);
    try { show(await api("/api/upload", { method: "POST", body: form }), true); }
    catch (e) { setStatus(e.message, "error"); }
  }

  async function uploadExample(name) {
    setStatus("Încarc exemplul…", "loading");
    try {
      show(await api("/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ example: name }) }), true);
    } catch (e) { setStatus(e.message, "error"); }
  }

  async function loadById(id) {
    setStatus("Deschid dashboard-ul…", "loading");
    try { show(await api(`/api/view?id=${encodeURIComponent(id)}`), false); }
    catch (e) { setStatus(e.message, "error"); history.replaceState(null, "", "/"); }
  }

  function show(data, push) {
    if (state.id !== data.id) state.pivot = null; // pivotul ales ține de fișier
    state.id = data.id;
    state.analysis = data.analysis;
    const curs = data.analysis.dashboards.summary.currencies.map((c) => c.currency);
    if (!curs.includes(state.currency)) state.currency = curs[0] ?? "";
    if (push) history.pushState({ id: data.id }, "", `/d/${data.id}`);
    setStatus("");
    $("#start").hidden = true;
    $("#compare").hidden = true;
    $("#app").hidden = false;
    $("#newFileTop").hidden = false;
    renderAll();
    window.scrollTo({ top: 0 });
    $("#fileTitle").focus?.();
  }

  function resetToStart() {
    state.id = null; state.analysis = null;
    history.pushState(null, "", "/");
    $("#app").hidden = true; $("#compare").hidden = true; $("#start").hidden = false; $("#newFileTop").hidden = true;
    $("#fileInput").value = "";
    $("#answer").replaceChildren();
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------------ randare
  function renderAll() {
    const a = state.analysis;
    const s = a.dashboards.summary;
    // Numele lungi de fișier se rup după „_”, „-” sau „.”, nu în mijlocul extensiei.
    $("#fileTitle").replaceChildren(...a.meta.filename.split(/(?<=[_.\-])/).flatMap((part, i) => i ? [document.createElement("wbr"), part] : [part]));
    $("#fileTitle").setAttribute("tabindex", "-1");
    const period = s.period ? ` · ${dateRo(s.period.from)} – ${dateRo(s.period.to)}` : "";
    $("#fileMeta").textContent = `${nf0.format(a.meta.rows)} ${a.meta.rows === 1 ? "rând valid" : "rânduri valide"} · ${a.meta.columns} coloane${period}`;
    renderStructure();
    renderCleaning();
    renderCurrencies();
    renderTabs();
    renderPanel();
    renderSuggestions();
  }

  const ROLE_OPTIONS = [
    ["id", "ID / nr. comandă"], ["date", "Dată"], ["category", "Categorie (client, produs…)"], ["status", "Status"],
    ["quantity", "Cantitate"], ["unit_price", "Preț unitar"], ["amount", "Valoare / sumă"], ["currency", "Monedă"],
    ["number", "Alt număr"], ["text", "Text liber"], ["ignore", "Ignoră coloana"],
  ];

  function renderStructure() {
    const a = state.analysis;
    const m = a.meta;
    $("#structureSub").textContent = `${m.columns} coloane · antet pe linia ${m.headerLine} · separator „${m.delimiter}” · valoare = ${m.valueFormula}`;
    const box = $("#structure");
    box.replaceChildren();
    if (m.preamble.length) {
      box.append(el("p", { class: "note-line" }, [`Am sărit peste ${m.preamble.length} ${m.preamble.length === 1 ? "rând" : "rânduri"} de text de deasupra tabelului: `, el("em", { text: m.preamble.slice(0, 2).join(" · ") })]));
    }
    const tbody = el("tbody");
    for (const c of a.columns) {
      const sel = el("select", { "aria-label": `Rolul coloanei ${c.name}`, onchange: (e) => changeRole(c.index, e.target.value) },
        ROLE_OPTIONS.map(([v, l]) => el("option", { value: v, selected: v === c.role }, l)));
      tbody.append(el("tr", {}, [
        el("td", {}, [el("div", { class: "col-name", text: c.name }), el("div", { class: "samples", text: c.samples.slice(0, 3).join(" · ") })]),
        el("td", {}, sel),
        el("td", {}, el("span", { class: "by-tag" + (c.detectedBy === "manual" ? " manual" : ""), text: c.detectedBy === "manual" ? "ales de tine" : `după ${c.detectedBy}` })),
      ]));
    }
    box.append(el("table", { class: "roles" }, [
      el("thead", {}, el("tr", {}, [el("th", { text: "Coloană" }), el("th", { text: "Rol" }), el("th", { text: "Detectat" })])),
      tbody,
    ]));
    box.append(el("p", { class: "note-line", text: "Dacă un rol e greșit, schimbă-l și dashboard-urile se recalculează imediat." }));
  }

  async function changeRole(index, role) {
    const overrides = {};
    for (const c of state.analysis.columns) if (c.detectedBy === "manual") overrides[c.index] = c.role;
    overrides[index] = role;
    try {
      const data = await api(`/api/set-roles?id=${encodeURIComponent(state.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ overrides }) });
      const wasOpen = $("#structureCard").open;
      show(data, false);
      $("#structureCard").open = wasOpen;
    } catch (e) { alertInline($("#structure"), e.message); }
  }

  function renderCleaning() {
    const r = state.analysis.report;
    const removedTotal = r.empty + r.totals + r.duplicates;
    $("#cleanSub").textContent = `Din ${nf0.format(r.linesAfterHeader)} rânduri sub antet au rămas ${nf0.format(r.kept)}.`;
    const items = [];
    const li = (icon, n, text) => el("li", {}, [iconBadge(icon), el("span", {}, [el("span", { class: "n", text: nf0.format(n) }), " ", text])]);
    if (r.empty) items.push(li("empty", r.empty, r.empty === 1 ? "rând gol eliminat" : "rânduri goale eliminate"));
    if (r.totals) items.push(li("sum", r.totals, r.totals === 1 ? "rând de total eliminat (nu e o comandă și ar dubla sumele)" : "rânduri de total eliminate (nu sunt comenzi și ar dubla sumele)"));
    if (r.duplicates) items.push(li("copy", r.duplicates, r.duplicates === 1 ? "comandă duplicată eliminată (identică cu alta)" : "comenzi duplicate eliminate (identice cu altele)"));
    const merged = r.mergedVariants.reduce((n, v) => n + v.variants.length - 1, 0);
    if (merged) {
      const ex = r.mergedVariants.find((v) => v.variants.length > 1);
      items.push(li("merge", merged, `scrieri diferite ale aceluiași nume unificate (ex. „${ex.variants.slice(1, 3).join("”, „")}” → „${ex.canonical}”)`));
    }
    const statusRaw = r.statusVariants.length;
    if (statusRaw > 4) items.push(li("merge", statusRaw, `variante de status aduse la ${new Set(r.statusVariants.map((s) => s.normalized)).size} (Livrată, Retur, Anulată, În curs)`));
    if (r.repairedNumbers) items.push(li("num", r.repairedNumbers, "sume/prețuri citite din format text (ex. „1.841,86”)"));
    if (!items.length) items.push(li("check", 0, "probleme găsite — fișierul era deja curat"));
    const box = $("#cleaning");
    box.replaceChildren(el("ul", { class: "clean-list" }, items));

    const warns = [];
    for (const c of r.conflicts) warns.push(`ID-ul „${c.id}” apare de ${c.lines.length} ori cu conținut diferit (liniile ${c.lines.join(", ")}). Am păstrat toate rândurile, pentru că nu știm care e cel corect.`);
    if (r.noValue) warns.push(`${r.noValue} ${r.noValue === 1 ? "rând nu are" : "rânduri nu au"} o valoare numerică. Au rămas în numărători, dar nu intră în sume.`);
    if (r.invalidDates) warns.push(`${r.invalidDates} ${r.invalidDates === 1 ? "dată nu a putut fi citită" : "date nu au putut fi citite"}. Rândurile rămân, dar nu apar în graficele pe lună.`);
    if (r.unknownStatuses.length) warns.push(`Statusuri pe care nu le-am recunoscut, păstrate ca atare: ${r.unknownStatuses.slice(0, 5).join(", ")}.`);
    if (r.noIdColumn) warns.push("Fișierul nu are o coloană de ID, deci duplicatele nu pot fi verificate.");
    for (const w of warns) box.append(el("div", { class: "warn-box" }, [el("span", { html: ICON.warn, "aria-hidden": "true" }), el("span", { text: w })]));
    if (removedTotal && r.removed.length) {
      box.append(el("details", { class: "table-view" }, [
        el("summary", { text: "Vezi rândurile eliminate" }),
        tableView(["Linia", "Motiv", "Conținut"], r.removed.map((x) => [x.line, x.reason, x.preview]), [0]),
      ]));
    }
  }

  function renderCurrencies() {
    const curs = state.analysis.dashboards.summary.currencies.map((c) => c.currency);
    const box = $("#currencyControls");
    box.hidden = curs.length < 2;
    $("#currencySeg").replaceChildren(...curs.map((c) => el("button", {
      type: "button", "aria-pressed": String(c === state.currency),
      onclick: () => { state.currency = c; renderCurrencies(); renderPanel(); },
    }, curLabel(c))));
  }

  function renderTabs() {
    const tabs = $("#tabs");
    tabs.replaceChildren(...TABS.map((t, i) => el("button", {
      class: "tab", role: "tab", id: `tab-${t.id}`, type: "button",
      "aria-selected": String(t.id === state.tab), "aria-controls": "panel", tabindex: t.id === state.tab ? "0" : "-1",
      onclick: () => selectTab(t.id),
      onkeydown: (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
        selectTab(next.id); $(`#tab-${next.id}`).focus();
      },
    }, [el("span", { class: "num", text: String(i + 1), "aria-hidden": "true" }), t.label])));
    $("#panel").setAttribute("aria-labelledby", `tab-${state.tab}`);
  }
  function selectTab(id) { state.tab = id; renderTabs(); renderPanel(); }

  function renderPanel() {
    hideTip();
    const panel = $("#panel");
    panel.replaceChildren();
    const fn = { summary: pSummary, delivered: pDelivered, lost: pLost, months: pMonths, top: pTop, health: pHealth, pivot: pPivot }[state.tab];
    fn(panel, state.analysis.dashboards, state.currency);
  }

  const head = (title, text) => el("div", { class: "panel-head" }, el("div", {}, [el("h2", { text: title }), text ? el("p", { text }) : null]));
  const emptyState = (text) => el("div", { class: "empty-state" }, [el("span", { html: ICON.info, "aria-hidden": "true" }), el("span", { text })]);
  const kpi = (label, value, cur, note, opts = {}) => el("div", { class: "kpi" + (opts.hero ? " hero" : "") }, [
    el("div", { class: "label", text: label }),
    el("div", { class: "value" }, [cur ? el("span", { class: "cur", text: cur }) : null, value]),
    note ? el("div", { class: "note" }, note) : null,
  ]);
  const card = (title, sub, body, cls = "") => el("section", { class: `card chart-card ${cls}` }, [el("h3", { text: title }), sub ? el("p", { class: "sub", text: sub }) : null, ...[].concat(body)]);
  const alertInline = (box, msg) => box.prepend(el("div", { class: "warn-box" }, [el("span", { html: ICON.warn, "aria-hidden": "true" }), el("span", { text: msg })]));

  function tableView(cols, rows, numCols = []) {
    return el("div", { class: "table-scroll" }, el("table", { class: "data" }, [
      el("thead", {}, el("tr", {}, cols.map((c, i) => el("th", { class: numCols.includes(i) ? "num" : "", scope: "col", text: c })))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v, i) => el("td", { class: numCols.includes(i) ? "num" : "", text: v ?? "—" }))))),
    ]));
  }
  const withTable = (cols, rows, numCols) => el("details", { class: "table-view" }, [el("summary", { text: "Vezi datele ca tabel" }), tableView(cols, rows, numCols)]);

  // ------------------------------------------------------------------ grafice
  /** Bare orizontale, o singură serie (culoarea 1). Valoarea stă la capăt. */
  function hbars(items, cur, opts = {}) {
    if (!items.length) return emptyState("Nu există date pentru acest grafic.");
    const max = Math.max(...items.map((i) => i.value), 0) || 1;
    return el("ol", { class: "hbars" }, items.map((it) => el("li", { class: "hbar" }, [
      el("span", { class: "name", title: it.name }, [it.name, it.flag ? el("span", { class: "flag", title: it.flag, "aria-label": it.flag, text: " ⚠" }) : null]),
      el("span", { class: "val" }, [money(it.value, cur), opts.share && it.share !== undefined ? el("small", { text: pf.format(it.share) }) : null]),
      el("span", { class: "track", "aria-hidden": "true" }, el("span", { class: "fill", style: `width:${Math.max(0.5, (it.value / max) * 100)}%;${opts.color ? `background:${opts.color}` : ""}` })),
    ])));
  }

  /** Bară stivuită 100% + legendă cu valori (identitatea nu depinde doar de culoare). */
  function stackBar(parts, fmt) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    const shown = parts.filter((p) => p.value > 0);
    const bar = el("div", { class: "stack", role: "img", "aria-label": parts.map((p) => `${p.label}: ${fmt(p.value)} (${pf.format(p.value / total)})`).join("; ") },
      shown.map((p) => {
        const seg = el("span", { class: "seg-part", style: `flex:${p.value};background:${p.color}` });
        seg.addEventListener("pointermove", (e) => showTip(e, `${fmt(p.value)} · ${pf.format(p.value / total)}`, p.label));
        seg.addEventListener("pointerleave", hideTip);
        return seg;
      }));
    const legend = el("ul", { class: "legend" }, parts.map((p) => el("li", {}, [
      el("span", { class: "swatch", style: `background:${p.color}`, "aria-hidden": "true" }),
      el("span", {}, [p.label, el("strong", { text: `${fmt(p.value)} · ${pf.format(p.value / total)}` })]),
    ])));
    return [bar, legend];
  }

  /** Scală „rotundă”: pas 1/2/2,5/5 × 10^n și 4 intervale egale (0, 10k, 20k…). */
  function niceScale(v, ticks = 4) {
    if (v <= 0) return { max: 1, step: 0.25 };
    const raw = v / ticks;
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return { max: step * Math.ceil(v / step - 1e-9), step };
  }

  /** Graficele SVG se desenează la lățimea reală a containerului, ca textul să rămână la 11–12px. */
  function responsive(draw, height) {
    const box = el("div", { class: "chart" });
    let lastW = 0;
    const render = () => {
      const w = Math.round(box.clientWidth);
      if (!w || w === lastW) return;
      lastW = w;
      box.replaceChildren(draw(w, height(w)));
    };
    requestAnimationFrame(render);
    if ("ResizeObserver" in window) new ResizeObserver(() => render()).observe(box);
    return box;
  }

  /** Coloane pe luni, o serie; opțional evidențiere (emfază) pentru anumite luni. */
  function columns(points, cur, opts = {}) {
    // points: [{ key, label, value, color?, tag? }]
    if (!points.length) return emptyState("Nu există date pe luni.");
    return responsive((W, H) => drawColumns(points, cur, opts, W, H), (w) => (w < 480 ? 240 : 300));
  }

  function drawColumns(points, cur, opts, W, H) {
    const L = 48, R = 8, T = 24, B = 34;
    const { max, step: tick } = niceScale(Math.max(...points.map((p) => p.value), 0));
    const band = (W - L - R) / points.length;
    const bw = Math.min(24, band * 0.6);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": opts.aria || "Grafic pe luni" });
    for (let v = 0; v <= max + 1e-9; v += tick) {
      const yy = y(v);
      root.append(svg("line", { x1: L, x2: W - R, y1: yy, y2: yy, class: v === 0 ? "baseline" : "gridline" }));
      root.append(svgText(L - 8, yy + 4, compact(v), "axis-text", "end"));
    }
    const everyLabel = band < 28 ? Math.ceil(28 / band) : 1;
    points.forEach((p, i) => {
      const cx = L + band * i + band / 2;
      const h = Math.max(0, y(0) - y(p.value));
      const x = cx - bw / 2, top = y(0) - h;
      const color = p.color || "var(--series-1)";
      if (h > 0.5) {
        const r = Math.min(4, h, bw / 2);
        root.append(svg("path", { d: `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`, fill: color }));
      } else {
        root.append(svg("line", { x1: x, x2: x + bw, y1: y(0) - 1, y2: y(0) - 1, stroke: color, "stroke-width": 2 }));
      }
      if (i % everyLabel === 0 || p.tag) root.append(svgText(cx, H - B + 18, p.label, "axis-text", "middle"));
      if (p.tag && band >= 46) root.append(svgText(cx, top - 6, p.tag, "value-text-muted", "middle"));
      const hit = svg("rect", { x: L + band * i, y: T, width: band, height: H - T - B, class: "hit", tabindex: 0, "aria-label": `${p.full || p.label}: ${money(p.value, cur)}` });
      const onShow = (e) => showTip(e, money(p.value, cur), `${p.full || p.label}${p.note ? " · " + p.note : ""}`);
      hit.addEventListener("pointermove", onShow);
      hit.addEventListener("focus", (e) => { const r = hit.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top + 20, target: hit }, money(p.value, cur), p.full || p.label); });
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("blur", hideTip);
      root.append(hit);
    });
    return root;
  }

  /** Linie + zonă (10%) pe luni, o serie, cu reticul și tooltip. */
  function line(points, cur, opts = {}) {
    if (points.length < 2) return columns(points, cur, opts);
    return responsive((W, H) => drawLine(points, cur, opts, W, H), (w) => (w < 480 ? 220 : 260));
  }

  function drawLine(points, cur, opts, W, H) {
    const L = 48, R = 16, T = 18, B = 32;
    const { max, step: tick } = niceScale(Math.max(...points.map((p) => p.value), 0));
    const step = (W - L - R) / (points.length - 1);
    const x = (i) => L + step * i;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": opts.aria || "Evoluție pe luni" });
    for (let v = 0; v <= max + 1e-9; v += tick) {
      const yy = y(v);
      root.append(svg("line", { x1: L, x2: W - R, y1: yy, y2: yy, class: v === 0 ? "baseline" : "gridline" }));
      root.append(svgText(L - 8, yy + 4, compact(v), "axis-text", "end"));
    }
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
    root.append(svg("path", { d: `${d} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`, fill: "var(--series-1)", "fill-opacity": 0.1 }));
    root.append(svg("path", { d, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - L - R) / 48))));
    points.forEach((p, i) => { if (i % labelEvery === 0 || i === points.length - 1) root.append(svgText(x(i), H - B + 16, p.label, "axis-text", "middle")); });
    const last = points[points.length - 1];
    root.append(svg("circle", { cx: x(points.length - 1), cy: y(last.value), r: 4.5, fill: "var(--series-1)", stroke: "#fff", "stroke-width": 2 }));
    const cross = svg("line", { y1: T, y2: H - B, stroke: "#94A3B8", "stroke-width": 1, visibility: "hidden" });
    const dot = svg("circle", { r: 4.5, fill: "var(--series-1)", stroke: "#fff", "stroke-width": 2, visibility: "hidden" });
    root.append(cross, dot);
    const hit = svg("rect", { x: L, y: T, width: W - L - R, height: H - T - B, class: "hit" });
    hit.addEventListener("pointermove", (e) => {
      const box = root.getBoundingClientRect();
      const px = (e.clientX - box.left) * (W / box.width);
      const i = Math.max(0, Math.min(points.length - 1, Math.round((px - L) / step)));
      const p = points[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.value)); dot.setAttribute("visibility", "visible");
      showTip(e, money(p.value, cur), p.full || p.label);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
    root.append(hit);
    return root;
  }

  // ------------------------------------------------------------------ dashboard-uri
  function curRow(list, cur) { return list.find((x) => x.currency === cur); }

  function pSummary(panel, d, cur) {
    const s = d.summary;
    const c = curRow(s.currencies, cur);
    panel.append(head("Sumar general", `Toate comenzile valide după curățare${s.period ? `, între ${dateRo(s.period.from)} și ${dateRo(s.period.to)}` : ""}. Sumele sunt în ${curLabel(cur)}.`));
    const k = el("div", { class: "kpis" });
    k.append(kpi("Comenzi valide", nf0.format(s.orders), null, `${s.currencies.map((x) => `${nf0.format(x.count)} în ${curLabel(x.currency)}`).join(" · ")}`, { hero: true }));
    if (c) {
      k.append(kpi(`Valoare totală (${curLabel(cur)})`, nf2.format(c.total), cur, "toate statusurile"));
      k.append(kpi("Valoare medie pe comandă", nf2.format(c.avg), cur, [`mediana: `, el("strong", { text: money(c.median, cur) })]));
      k.append(kpi("Cea mai mare comandă", nf2.format(c.max), cur, `cea mai mică: ${money(c.min, cur)}`));
    }
    panel.append(k);
    if (c && c.avg > c.median * 1.3) {
      panel.append(el("p", { class: "note-line", style: "margin:-4px 0 16px" }, `Media e mult peste mediană: câteva comenzi mari trag media în sus. Pentru o comandă „tipică”, mediana (${money(c.median, cur)}) e mai reprezentativă.`));
    }
    const grid = el("div", { class: "grid-2" });
    if (s.statusCounts.length) {
      const parts = orderStatuses(s.statusCounts).map((x) => ({ label: x.status, value: x.count, color: statusColor(x.status) }));
      grid.append(card("Comenzi pe status", "Număr de comenzi, toate monedele.", [...stackBar(parts, (v) => `${nf0.format(v)} com.`),
        withTable(["Status", "Comenzi"], parts.map((p) => [p.label, nf0.format(p.value)]), [1])]));
    } else {
      grid.append(card("Comenzi pe status", null, emptyState("Fișierul nu are o coloană de status, așa că toate comenzile sunt tratate la fel.")));
    }
    grid.append(card("Ce conține fișierul", null, el("ul", { class: "clean-list" }, [
      s.customers !== null ? el("li", {}, [iconBadge("rows"), el("span", {}, [el("span", { class: "n", text: nf0.format(s.customers) }), ` valori distincte în „${state.analysis.meta.customerColumn}”`])]) : null,
      s.products !== null ? el("li", {}, [iconBadge("rows"), el("span", {}, [el("span", { class: "n", text: nf0.format(s.products) }), ` valori distincte în „${state.analysis.meta.productColumn}”`])]) : null,
      el("li", {}, [iconBadge("num"), el("span", {}, [el("span", { class: "n", text: s.currencies.map((x) => curLabel(x.currency)).join(", ") || "—" }), " — sumele sunt calculate separat pe fiecare monedă"])]),
      s.noValueOrders ? el("li", {}, [iconBadge("warn"), el("span", {}, [el("span", { class: "n", text: nf0.format(s.noValueOrders) }), " comenzi fără valoare numerică (excluse din sume)"])]) : null,
    ])));
    panel.append(grid);
  }

  function orderStatuses(list) {
    return [...list].sort((a, b) => {
      const ia = STATUS_ORDER.indexOf(a.status), ib = STATUS_ORDER.indexOf(b.status);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  function pDelivered(panel, d, cur) {
    const x = d.delivered;
    panel.append(head("Venit livrat", x.assumedAll
      ? "Fișierul nu are coloană de status, deci toate comenzile sunt socotite venit."
      : "Doar comenzile cu status Livrată: bani care au intrat efectiv."));
    const row = curRow(x.byCurrency, cur);
    if (!x.available || !row) { panel.append(emptyState("Nu am găsit valori numerice pentru acest calcul. Verifică rolurile coloanelor.")); return; }
    const k = el("div", { class: "kpis" });
    k.append(kpi(`Venit livrat (${curLabel(cur)})`, nf2.format(row.total), cur, `${nComenzi(row.count)} livrate`, { hero: true }));
    for (const o of x.byCurrency.filter((o) => o.currency !== cur)) k.append(kpi(`Venit livrat (${curLabel(o.currency)})`, nf2.format(o.total), o.currency, `${nComenzi(o.count)}`));
    panel.append(k);
    const grid = el("div", { class: "grid-2" });
    if (x.monthly) {
      const vals = x.monthly.series[cur] || [];
      const pts = x.monthly.months.map((m, i) => ({ label: monthShort(m), full: monthLong(m), value: vals[i] || 0 }));
      grid.append(card("Evoluție pe luni", `Venit livrat pe lună, ${curLabel(cur)}.`, [line(pts, cur, { aria: `Venit livrat pe luni în ${curLabel(cur)}` }),
        withTable(["Luna", `Venit livrat (${curLabel(cur)})`], pts.map((p) => [p.full, nf2.format(p.value)]), [1])]));
    }
    if (x.topProducts) {
      const items = x.topProducts[cur] || [];
      grid.append(card(`Top după „${state.analysis.meta.productColumn}”`, `După venit livrat, ${curLabel(cur)}.`, [hbars(items, cur, { share: true }),
        withTable([state.analysis.meta.productColumn, "Venit", "Pondere", "Comenzi"], items.map((i) => [i.name, nf2.format(i.value), pf.format(i.share), i.count]), [1, 2, 3])]));
    }
    panel.append(grid);
  }

  function pLost(panel, d, cur) {
    const x = d.lost;
    panel.append(head("Venit pierdut", "Comenzile cu status Retur sau Anulată: bani care păreau câștigați, dar n-au mai intrat."));
    if (!x.available) { panel.append(emptyState("Fișierul nu are o coloană de status, deci nu se poate separa venitul pierdut.")); return; }
    const row = curRow(x.byCurrency, cur);
    if (!row) { panel.append(emptyState(`Nu există comenzi în ${curLabel(cur)}.`)); return; }
    const k = el("div", { class: "kpis" });
    k.append(kpi(`Venit pierdut (${curLabel(cur)})`, nf2.format(row.lost), cur, `${pf.format(row.share)} din valoarea tuturor comenzilor`, { hero: true }));
    k.append(kpi("Din retururi", nf2.format(row.retur), cur, `${nComenzi(x.counts.retur)} returnate (toate monedele)`));
    k.append(kpi("Din anulări", nf2.format(row.anulata), cur, `${nComenzi(x.counts.anulata)} anulate (toate monedele)`));
    k.append(kpi("Rata de pierdere", pf.format((x.counts.retur + x.counts.anulata) / (x.counts.total || 1)), null, "din numărul total de comenzi"));
    panel.append(k);
    const grid = el("div", { class: "grid-2" });
    grid.append(card("Retur vs. anulare", `Împărțirea venitului pierdut, ${curLabel(cur)}.`, stackBar([
      { label: "Retur", value: row.retur, color: "var(--st-retur)" },
      { label: "Anulată", value: row.anulata, color: "var(--st-anulata)" },
    ], (v) => money(v, cur))));
    const tc = (x.topCustomers && x.topCustomers[cur]) || [];
    grid.append(card(`Cele mai mari pierderi pe ${state.analysis.meta.customerColumn || "client"}`, `Retur + Anulată, ${curLabel(cur)}.`, [
      hbars(tc.map((t) => ({ name: t.name, value: t.value })), cur, { color: "var(--st-anulata)" }),
      withTable([state.analysis.meta.customerColumn || "Client", "Pierdut", "Retur", "Anulată", "Comenzi"], tc.map((t) => [t.name, nf2.format(t.value), nf2.format(t.retur), nf2.format(t.anulata), t.count]), [1, 2, 3, 4]),
    ]));
    panel.append(grid);
  }

  function pMonths(panel, d, cur) {
    const x = d.months;
    panel.append(head("Cea mai bună și cea mai slabă lună", "După venitul livrat din fiecare lună. Lunile cu comenzi, dar fără nimic livrat, intră cu 0."));
    if (!x.available) { panel.append(emptyState("Fișierul nu are o coloană de dată pe care s-o pot citi, deci nu pot compara lunile.")); return; }
    const row = x.byCurrency.find((b) => b.currency === cur);
    if (!row) { panel.append(emptyState(`Nu există comenzi în ${curLabel(cur)}.`)); return; }
    const byMonth = Object.fromEntries(row.months.map((m) => [m.month, m]));
    const bestM = byMonth[row.best[0]], worstM = byMonth[row.worst[0]];
    const k = el("div", { class: "kpis" });
    k.append(kpi("Cea mai bună lună", row.best.map(monthLong).join(", "), null, money(bestM.delivered, cur), { hero: true }));
    k.append(kpi("Cea mai slabă lună", row.worst.map(monthLong).join(", "), null, [money(worstM.delivered, cur), worstM.zeroDelivered ? " · nicio comandă livrată" : ""]));
    const withChange = row.months.filter((m) => m.change !== null);
    const lastM = row.months[row.months.length - 1];
    if (lastM.change !== null) {
      const up = lastM.change >= 0;
      k.append(kpi(`Ultima lună (${monthLong(lastM.month)})`, nf2.format(lastM.delivered), cur, [
        el("span", { class: `delta ${up ? "up" : "down"}`, html: up ? ICON.up : ICON.down }),
        ` ${up ? "+" : ""}${pf.format(lastM.change)} față de luna anterioară`,
      ]));
    }
    k.append(kpi("Luni analizate", nf0.format(row.months.length), null, withChange.length ? `${row.months.filter((m) => m.zeroDelivered).length} fără livrări` : null));
    panel.append(k);

    const best = new Set(row.best), worst = new Set(row.worst);
    const pts = row.months.map((m) => ({
      key: m.month, label: monthShort(m.month), full: monthLong(m.month), value: m.delivered,
      color: best.has(m.month) ? "var(--st-livrata)" : worst.has(m.month) ? "var(--st-anulata)" : "var(--series-muted)",
      tag: best.has(m.month) ? "maxim" : worst.has(m.month) ? "minim" : (m.incomplete ? "incompletă" : ""),
      note: m.incomplete ? "lună incompletă" : m.zeroDelivered ? "nicio livrare" : "",
    }));
    const notes = [];
    if (x.incompleteMonth && byMonth[x.incompleteMonth]) notes.push(el("p", { class: "note-line" }, [el("span", { class: "pill warn", text: "lună incompletă" }), ` ${monthLong(x.incompleteMonth)}: datele se opresc pe ${dateRo(x.lastDate)}, deci luna nu e comparabilă cu celelalte.`]));
    const zero = row.months.filter((m) => m.zeroDelivered).map((m) => monthLong(m.month));
    if (zero.length) notes.push(el("p", { class: "note-line" }, [el("span", { class: "pill bad", text: "0 livrări" }), ` ${zero.join(", ")}: au existat comenzi, dar niciuna livrată.`]));
    panel.append(card(`Venit livrat pe lună (${curLabel(cur)})`, "Verde = cea mai bună lună, roșu = cea mai slabă, gri = restul.", [
      columns(pts, cur, { aria: `Venit livrat pe luni în ${curLabel(cur)}; cea mai bună ${row.best.map(monthLong).join(", ")}, cea mai slabă ${row.worst.map(monthLong).join(", ")}` }),
      ...notes,
      withTable(["Luna", "Venit livrat", "Comenzi", "Față de luna anterioară"], row.months.map((m) => [
        monthLong(m.month) + (m.incomplete ? " (incompletă)" : ""), nf2.format(m.delivered), m.orders, m.change === null ? "—" : `${m.change >= 0 ? "+" : ""}${pf.format(m.change)}`,
      ]), [1, 2, 3]),
    ]));
  }

  function pTop(panel, d, cur) {
    const x = d.top;
    panel.append(head("Top clienți și produse", x.basis === "livrat" ? `După venitul livrat, ${curLabel(cur)}. Ponderea e din totalul livrat în aceeași monedă.` : `După valoarea tuturor comenzilor, ${curLabel(cur)}.`));
    if (!x.customers && !x.products) { panel.append(emptyState("Nu am găsit coloane de tip categorie (client, produs…). Poți marca una din „Ce am înțeles din fișier”.")); return; }
    const conflictNames = new Set(x.conflicts.flatMap((c) => c.names));
    if (x.conflicts.length) {
      panel.append(el("div", { class: "warn-box", style: "margin:0 0 16px" }, [el("span", { html: ICON.warn, "aria-hidden": "true" }),
        el("span", { text: `Atenție: ${x.conflicts.map((c) => `ID-ul ${c.id}`).join(", ")} apare de mai multe ori cu conținut diferit. Rândurile au fost păstrate, deci ${[...conflictNames].join(", ")} ${conflictNames.size === 1 ? "poate avea" : "pot avea"} valori umflate. Sunt marcate cu ⚠.` })]));
    }
    const grid = el("div", { class: "grid-2" });
    const mk = (title, items) => card(`Top după „${title}”`, null, [
      hbars(items.map((i) => ({ ...i, flag: conflictNames.has(i.name) ? "conține un ID duplicat cu conținut diferit" : null })), cur, { share: true }),
      withTable([title, "Venit", "Pondere", "Comenzi"], items.map((i) => [i.name, nf2.format(i.value), pf.format(i.share), i.count]), [1, 2, 3]),
    ]);
    if (x.customers) grid.append(mk(x.customerColumn, x.customers[cur] || []));
    if (x.products) grid.append(mk(x.productColumn, x.products[cur] || []));
    panel.append(grid);
  }

  function pHealth(panel, d, cur) {
    const x = d.health;
    panel.append(head("Sănătatea comenzilor", "Cât din ce se comandă ajunge livrat și cât rămâne blocat sau se pierde."));
    if (!x.available) { panel.append(emptyState("Fișierul nu are o coloană de status, deci nu pot calcula ratele de retur și anulare.")); return; }
    const k = el("div", { class: "kpis" });
    const delivered = x.statuses.find((s) => s.status === "Livrată");
    k.append(kpi("Rata de livrare", pf.format(delivered ? delivered.share : 0), null, "din numărul de comenzi", { hero: true }));
    k.append(kpi("Rata de retur", pf.format(x.returnRate), null, [el("span", { class: "pill warn", text: "Retur" })]));
    k.append(kpi("Rata de anulare", pf.format(x.cancelRate), null, [el("span", { class: "pill bad", text: "Anulată" })]));
    k.append(kpi(`Blocat „În curs” (${curLabel(cur)})`, nf2.format(x.pending[cur] || 0), cur, `${nComenzi(x.pendingCount)} în curs (toate monedele)`));
    panel.append(k);
    const statuses = orderStatuses(x.statuses);
    const grid = el("div", { class: "grid-2" });
    grid.append(card("Comenzi pe status", "Număr de comenzi.", [
      ...stackBar(statuses.map((s) => ({ label: s.status, value: s.count, color: statusColor(s.status) })), (v) => `${nf0.format(v)} com.`),
    ]));
    grid.append(card(`Valoare pe status (${curLabel(cur)})`, "Unde se află banii.", [
      ...stackBar(statuses.map((s) => ({ label: s.status, value: s.values[cur] || 0, color: statusColor(s.status) })), (v) => money(v, cur)),
      withTable(["Status", "Comenzi", "Pondere", `Valoare (${curLabel(cur)})`], statuses.map((s) => [s.status, s.count, pf.format(s.share), nf2.format(s.values[cur] || 0)]), [1, 2, 3]),
    ]));
    panel.append(grid);
  }


  // ------------------------------------------------------------------ pivot
  // Ce e pe rânduri / coloane și ce se calculează; calculul îl face serverul (backend/core/pivot.ts).
  function pivotQuery(spec, extra = {}) {
    const q = new URLSearchParams({ id: state.id });
    if (spec) {
      q.set("rows", spec.rows); q.set("cols", spec.cols ?? "none"); q.set("measure", spec.measure);
      if (state.currency !== null) q.set("currency", state.currency);
    }
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return q;
  }

  function pivotTable(p) {
    const isMoney = p.spec.measure === "delivered" || p.spec.measure === "value";
    const fmt = (v) => v === 0 ? "—" : isMoney ? nf2.format(v) : nf0.format(v);
    const corner = p.colLabel ? `${p.rowLabel} ↓  ${p.colLabel} →` : p.rowLabel;
    const headRow = [corner, ...p.columns.map((c) => c.label), "Total"];
    return el("div", { class: "table-scroll pivot-scroll" }, el("table", { class: "data pivot" }, [
      el("thead", {}, el("tr", {}, headRow.map((h, i) => el("th", { scope: "col", class: i ? "num" : "", text: h })))),
      el("tbody", {}, p.rows.map((r) => el("tr", {}, [
        el("th", { scope: "row", text: r.key }),
        ...r.cells.map((v) => el("td", { class: "num" + (v === 0 ? " zero" : ""), text: fmt(v) })),
        el("td", { class: "num total", text: fmt(r.total) }),
      ]))),
      el("tfoot", {}, el("tr", {}, [
        el("th", { scope: "row", text: "Total" }),
        ...p.colTotals.map((v) => el("td", { class: "num", text: fmt(v) })),
        el("td", { class: "num total", text: fmt(p.grand) }),
      ])),
    ]));
  }

  async function pPivot(panel) {
    panel.append(head("Tabel pivot", "Alegi ce e pe rânduri, ce e pe coloane și ce se adună — ca un pivot din Excel, fără formule. Totalurile sunt calculate de cod."));
    const box = el("div", { class: "pivot-box" }, el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Calculez…"]));
    panel.append(box);
    const id = state.id;
    try {
      const res = await api(`/api/pivot?${pivotQuery(state.pivot)}`);
      if (state.tab !== "pivot" || state.id !== id) return; // utilizatorul a plecat între timp
      state.pivot = { rows: res.pivot.spec.rows, cols: res.pivot.spec.cols, measure: res.pivot.spec.measure };
      state.pivotMeta = { dimensions: res.dimensions, measures: res.measures };
      const p = res.pivot;
      const pick = (label, key, options, includeNone) => {
        const sel = el("select", { id: `pv-${key}`, onchange: (e) => {
          const v = e.target.value;
          state.pivot = { ...state.pivot, [key]: key === "cols" && v === "none" ? null : v };
          if (state.pivot.cols && state.pivot.cols === state.pivot.rows) state.pivot.cols = null;
          renderPanel();
        } }, [
          ...(includeNone ? [el("option", { value: "none", text: "— fără coloane —" })] : []),
          ...options.map((o) => el("option", { value: o.id, text: o.label })),
        ]);
        sel.value = (key === "cols" ? state.pivot.cols ?? "none" : state.pivot[key]);
        return el("label", { class: "pv-field", for: `pv-${key}` }, [el("span", { text: label }), sel]);
      };
      const dims = res.dimensions;
      const controls = el("div", { class: "pv-controls" }, [
        pick("Rânduri", "rows", dims, false),
        pick("Coloane", "cols", dims.filter((d) => d.id !== state.pivot.rows), true),
        pick("Valoare", "measure", res.measures.filter((m) => state.analysis.meta.hasValue || m.id === "count"), false),
      ]);
      const meta = [nComenzi(p.orders)];
      if (p.currency !== null) meta.push(`sume în ${curLabel(p.currency)}`);
      const foot = el("div", { class: "detail-foot" }, [
        el("span", { text: meta.join(" · ") }),
        el("button", { class: "btn-link", type: "button", text: "Descarcă pivotul (CSV)", onclick: () => download(`/api/pivot?${pivotQuery(state.pivot, { format: "csv" })}`, "pivot.csv", foot) }),
      ]);
      box.replaceChildren(controls,
        p.rows.length ? pivotTable(p) : emptyState("Nu există comenzi pentru această combinație."),
        foot,
        ...p.notes.map((n) => el("p", { class: "note-line", text: n })));
    } catch (e) {
      box.replaceChildren(emptyState(e.message));
    }
  }

  async function download(url, filename, where) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Nu am putut pregăti fișierul.");
      const href = URL.createObjectURL(await r.blob());
      const link = el("a", { href, download: filename });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch (e) { where.append(el("span", { class: "error-text", text: e.message })); }
  }

  // ------------------------------------------------------------------ raport (de salvat ca PDF)
  // Cifre cheie + grafic pe luni, top clienți și produse, pivotul ales, venit pierdut + ce s-a curățat.
  // Tot fișierul sau o singură lună. „Salvează ca PDF” = tipărirea browserului (fără bibliotecă).
  async function openReport(month = "") {
    const dlg = $("#report");
    dlg.hidden = false;
    document.body.classList.add("report-open");
    const body = $("#reportBody");
    body.replaceChildren(el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Pregătesc raportul…"]));
    $("#reportClose").focus();
    try {
      const q = new URLSearchParams({ id: state.id }); if (month) q.set("month", month);
      const [rep, piv] = await Promise.all([
        api(`/api/report?${q}`),
        api(`/api/pivot?${pivotQuery(state.pivot, { month })}`).catch(() => null),
      ]);
      const sel = $("#reportMonth");
      sel.replaceChildren(el("option", { value: "", text: "Tot fișierul" }), ...rep.months.map((m) => el("option", { value: m, text: monthLong(m) })));
      sel.value = month;
      renderReport(body, rep, piv && piv.pivot);
    } catch (e) {
      body.replaceChildren(emptyState(e.message));
    }
  }

  function closeReport() {
    $("#report").hidden = true;
    document.body.classList.remove("report-open");
    $("#openReport").focus();
  }

  function renderReport(body, rep, pivot) {
    const d = rep.dashboards, cur = state.currency, m = rep.meta;
    const s = d.summary;
    const period = rep.month ? monthLong(rep.month) : s.period ? `${dateRo(s.period.from)} – ${dateRo(s.period.to)}` : "toată perioada din fișier";
    const today = new Date();
    const section = (title, ...kids) => el("section", { class: "report-section" }, [el("h2", { text: title }), ...kids]);
    body.replaceChildren();

    body.append(el("header", { class: "report-head" }, [
      el("p", { class: "report-kicker", text: "Raport de vânzări" }),
      el("h1", { text: m.filename }),
      el("p", { class: "report-meta", text: `Perioada: ${period} · Sume în ${curLabel(cur)} · Generat pe ${dateRo(today.toISOString().slice(0, 10))} cu Claritate` }),
    ]));

    // 1. cifre cheie + grafic pe luni
    const del = curRow(d.delivered.byCurrency, cur);
    const lost = d.lost.available ? curRow(d.lost.byCurrency, cur) : null;
    const sc = curRow(s.currencies, cur);
    const k = el("div", { class: "kpis" });
    k.append(kpi(d.delivered.assumedAll ? `Venit (${curLabel(cur)})` : `Venit livrat (${curLabel(cur)})`, del ? nf2.format(del.total) : "—", del ? cur : null, del ? `${nComenzi(del.count)} livrate` : null, { hero: true }));
    k.append(kpi("Comenzi valide", nf0.format(s.orders), null, s.currencies.map((x) => `${nf0.format(x.count)} în ${curLabel(x.currency)}`).join(" · ")));
    if (sc) k.append(kpi("Valoare medie pe comandă", nf2.format(sc.avg), cur, `mediana: ${money(sc.median, cur)}`));
    if (lost) k.append(kpi(`Venit pierdut (${curLabel(cur)})`, nf2.format(lost.lost), cur, `retur ${money(lost.retur, cur)} · anulat ${money(lost.anulata, cur)}`));
    const kids = [k];
    if (d.delivered.monthly && !rep.month) {
      const vals = d.delivered.monthly.series[cur] || [];
      const pts = d.delivered.monthly.months.map((mm, i) => ({ label: monthShort(mm), full: monthLong(mm), value: vals[i] || 0 }));
      kids.push(el("h3", { text: `Venit livrat pe lună (${curLabel(cur)})` }), line(pts, cur, { aria: `Venit livrat pe luni în ${curLabel(cur)}` }));
      if (d.months.incompleteMonth) kids.push(el("p", { class: "note-line", text: `${monthLong(d.months.incompleteMonth)} e lună incompletă: datele se opresc pe ${dateRo(d.months.lastDate)}.` }));
    }
    body.append(section("Cifre cheie", ...kids));

    // 2. top clienți și produse
    const tops = [];
    const topList = (title, items) => el("div", { class: "report-col" }, [el("h3", { text: `Top după „${title}”` }), items.length ? hbars(items, cur, { share: true }) : emptyState("Fără date în această monedă.")]);
    if (d.top.customers) tops.push(topList(d.top.customerColumn, d.top.customers[cur] || []));
    if (d.top.products) tops.push(topList(d.top.productColumn, d.top.products[cur] || []));
    if (tops.length) body.append(section(d.top.basis === "livrat" ? "Top clienți și produse (după venit livrat)" : "Top clienți și produse", el("div", { class: "grid-2" }, tops)));

    // 3. pivotul ales
    if (pivot) {
      const sub = `${pivot.rowLabel}${pivot.colLabel ? ` × ${pivot.colLabel}` : ""} · ${pivot.measureLabel}${pivot.currency !== null ? ` (${curLabel(pivot.currency)})` : ""}`;
      body.append(section("Tabel pivot", el("p", { class: "sub", text: sub }), pivot.rows.length ? pivotTable(pivot) : emptyState("Nu există comenzi pentru acest pivot."), ...pivot.notes.map((n) => el("p", { class: "note-line", text: n }))));
    }

    // 4. venit pierdut + curățare
    const lostKids = [];
    if (lost) {
      lostKids.push(el("p", {}, `Retur + anulare: ${money(lost.lost, cur)} (${pf.format(lost.share)} din valoarea tuturor comenzilor în ${curLabel(cur)}) · ${nComenzi(d.lost.counts.retur)} returnate, ${nf0.format(d.lost.counts.anulata)} anulate.`));
      const tc = (d.lost.topCustomers && d.lost.topCustomers[cur]) || [];
      if (tc.length) lostKids.push(el("h3", { text: `Cele mai mari pierderi pe „${m.customerColumn || "client"}”` }), hbars(tc.slice(0, 5).map((t) => ({ name: t.name, value: t.value })), cur, { color: "var(--st-anulata)" }));
    } else lostKids.push(el("p", { text: "Fișierul nu are o coloană de status, deci venitul pierdut nu se poate separa." }));
    const r = rep.report;
    const cleaned = [
      `${nf0.format(r.kept)} rânduri păstrate din ${nf0.format(r.linesAfterHeader)}`,
      r.empty ? `${nf0.format(r.empty)} goale` : null,
      r.totals ? `${nf0.format(r.totals)} rânduri de total` : null,
      r.duplicates ? `${nf0.format(r.duplicates)} duplicate` : null,
      r.repairedNumbers ? `${nf0.format(r.repairedNumbers)} numere reparate` : null,
      r.invalidDates ? `${nf0.format(r.invalidDates)} date invalide` : null,
    ].filter(Boolean);
    lostKids.push(el("h3", { text: "Ce s-a curățat din fișier" }), el("p", { text: cleaned.join(" · ") + "." }));
    if (rep.month) lostKids.push(el("p", { class: "note-line", text: "Curățarea se referă la tot fișierul, nu doar la luna aleasă." }));
    body.append(section("Venit pierdut și curățarea datelor", ...lostKids));
    body.append(el("p", { class: "report-foot", text: "Toate cifrele sunt calculate de cod, după reguli fixe (fără AI). Monedele nu sunt convertite între ele." }));
  }


  // ------------------------------------------------------------------ comparație între două fișiere
  // Un FULL OUTER JOIN pe valorile comune (client, produs, agent…): ce are fiecare în fișierul 1 și în fișierul 2.
  const cmp = { a: null, b: null, data: null, dim: 0, currency: null };
  const C_A = "#64748B", C_B = "var(--series-1)"; // perioada veche (gri închis) / cea nouă (indigo), contrast ≥ 3:1

  async function startCompare(file) {
    if (!file || !state.id) return;
    const btn = $("#openCompare span");
    btn.textContent = `Citesc „${file.name}”…`;
    const form = new FormData(); form.append("file", file);
    try {
      const up = await api("/api/upload", { method: "POST", body: form });
      await loadCompare(state.id, up.id, true);
    } catch (e) { alertInline($("#panel"), e.message); }
    finally { btn.textContent = "Compară cu alt fișier"; $("#compareInput").value = ""; }
  }

  async function loadCompare(a, b, push) {
    cmp.a = a; cmp.b = b; cmp.dim = 0;
    $("#start").hidden = true; $("#app").hidden = true; $("#compare").hidden = false; $("#newFileTop").hidden = false;
    if (push) history.pushState({ a, b }, "", `/c/${a}/${b}`);
    $("#cmpBody").replaceChildren(el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Compar fișierele…"]));
    window.scrollTo({ top: 0 });
    await refreshCompare();
    $("#cmpTitle").focus?.();
  }

  async function refreshCompare() {
    try {
      const q = new URLSearchParams({ a: cmp.a, b: cmp.b });
      if (cmp.currency !== null) q.set("currency", cmp.currency);
      const res = await api(`/api/compare?${q}`);
      cmp.data = res.compare; cmp.currency = res.compare.currency;
      renderCompare();
    } catch (e) {
      $("#cmpBody").replaceChildren(emptyState(e.message));
    }
  }

  const signedMoney = (v, cur) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${money(Math.abs(v), cur)}`;
  const signedNum = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf0.format(Math.abs(v))}`;
  const signedPct = (v) => v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf1.format(Math.abs(v))}%`;
  const TAG_CLASS = { nou: "info", "dispărut": "bad", crescut: "good", "scăzut": "warn", egal: "" };

  function renderCompare() {
    const c = cmp.data, [la, lb] = c.labels, cur = c.currency;
    $("#cmpTitle").textContent = `${la} → ${lb}`;
    $("#cmpMeta").textContent = `${c.files[0]}${c.periods[0] ? ` (${c.periods[0]})` : ""} · ${c.files[1]}${c.periods[1] ? ` (${c.periods[1]})` : ""}`;
    const body = $("#cmpBody");
    body.replaceChildren();

    // ce s-a potrivit cu ce (ca un JOIN: pe ce coloane se compară)
    const matchItems = c.matches.map((m) => el("li", {}, [iconBadge("rows"), el("span", {}, m.a === m.b
      ? [el("strong", { text: m.a }), " — în ambele fișiere"]
      : [el("strong", { text: m.a }), ` (${la}) = `, el("strong", { text: m.b }), ` (${lb}) · ${m.by === "nume" ? "după nume" : `${m.shared} valori comune`}`])]));
    const other = c.notes.filter((n) => !/sunt aceeași coloană/.test(n)).map((n) => el("li", {}, [iconBadge("info"), el("span", { text: n })]));
    body.append(el("details", { class: "card fold", open: true }, [
      el("summary", {}, el("div", {}, [el("h2", { text: "Pe ce se compară" }), el("p", { class: "sub", style: "margin:0", text: c.matches.length ? `${c.matches.length} ${c.matches.length === 1 ? "coloană comună" : "coloane comune"}, folosite ca cheie (ca un JOIN în SQL)` : "Nicio coloană comună: se compară doar totalurile" })])),
      el("ul", { class: "clean-list" }, [...matchItems, ...other]),
    ]));

    // moneda
    if (c.currencies.length > 1) {
      body.append(el("div", { class: "controls" }, [el("span", { class: "controls-label", text: "Monedă" }),
        el("div", { class: "seg", role: "group", "aria-label": "Monedă" }, c.currencies.map((x) => el("button", {
          type: "button", "aria-pressed": String(x === cur), text: curLabel(x),
          onclick: () => { cmp.currency = x; refreshCompare(); },
        })))]));
    }

    // cifre cheie alăturat
    const kRows = c.kpis.map((k) => {
      const isPct = /%/.test(k.label);
      const f = (v) => v === null ? "—" : isPct ? `${nf1.format(v)}%` : k.money ? nf2.format(v) : nf0.format(v);
      const d = k.diff === null ? "—" : isPct ? `${signedPct(k.diff).replace("%", "")} pp` : k.money ? signedMoney(k.diff, "") : signedNum(k.diff);
      return [k.label, f(k.a), f(k.b), d, isPct ? "—" : signedPct(k.pct)];
    });
    body.append(card("Cifre cheie", c.hasStatus ? "Venitul și valorile medii sunt pe comenzile livrate." : null, tableView(["Indicator", la, lb, "Diferență", "%"], kRows, [1, 2, 3, 4]), "cmp-card"));

    // luni
    if (c.months.length) {
      body.append(card(`${c.hasStatus ? "Venit livrat" : "Valoare"} pe lună (${curLabel(cur)})`, c.sameCalendar ? "Aceleași luni din calendar, în ambele fișiere." : `Ianuarie ${la} lângă ianuarie ${lb}, și tot așa.`, [
        el("ul", { class: "legend cmp-legend" }, [
          el("li", {}, [el("span", { class: "swatch", style: `background:${C_A}` }), la]),
          el("li", {}, [el("span", { class: "swatch", style: `background:${C_B}` }), lb]),
        ]),
        pairColumns(c.months, cur, la, lb),
        withTable(["Luna", la, lb, "Diferență"], c.months.map((m) => [m.label, nf2.format(m.a), nf2.format(m.b), signedMoney(m.b - m.a, "")]), [1, 2, 3]),
      ], "cmp-card"));
    }

    // join pe fiecare coloană comună
    if (c.dimensions.length) {
      const dim = c.dimensions[Math.min(cmp.dim, c.dimensions.length - 1)];
      const seg = el("div", { class: "seg", role: "group", "aria-label": "Compară după" }, c.dimensions.map((d, i) => el("button", {
        type: "button", "aria-pressed": String(d === dim), text: d.name, onclick: () => { cmp.dim = i; renderCompare(); },
      })));
      const tagText = (t) => c.sameCalendar && t === "nou" ? `doar în ${lb}` : c.sameCalendar && t === "dispărut" ? `doar în ${la}` : t;
      const counts = {}; for (const r of dim.rows) counts[r.tag] = (counts[r.tag] || 0) + 1;
      const summary = ["crescut", "scăzut", "nou", "dispărut"].filter((t) => counts[t]).map((t) => c.sameCalendar && (t === "nou" || t === "dispărut") ? `${counts[t]} ${tagText(t)}`
        : `${counts[t]} ${t === "nou" ? (counts[t] === 1 ? "nou" : "noi") : t === "dispărut" ? (counts[t] === 1 ? "dispărut" : "dispăruți") : t}`).join(" · ");
      const rows = dim.rows.map((r) => [
        r.key, nf2.format(r.a), nf2.format(r.b), signedMoney(r.diff, ""), signedPct(r.pct),
        el("span", { class: `pill ${TAG_CLASS[r.tag] || ""}`, text: tagText(r.tag) }),
      ]);
      body.append(card(`După „${dim.name}”`, `${c.hasStatus ? "Venit livrat" : "Valoare"}, ${curLabel(cur)}. ${summary}`, [
        el("div", { class: "controls cmp-dims" }, [el("span", { class: "controls-label", text: "Compară după" }), seg]),
        tableViewNodes([dim.name, la, lb, "Diferență", "%", ""], rows, [1, 2, 3, 4]),
      ], "cmp-card"));
    }

    // întrebări pe comparație
    const input = el("input", { id: "cmpQuestion", type: "text", maxlength: "300", autocomplete: "off", placeholder: "ex. Cât a crescut Hermes Logistics?" });
    const out = el("div", { class: "answer", "aria-live": "polite" });
    const askC = async (q) => {
      out.replaceChildren(el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Calculez…"]));
      try {
        const res = await api(`/api/compare-ask?a=${cmp.a}&b=${cmp.b}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
        out.replaceChildren();
        if (!res.answer) { out.append(emptyState(res.error || "Nu pot răspunde la asta.")); return; }
        const a = res.answer;
        const box = el("div", { class: "answer-body" });
        for (const sec of a.sections) {
          box.append(el("p", { class: "answer-title", text: sec.title }));
          if (sec.items.length) box.append(el("ul", { class: "answer-list" }, sec.items.map((t) => el("li", { text: t }))));
        }
        if (a.notes.length) box.append(el("ul", { class: "answer-notes" }, a.notes.map((t) => el("li", { text: t }))));
        out.append(box, el("p", { class: "answer-plan" }, ["Am calculat: ", el("code", { text: a.planText }), " · pe ambele fișiere · plan ales de ", el("span", { class: "pill good", text: "reguli fixe, fără AI" })]));
        if (a.table && a.rows.length) {
          const f = (v) => a.metricIsCount ? nf0.format(v) : nf2.format(v);
          const hasCur = a.rows.some((r) => r.currency);
          out.append(tableView([a.table.group, ...(hasCur ? ["Monedă"] : []), a.table.a, a.table.b, "Diferență", "%"],
            a.rows.map((r) => [r.group, ...(hasCur ? [r.currency] : []), f(r.a), f(r.b), a.metricIsCount ? signedNum(r.diff) : signedMoney(r.diff, ""), signedPct(r.pct)]),
            hasCur ? [2, 3, 4, 5] : [1, 2, 3, 4]));
        }
        // comenzile folosite, separat pe fiecare fișier, cu coloanele lui
        (a.details || []).forEach((x, side) => {
          if (!x.detail || !x.detail.total) return;
          const d = x.detail;
          const foot = el("div", { class: "detail-foot" });
          if (d.total > d.rows.length) foot.append(el("span", { text: `Afișez primele ${nf0.format(d.rows.length)} din ${nf0.format(d.total)}.` }));
          foot.append(el("button", { class: "btn-link", type: "button", text: "Descarcă toate (CSV)", onclick: () => {
            fetch(`/api/compare-ask?a=${cmp.a}&b=${cmp.b}&format=csv&side=${side}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) })
              .then((r) => { if (!r.ok) throw new Error("Nu am putut pregăti fișierul."); return r.blob(); })
              .then((blob) => { const href = URL.createObjectURL(blob); const link = el("a", { href, download: `comenzi-${x.label}.csv` }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 2000); })
              .catch((e) => foot.append(el("span", { class: "error-text", text: e.message })));
          } }));
          out.append(el("details", { class: "table-view answer-detail" }, [
            el("summary", { text: `Vezi ${d.total === 1 ? "comanda folosită" : `cele ${nComenzi(d.total)} folosite`} din ${x.label}` }),
            tableView(d.columns, d.rows, [0]), foot,
          ]));
        });
      } catch (e) { out.replaceChildren(emptyState(e.message)); }
    };
    const firstDim = c.dimensions[0]?.name || "client";
    const sug = [`Cât am vândut?`, `Ce ${/client/i.test(firstDim) ? "clienți" : "valori"} noi am?`, "Care e rata de retur?",
      ...(c.dimensions.find((d) => /agent/i.test(d.name)) ? ["Care agent a crescut cel mai mult?"] : []),
      ...(c.dimensions.find((d) => /produs/i.test(d.name)) ? ["Compară vânzările pe produse"] : [])];
    body.append(el("section", { class: "card ask" }, [
      el("h2", { text: "Întreabă ceva despre comparație" }),
      el("p", { class: "sub", style: "margin:0", text: "Aceeași întrebare se calculează pe ambele fișiere, după reguli fixe (fără AI), apoi se pun alăturat, cu diferența." }),
      el("form", { class: "ask-form", onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) askC(input.value.trim()); } }, [
        el("label", { class: "visually-hidden", for: "cmpQuestion", text: "Întrebare" }), input,
        el("button", { class: "btn btn-primary", type: "submit", text: "Întreabă" }),
      ]),
      el("div", { class: "chips" }, sug.map((q) => el("button", { class: "chip", type: "button", text: q, onclick: () => { input.value = q; askC(q); } }))),
      out,
    ]));
  }

  /** Ca tableView, dar celulele pot fi și elemente (ex. eticheta „nou”). */
  function tableViewNodes(cols, rows, numCols = []) {
    return el("div", { class: "table-scroll cmp-scroll" }, el("table", { class: "data" }, [
      el("thead", {}, el("tr", {}, cols.map((c, i) => el("th", { class: numCols.includes(i) ? "num" : "", scope: "col", text: c })))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v, i) => el("td", { class: numCols.includes(i) ? "num" : "" }, typeof v === "object" ? v : String(v ?? "—")))))),
    ]));
  }

  /** Coloane perechi pe luni: perioada veche (gri) lângă cea nouă (indigo). */
  function pairColumns(months, cur, la, lb) {
    return responsive((W, H) => {
      const L = 48, R = 8, T = 16, B = 34;
      const { max, step } = niceScale(Math.max(...months.flatMap((m) => [m.a, m.b]), 0));
      const band = (W - L - R) / months.length, bw = Math.min(18, band * 0.36);
      const y = (v) => T + (H - T - B) * (1 - v / (max || 1));
      const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Comparație pe luni: ${la} față de ${lb}` });
      for (let v = 0; v <= max + 1e-9; v += step) { root.append(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "baseline" : "gridline" })); root.append(svgText(L - 8, y(v) + 4, compact(v), "axis-text", "end")); }
      const every = band < 34 ? Math.ceil(34 / band) : 1;
      months.forEach((m, i) => {
        const cx = L + band * i + band / 2;
        [[m.a, C_A, -1], [m.b, C_B, 1]].forEach(([v, color, side]) => {
          const h = Math.max(0, y(0) - y(v)), x = side < 0 ? cx - bw - 1 : cx + 1;
          if (h > 0.5) root.append(svg("rect", { x, y: y(0) - h, width: bw, height: h, rx: Math.min(3, bw / 2), fill: color }));
        });
        if (i % every === 0) root.append(svgText(cx, H - B + 18, m.label.slice(0, 3) + ".", "axis-text", "middle"));
        const hit = svg("rect", { x: L + band * i, y: T, width: band, height: H - T - B, class: "hit", tabindex: 0, "aria-label": `${m.label}: ${la} ${money(m.a, cur)}, ${lb} ${money(m.b, cur)}` });
        const tipText = `${la}: ${money(m.a, cur)} · ${lb}: ${money(m.b, cur)}`;
        hit.addEventListener("pointermove", (e) => showTip(e, tipText, m.label));
        hit.addEventListener("focus", () => { const r = hit.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top + 20, target: hit }, tipText, m.label); });
        hit.addEventListener("pointerleave", hideTip); hit.addEventListener("blur", hideTip);
        root.append(hit);
      });
      return root;
    }, (w) => (w < 480 ? 240 : 300));
  }

  // ------------------------------------------------------------------ întrebări
  function renderSuggestions() {
    $("#suggestions").replaceChildren(...state.analysis.suggestions.map((q) => el("button", {
      class: "chip", type: "button", text: q, onclick: () => { $("#question").value = q; ask(q); },
    })));
  }

  async function ask(question) {
    const out = $("#answer");
    out.replaceChildren(el("span", { class: "loading" }, [el("span", { class: "spinner", "aria-hidden": "true" }), "Calculez…"]));
    try {
      const res = await api(`/api/ask?id=${encodeURIComponent(state.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      out.replaceChildren();
      if (res.error || !res.answer) {
        out.append(emptyState(res.error || "Nu pot răspunde la asta din acest fișier."));
        return;
      }
      const a = res.answer;
      // răspunsul schematic: titlu + puncte pe fiecare secțiune, apoi notele mărunte
      if (Array.isArray(a.sections) && a.sections.length) {
        const box = el("div", { class: "answer-body" });
        for (const sec of a.sections) {
          box.append(el("p", { class: "answer-title", text: sec.title }));
          if (sec.items.length) box.append(el("ul", { class: "answer-list" }, sec.items.map((t) => el("li", { text: t }))));
        }
        if (a.notes && a.notes.length) box.append(el("ul", { class: "answer-notes" }, a.notes.map((t) => el("li", { text: t }))));
        out.append(box);
      } else {
        out.append(el("p", { class: "answer-text", text: a.text }));
      }
      out.append(el("p", { class: "answer-plan" }, [
        "Am calculat: ", el("code", { text: a.planText }), ` · ${nf0.format(a.matched)} rânduri folosite · plan ales de `,
        el("span", { class: `pill ${res.source === "model" ? "info" : "good"}`, text: res.source === "model" ? "model AI" : "reguli fixe, fără AI" }),
      ]));
      // tabelul rezumat doar când adaugă ceva: grupe (clienți, luni…), nu când repetă totalul de mai sus
      if (a.rows.some((r) => r.group !== "Total")) {
        const isCount = res.plan && (res.plan.metric === "count" || res.plan.metric === "distinct");
        const t = a.table || { group: "Grup", result: "Rezultat", count: "Comenzi" };
        const hasCur = a.rows.some((r) => r.currency);
        // pentru numărători, coloana „comenzi” ar fi identică cu rezultatul, deci e omisă
        const headers = [t.group || "Grup", ...(hasCur ? ["Monedă"] : []), t.result, ...(isCount ? [] : [t.count])];
        const rowsData = a.rows.map((r) => [r.group, ...(hasCur ? [r.currency || "—"] : []),
          isCount ? nf0.format(r.value) : nf2.format(r.value), ...(isCount ? [] : [nf0.format(r.count)])]);
        const numIdx = headers.map((_, i) => i).filter((i) => i >= (hasCur ? 2 : 1));
        out.append(tableView(headers, rowsData, numIdx));
      }
      // comenzile din spatele răspunsului, cu coloanele fișierului urcat, valorile exact ca în fișier
      if (a.detail && a.detail.total > 0) {
        const d = a.detail;
        const label = `Vezi ${d.total === 1 ? "comanda folosită" : `cele ${nComenzi(d.total)} folosite`}`;
        const body = [tableView(d.columns, d.rows, [0])];
        const foot = el("div", { class: "detail-foot" });
        if (d.total > d.rows.length) foot.append(el("span", { text: `Afișez primele ${nf0.format(d.rows.length)} din ${nf0.format(d.total)}.` }));
        foot.append(el("button", { class: "btn-link", type: "button", text: "Descarcă toate (CSV)", onclick: () => downloadDetail(question, foot) }));
        body.push(foot);
        out.append(el("details", { class: "table-view answer-detail" }, [el("summary", { text: label }), ...body]));
      }
    } catch (e) {
      out.replaceChildren(emptyState(e.message));
    }
  }

  async function downloadDetail(question, foot) {
    try {
      const r = await fetch(`/api/ask?id=${encodeURIComponent(state.id)}&format=csv`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      if (!r.ok) throw new Error("Nu am putut pregăti fișierul.");
      const url = URL.createObjectURL(await r.blob());
      const link = el("a", { href: url, download: "comenzi-folosite.csv" });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { foot.append(el("span", { class: "error-text", text: e.message })); }
  }

  // ------------------------------------------------------------------ evenimente
  async function loadExamples() {
    try {
      const { examples } = await api("/api/examples");
      $("#examples").replaceChildren(...examples.map((ex) => el("button", {
        class: "example-btn", type: "button", onclick: () => uploadExample(ex.file), "aria-label": `Încearcă exemplul ${ex.label}`,
      }, [el("span", { html: ICON.file, "aria-hidden": "true" }), ex.label])));
    } catch { /* fără exemple */ }
  }

  $("#fileInput").addEventListener("change", (e) => uploadFile(e.target.files[0]));
  const dz = $("#dropzone");
  ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, () => dz.classList.remove("is-over")));
  dz.addEventListener("drop", (e) => { e.preventDefault(); uploadFile(e.dataTransfer.files[0]); });
  $("#newFile").addEventListener("click", resetToStart);
  $("#newFileTop").addEventListener("click", resetToStart);
  $("#askForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#question").value.trim(); if (q) ask(q); });
  $("#openReport").addEventListener("click", () => openReport());
  $("#openCompare").addEventListener("click", () => $("#compareInput").click());
  $("#compareInput").addEventListener("change", (e) => startCompare(e.target.files[0]));
  $("#cmpBack").addEventListener("click", () => { $("#compare").hidden = true; history.pushState({ id: cmp.a }, "", `/d/${cmp.a}`); loadById(cmp.a); });
  $("#cmpCopy").addEventListener("click", async () => {
    const label = $("#cmpCopy span"), url = `${location.origin}/c/${cmp.a}/${cmp.b}`;
    try { await navigator.clipboard.writeText(url); label.textContent = "Link copiat"; } catch { label.textContent = url; }
    setTimeout(() => { label.textContent = "Copiază linkul"; }, 2500);
  });
  $("#reportClose").addEventListener("click", closeReport);
  $("#reportPrint").addEventListener("click", () => window.print());
  $("#reportMonth").addEventListener("change", (e) => openReport(e.target.value));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#report").hidden) closeReport(); });
  $("#copyLink").addEventListener("click", async () => {
    const url = `${location.origin}/d/${state.id}`;
    const label = $("#copyLink span");
    try { await navigator.clipboard.writeText(url); label.textContent = "Link copiat"; }
    catch { label.textContent = url; }
    setTimeout(() => { label.textContent = "Copiază linkul"; }, 2500);
  });
  window.addEventListener("popstate", () => {
    const c = location.pathname.match(/^\/c\/([a-z0-9]+)\/([a-z0-9]+)/);
    if (c) return void loadCompare(c[1], c[2], false);
    $("#compare").hidden = true;
    const m = location.pathname.match(/^\/d\/([a-z0-9]+)/);
    if (m) loadById(m[1]); else { $("#app").hidden = true; $("#start").hidden = false; $("#newFileTop").hidden = true; }
  });

  loadExamples();
  const c0 = location.pathname.match(/^\/c\/([a-z0-9]+)\/([a-z0-9]+)/);
  const m = location.pathname.match(/^\/d\/([a-z0-9]+)/);
  if (c0) loadCompare(c0[1], c0[2], false);
  else if (m) loadById(m[1]);
})();
