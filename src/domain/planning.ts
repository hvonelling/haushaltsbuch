// Vermögensplanung: Hochrechnung der Konten, Kredite und das Liniendiagramm.

import { addM, mdiff, TODAY_YM } from "./dates";
import { N, short } from "./format";
import { curExpected, planSpar } from "./ledger";
import type { Account, Data, Period } from "./types";

export interface LoanPlan {
  empty?: boolean;
  never?: boolean;
  tilg?: number;
  paid?: string | null;
  balH?: number;
}

/** Tilgungsverlauf eines Kredits über H Monate. */
export function loanPlan(a: Account, H: number): LoanPlan {
  let b = N(a.debt) || 0;
  const r = (N(a.rate) || 0) / 1200,
    m = N(a.monthly) || 0;
  if (!b) return { empty: true };
  const tilg = m - b * r;
  if (tilg <= 0) return { never: true, tilg };
  let paid: string | null = null,
    balH: number | null = null;
  for (let i = 1; i <= 720; i++) {
    b = b * (1 + r) - m;
    if (i === H) balH = Math.max(0, b);
    if (b <= 0) {
      paid = addM(TODAY_YM(), i);
      if (balH == null) balH = 0;
      break;
    }
  }
  return { tilg, paid, balH: balH == null ? 0 : balH };
}

export interface ProjAcc extends Account {
  bal: number;
  reached: string | null;
}

/** Vermögen über H Monate hochrechnen. scen = Szenarien einrechnen. */
export function project(d: Data, scen: boolean, H: number): { series: number[]; acc: ProjAcc[]; off: number } {
  const off = curExpected(d).off;
  let acc: ProjAcc[] = d.accounts
    .filter((a) => a.kind !== "kredit")
    .map((a) => ({
      ...a,
      bal: N(a.balance) || 0,
      reached: N(a.target) > 0 && (N(a.balance) || 0) >= N(a.target) ? TODAY_YM() : null,
    }));
  if (!acc.length) acc = [{ id: "_", name: "", bal: 0, rate: 0, monthly: 0, puffer: true, reached: null }];
  let pi = acc.findIndex((a) => /tagesgeld/i.test(a.name || ""));
  if (pi < 0) pi = acc.findIndex((a) => a.puffer);
  if (pi < 0) pi = 0;
  const series = [acc.reduce((s, a) => s + a.bal, 0)];
  for (let i = 1; i <= H; i++) {
    const ym = addM(TODAY_YM(), i);
    acc.forEach((a) => {
      a.bal += (a.bal * (N(a.rate) || 0)) / 1200;
    });
    acc[pi].bal += planSpar(d, ym, scen) + (i === 1 ? planSpar(d, TODAY_YM(), scen) : 0);
    acc.forEach((a) => {
      if (!a.reached && N(a.target) > 0 && a.bal >= N(a.target)) a.reached = ym;
    });
    series.push(acc.reduce((s, a) => s + a.bal, 0) + off);
  }
  return { series, acc, off };
}

function niceStep(r: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(r || 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= r) return m * p;
  return 10 * p;
}

export interface LineChart {
  plan: string;
  scen: string;
  hist: string;
  yticks: { y: number; ty: number; label: string }[];
  xticks: { x: number; label: string }[];
  bands: { x: number; w: number; fill: string }[];
  todayX: number;
  top: number;
  bandH: number;
}

/** Punkte und Achsen für das Vermögensdiagramm (SVG 720 × 260). */
export function lineChart(
  hist: { ym: string; v: number }[],
  plan: number[],
  scen: number[],
  H: number,
  periods: Period[],
): LineChart {
  const W = 720,
    Hh = 260,
    L = 64,
    Rr = 12,
    T = 14,
    B = 30;
  const x0 = hist.length ? hist[0].ym : TODAY_YM();
  const off = mdiff(x0, TODAY_YM());
  const N_ = Math.max(1, off + H);
  const all = [...hist.map((h) => h.v), ...plan, ...scen];
  let mn = Math.min(0, ...all),
    mx = Math.max(1, ...all);
  const pd = (mx - mn) * 0.06;
  mx += pd;
  if (mn < 0) mn -= pd;
  const X = (i: number) => L + ((W - L - Rr) * i) / N_,
    Y = (v: number) => T + (Hh - T - B) * (1 - (v - mn) / (mx - mn));
  const pts = (arr: number[]) => arr.map((v, i) => X(off + i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  const hp = [...hist, { ym: TODAY_YM(), v: plan[0] }];
  const step = niceStep((mx - mn) / 4),
    yticks: LineChart["yticks"] = [];
  for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) yticks.push({ y: Y(v), ty: Y(v) + 4, label: short(v) });
  const xticks: LineChart["xticks"] = [];
  for (let i = 0; i <= N_; i++) {
    const ym = addM(x0, i);
    if (ym.endsWith("-01")) xticks.push({ x: X(i), label: ym.slice(0, 4) });
  }
  const bands: LineChart["bands"] = [];
  for (const q of periods) {
    if (!q.from) continue;
    const a = Math.max(0, mdiff(x0, q.from)),
      b = Math.min(N_, mdiff(x0, q.to || q.from) + 1);
    if (b <= a) continue;
    bands.push({ x: X(a), w: X(b) - X(a), fill: q.scen ? "var(--color-neutral-200)" : "var(--color-accent-100)" });
  }
  return {
    plan: pts(plan),
    scen: pts(scen),
    hist: hp.length > 1 ? hp.map((h) => X(mdiff(x0, h.ym)).toFixed(1) + "," + Y(h.v).toFixed(1)).join(" ") : "",
    yticks,
    xticks,
    bands,
    todayX: X(off),
    top: T,
    bandH: Hh - T - B,
  };
}
