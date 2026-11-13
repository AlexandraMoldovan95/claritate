// Cele 6 dashboard-uri. Doar aritmetică, pe fiecare monedă separat.

import type { CleanRecord } from "./clean.js";
import { round2 } from "./clean.js";
import { lastDayOfMonth } from "./normalize.js";

export interface Ranked { name: string; value: number; count: number; share: number }
type PerCur<T> = Record<string, T>;

export interface Dashboards {
  summary: {
    orders: number; customers: number | null; products: number | null;
    period: { from: string; to: string } | null;
    currencies: { currency: string; count: number; total: number; avg: number; median: number; min: number; max: number }[];
    statusCounts: { status: string; count: number }[];
    noValueOrders: number;
  };
  delivered: {
    available: boolean; assumedAll: boolean;
    byCurrency: { currency: string; total: number; count: number }[];
    monthly: { months: string[]; series: PerCur<number[]> } | null;
    topProducts: PerCur<Ranked[]> | null;
  };
  lost: {
    available: boolean;
    byCurrency: { currency: string; lost: number; retur: number; anulata: number; all: number; share: number }[];
    counts: { retur: number; anulata: number; total: number };
    topCustomers: PerCur<{ name: string; value: number; retur: number; anulata: number; count: number }[]> | null;
  };
  months: {
    available: boolean;
    byCurrency: {
      currency: string;
      months: { month: string; delivered: number; orders: number; zeroDelivered: boolean; incomplete: boolean; change: number | null }[];
      best: string[]; worst: string[];
    }[];
    incompleteMonth: string | null;
    lastDate: string | null;
  };
  top: {
    customerColumn: string | null; productColumn: string | null;
    customers: PerCur<Ranked[]> | null; products: PerCur<Ranked[]> | null;
    conflicts: { id: string; names: string[] }[];
    basis: "livrat" | "toate";
  };
  health: {
    available: boolean;
    statuses: { status: string; count: number; share: number; values: PerCur<number> }[];
    returnRate: number; cancelRate: number; pendingCount: number;
    pending: PerCur<number>;
  };
}

const DELIVERED = "Livrată";
const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
const withValue = (rs: CleanRecord[]) => rs.filter((r) => r.value !== null) as (CleanRecord & { value: number })[];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

