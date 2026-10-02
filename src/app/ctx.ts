// Gemeinsame, bei jedem Zeichnen berechnete Werte für alle Bildschirme.

import { CATS, INCATS, TRANSFER } from "../domain/constants";
import { addM, TODAY_YM } from "../domain/dates";
import { f0 } from "../domain/format";
import { fixedAvg, monthsOf, monthStats, planSpar, suggestFixed, total, type FixSuggestion, type MonthStats } from "../domain/ledger";
import { project } from "../domain/planning";
import { median } from "../domain/rules";
import type { Data, Pot } from "../domain/types";
import type { App } from "./App";
import { TABL, VIEWS, type Tab, type UiState, type View } from "./state";

export interface Ctx {
  app: App;
  s: UiState;
  d: Data;
  ALLC: string[];
  EXPC: string[];
  months: string[];
  /** Monate zum Blättern (mit Buchungen plus laufender Monat) */
  navMonths: string[];
  cm: string[];
  sel: string;
  noInc: boolean;
  stOf: (m: string) => MonthStats;
  st: MonthStats;
  go: (tab: Tab, view?: View | null, extra?: Partial<UiState>) => void;
  goView: Record<View, () => void>;
  openCat: (c: string) => void;
  fA: number;
  spar: number;
  H: number;
  pPlan: ReturnType<typeof project>;
  pScen: ReturnType<typeof project>;
  today: number;
  hasScen: boolean;
  scenVisible: boolean;
  pots: Pot[];
  potName: (id: string | null) => string;
  potOpts: { v: string; l: string }[];
  budgets: Data["budgets"];
  sugs: FixSuggestion[];
  medOf: (c: string, key: "byCat" | "byCatVar") => number | null;
  dPct: (v: number, med: number | null) => string;
}

const top = () => {
  if (typeof window !== "undefined") window.scrollTo(0, 0);
};

export function buildCtx(app: App): Ctx {
  const s = app.state,
    d = s.data;
  const hid = d.hiddenCats || [],
    ALLC = [...CATS.filter((c) => !hid.includes(c)), ...(d.customCats || [])],
    EXPC = ALLC.filter((c) => !INCATS.includes(c) && c !== TRANSFER);
  const months = monthsOf(d);
  const noInc = !d.persons.some((p) => +(p.netto as number) > 0);
  // Standard ist der laufende Monat, auch wenn er noch keine Buchungen hat.
  const sel = s.month || TODAY_YM();
  // Monate zum Blättern: alle mit Buchungen plus der laufende Monat.
  const navMonths = months.includes(TODAY_YM()) ? months : [...months, TODAY_YM()].sort();
  const SM: Record<string, MonthStats> = {};
  months.forEach((m) => (SM[m] = monthStats(d, m)));
  const stOf = (m: string) => SM[m] || monthStats(d, m);
  const go = (tab: Tab, view?: View | null, extra?: Partial<UiState>) => {
    app.setState({ tab, view: view || null, ...(extra || {}) });
    top();
  };
  const goView = {} as Record<View, () => void>;
  (Object.keys(VIEWS) as View[]).forEach((k) => (goView[k] = () => go(s.tab, k)));
  const fA = fixedAvg(d),
    nextYM = addM(TODAY_YM(), 1);
  const spar = planSpar(d, nextYM, false);
  const H = s.horizon,
    pPlan = project(d, false, H),
    pScen = project(d, true, H),
    today = total(d.accounts);
  const hasScen = d.periods.some((q) => q.scen),
    scenVisible = s.showScen && hasScen;
  const st = stOf(sel);
  const cm = months.filter((m) => m < TODAY_YM());
  const pots = d.pots || [],
    potName = (id: string | null) => (pots.find((p) => p.id === id) || ({} as Pot)).name || "Spartopf",
    potOpts = pots.map((p) => ({ v: p.id, l: p.name || "Ohne Name" }));
  const firstM = months[0] || TODAY_YM(),
    medMs: string[] = [];
  for (let k = 1; k <= 12; k++) {
    const m = addM(sel, -k);
    if (m < firstM) break;
    if (m < TODAY_YM()) medMs.push(m);
  }
  const medOf = (c: string, key: "byCat" | "byCatVar") =>
    medMs.length < 3 ? null : median(medMs.map((m) => stOf(m)[key][c] || 0));
  const dPct = (v: number, med: number | null) => {
    if (med == null) return "";
    if (med < 1) return v > 0.5 ? "neu" : "";
    const p = Math.round(((v - med) / med) * 100);
    return (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p) + " %";
  };
  const openCat = (c: string) => go(s.tab, "cat", { anCat: c });
  return {
    app,
    s,
    d,
    ALLC,
    EXPC,
    months,
    navMonths,
    cm,
    sel,
    noInc,
    stOf,
    st,
    go,
    goView,
    openCat,
    fA,
    spar,
    H,
    pPlan,
    pScen,
    today,
    hasScen,
    scenVisible,
    pots,
    potName,
    potOpts,
    budgets: d.budgets || {},
    sugs: suggestFixed(d),
    medOf,
    dPct,
  };
}

/** Kennzahlen "Sparpotenzial" und "Erspartes" (Übersicht und Planung). */
export function kpiOf(c: Ctx) {
  const { noInc, spar, pPlan, today, H, fA } = c;
  return {
    fixAvg: f0(fA),
    spar: noInc ? "—" : f0(spar),
    sparNote: noInc
      ? "Einkommen eintragen"
      : "pro Monat · Netto − Fixkosten − Budgets" +
        (pPlan.off < -0.5
          ? " · dieser Monat einmalig " + f0(pPlan.off)
          : pPlan.off > 0.5
            ? " · dieser Monat einmalig +" + f0(pPlan.off)
            : ""),
    today: f0(today),
    future: noInc ? "" : "in " + H / 12 + " Jahren " + f0(pPlan.series[H]),
  };
}

export { TABL, VIEWS };