function currenciesOf(rs: CleanRecord[]): string[] {
  const count = new Map<string, number>();
  for (const r of rs) count.set(r.currency, (count.get(r.currency) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

function rank(rs: (CleanRecord & { value: number })[], key: (r: CleanRecord) => string, limit = 10): Ranked[] {
  const total = rs.reduce((a, r) => a + r.value, 0);
  const m = new Map<string, { value: number; count: number }>();
  for (const r of rs) {
    const k = key(r);
    const e = m.get(k) ?? { value: 0, count: 0 };
    e.value += r.value; e.count++;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([name, e]) => ({ name, value: round2(e.value), count: e.count, share: total ? e.value / total : 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ro"))
    .slice(0, limit);
}

export function buildDashboards(
  records: CleanRecord[],
  opts: { hasStatus: boolean; hasDate: boolean; customer?: string; product?: string },
): Dashboards {
  const curs = currenciesOf(records);
  const valued = withValue(records);
  const deliveredRows = opts.hasStatus ? valued.filter((r) => r.status === DELIVERED) : valued;
  const perCur = <T>(fn: (cur: string, rows: (CleanRecord & { value: number })[]) => T): PerCur<T> =>
    Object.fromEntries(curs.map((c) => [c, fn(c, deliveredRows.filter((r) => r.currency === c))]));

  // ---------------------------------------------------------------- 1. Sumar
  const dates = records.map((r) => r.date).filter(Boolean).sort() as string[];
  const statusCount = new Map<string, number>();
  for (const r of records) if (r.status) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);
  const distinctOf = (col?: string) => col ? new Set(records.map((r) => r.cats[col])).size : null;

  const summary: Dashboards["summary"] = {
    orders: records.length,
    customers: distinctOf(opts.customer),
    products: distinctOf(opts.product),
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    currencies: curs.map((c) => {
      const vs = valued.filter((r) => r.currency === c).map((r) => r.value);
      return {
        currency: c, count: vs.length, total: sum(vs),
        avg: vs.length ? round2(vs.reduce((a, b) => a + b, 0) / vs.length) : 0,
        median: median(vs), min: vs.length ? Math.min(...vs) : 0, max: vs.length ? Math.max(...vs) : 0,
      };
    }).filter((c) => c.count > 0),
    statusCounts: [...statusCount.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    noValueOrders: records.length - valued.length,
  };

  // ---------------------------------------------------------------- 2. Venit livrat
  const monthsAll = [...new Set(records.map((r) => r.month).filter(Boolean) as string[])].sort();
  const delivered: Dashboards["delivered"] = {
    available: valued.length > 0,
    assumedAll: !opts.hasStatus,
    byCurrency: curs.map((c) => {
      const rs = deliveredRows.filter((r) => r.currency === c);
      return { currency: c, total: sum(rs.map((r) => r.value)), count: rs.length };
    }).filter((c) => valued.some((r) => r.currency === c.currency)),
    monthly: opts.hasDate && monthsAll.length ? {
      months: monthsAll,
      series: Object.fromEntries(curs.map((c) => [c, monthsAll.map((m) =>
        sum(deliveredRows.filter((r) => r.currency === c && r.month === m).map((r) => r.value)))])),
    } : null,
    topProducts: opts.product ? perCur((_, rs) => rank(rs, (r) => r.cats[opts.product!])) : null,
  };

  // ---------------------------------------------------------------- 3. Venit pierdut
  const lost: Dashboards["lost"] = {
    available: opts.hasStatus,
    byCurrency: curs.map((c) => {
      const rs = valued.filter((r) => r.currency === c);
      const retur = sum(rs.filter((r) => r.status === "Retur").map((r) => r.value));
      const anulata = sum(rs.filter((r) => r.status === "Anulată").map((r) => r.value));
      const all = sum(rs.map((r) => r.value));
      return { currency: c, lost: round2(retur + anulata), retur, anulata, all, share: all ? (retur + anulata) / all : 0 };
    }).filter((c) => c.all !== 0 || c.lost !== 0),
    counts: {
      retur: records.filter((r) => r.status === "Retur").length,
      anulata: records.filter((r) => r.status === "Anulată").length,
      total: records.length,
    },
    topCustomers: opts.hasStatus && opts.customer ? Object.fromEntries(curs.map((c) => {
      const m = new Map<string, { value: number; retur: number; anulata: number; count: number }>();
      for (const r of valued) {
        if (r.currency !== c || (r.status !== "Retur" && r.status !== "Anulată")) continue;
        const k = r.cats[opts.customer!];
        const e = m.get(k) ?? { value: 0, retur: 0, anulata: 0, count: 0 };
        e.value += r.value; e.count++;
        if (r.status === "Retur") e.retur += r.value; else e.anulata += r.value;
        m.set(k, e);
      }
      return [c, [...m.entries()].map(([name, e]) => ({
        name, value: round2(e.value), retur: round2(e.retur), anulata: round2(e.anulata), count: e.count,
      })).sort((a, b) => b.value - a.value).slice(0, 10)];
    })) : null,
  };

  // ---------------------------------------------------------------- 4. Luni
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
  const incompleteMonth = lastMonth && lastDate! < lastDayOfMonth(lastMonth) ? lastMonth : null;
  const months: Dashboards["months"] = {
    available: opts.hasDate && monthsAll.length > 0 && valued.length > 0,
    incompleteMonth, lastDate,
    byCurrency: curs.map((c) => {
      const inCur = records.filter((r) => r.currency === c && r.month);
      const ms = [...new Set(inCur.map((r) => r.month!))].sort();
      let prev: number | null = null;
      const rows = ms.map((m) => {
        const delivered = sum(deliveredRows.filter((r) => r.currency === c && r.month === m).map((r) => r.value));
        const change: number | null = prev === null ? null : prev === 0 ? null : (delivered - prev) / prev;
        prev = delivered;
        return {
          month: m, delivered, orders: inCur.filter((r) => r.month === m).length,
          zeroDelivered: delivered === 0, incomplete: m === incompleteMonth, change,
        };
      });
      const vals = rows.map((r) => r.delivered);
      const max = Math.max(...vals), min = Math.min(...vals);
      return {
        currency: c, months: rows,
        best: rows.length ? rows.filter((r) => r.delivered === max).map((r) => r.month) : [],
        worst: rows.length ? rows.filter((r) => r.delivered === min).map((r) => r.month) : [],
      };
    }).filter((x) => x.months.length > 0),
  };

  // ---------------------------------------------------------------- 5. Top
  const conflictIds = [...new Set(records.filter((r) => r.conflict && r.id).map((r) => r.id!))];
  const top: Dashboards["top"] = {
    customerColumn: opts.customer ?? null,
    productColumn: opts.product ?? null,
    customers: opts.customer ? perCur((_, rs) => rank(rs, (r) => r.cats[opts.customer!])) : null,
    products: opts.product ? perCur((_, rs) => rank(rs, (r) => r.cats[opts.product!])) : null,
    conflicts: conflictIds.map((id) => ({
      id,
      names: [...new Set(records.filter((r) => r.id === id).map((r) => opts.customer ? r.cats[opts.customer] : ""))].filter(Boolean),
    })),
    basis: opts.hasStatus ? "livrat" : "toate",
  };

  // ---------------------------------------------------------------- 6. Sănătate
  const n = records.length || 1;
  const health: Dashboards["health"] = {
    available: opts.hasStatus,
    statuses: [...statusCount.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({
      status, count, share: count / n,
      values: Object.fromEntries(curs.map((c) => [c,
        sum(valued.filter((r) => r.currency === c && r.status === status).map((r) => r.value))])),
    })),
    returnRate: (statusCount.get("Retur") ?? 0) / n,
    cancelRate: (statusCount.get("Anulată") ?? 0) / n,
    pendingCount: statusCount.get("În curs") ?? 0,
    pending: Object.fromEntries(curs.map((c) => [c,
      sum(valued.filter((r) => r.currency === c && r.status === "În curs").map((r) => r.value))])),
  };

  return { summary, delivered, lost, months, top, health };
}
