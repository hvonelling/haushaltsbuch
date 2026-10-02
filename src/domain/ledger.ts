// Kernrechnungen: Fixkosten, Spartöpfe, Einkommen, Monatszuordnung und Monatsauswertung.
// Diese Funktionen hängen voneinander ab und liegen deshalb in einem Modul.

import { ADD_TYPES, CUTOFF_DAY, INCATS, NOSUG, TRANSFER } from "./constants";
import { addM, mdiff, TODAY_YM } from "./dates";
import { N, uid } from "./format";
import { median, normKey } from "./rules";
import type { Account, CalEvent, Data, Fixed, Person, Pot, Tx } from "./types";

// ---------------------------------------------------------------- Allgemein

export function monthsOf(d: Data): string[] {
  return [...new Set(d.tx.map((t) => t.date.slice(0, 7)))].sort();
}

/** Summe aller Konten ohne Kredite. */
export const total = (a: Account[]) => a.filter((x) => x.kind !== "kredit").reduce((s, x) => s + (N(x.balance) || 0), 0);

export const cutoffOf = (d: Data) => N(d.incomeCutoff) || CUTOFF_DAY;

// ---------------------------------------------------------------- Fixkosten

export interface FixSuggestion {
  key: string;
  name: string;
  cat: string;
  interval: number;
  due: number;
  amount: number;
  n: number;
}

/** Wiederkehrende Zahlungen der letzten Monate erkennen, die noch nicht in der Liste stehen. */
export function suggestFixed(d: Data): FixSuggestion[] {
  const cm = monthsOf(d)
    .filter((m) => m < TODAY_YM())
    .slice(-6);
  if (cm.length < 3) return [];
  type G = { k: string; nk: string; iban: string; name: string; cat: string; tx: { m: string; a: number }[] };
  const g: Record<string, G> = {};
  for (const t of d.tx) {
    if (t.amount >= 0 || t.cat === TRANSFER || t.oneoff || NOSUG.includes(t.cat as string)) continue;
    const m = t.date.slice(0, 7);
    if (!cm.includes(m)) continue;
    const nk = normKey(t.payee || "");
    if (nk.length < 3) continue;
    const k = nk + "|" + (t.iban || "");
    g[k] = g[k] || { k, nk, iban: t.iban || "", name: t.payee, cat: t.cat as string, tx: [] };
    g[k].tx.push({ m, a: -t.amount });
  }
  const have = new Set(d.fixed.map((f) => f.key || normKey(f.name || ""))),
    skip = new Set(d.dismissedSug || []);
  const groups = Object.values(g);
  const out: FixSuggestion[] = [];
  for (const x of groups) {
    if (have.has(x.k) || have.has(x.nk) || skip.has(x.k)) continue;
    const med = median(x.tx.map((t) => t.a));
    if (!med) continue;
    const ms = [...new Set(x.tx.filter((t) => Math.abs(t.a - med) <= med * 0.2).map((t) => t.m))].sort();
    let iv: number | null = null;
    if (ms.length >= Math.max(3, cm.length - 2)) iv = 1;
    else if (ms.length >= 2 && ms.length <= 3 && ms.slice(1).every((m, i) => mdiff(ms[i], m) === 3)) iv = 3;
    if (!iv) continue;
    const dupName = groups.filter((y) => y.nk === x.nk).length > 1;
    out.push({
      key: x.k,
      name: x.name + (dupName && x.iban ? " (…" + x.iban.slice(-4) + ")" : ""),
      cat: x.cat,
      interval: iv,
      due: +ms[ms.length - 1].slice(5),
      amount: Math.round(med * 100) / 100,
      n: ms.length,
    });
  }
  return out.sort((a, b) => b.amount / b.interval - a.amount / a.interval);
}

/** Erkannte Fixkosten direkt in die Liste übernehmen (als "neu erkannt" markiert). */
export function adoptSug(d: Data): { d: Data; n: number } {
  const sg = suggestFixed(d);
  if (!sg.length) return { d, n: 0 };
  return {
    d: {
      ...d,
      fixed: [
        ...d.fixed,
        ...sg.map((x) => ({
          id: uid(),
          key: x.key,
          name: x.name,
          amount: x.amount,
          interval: x.interval,
          due: x.due,
          cat: x.cat,
          isNew: true,
        })),
      ],
      settingsAt: Date.now(),
      changedAt: Date.now(),
    },
    n: sg.length,
  };
}

export function fixedAvg(d: Data): number {
  return (
    d.fixed.reduce((s, f) => s + (N(f.amount) || 0) / (N(f.interval) || 1), 0) +
    (d.events || []).reduce(
      (s, e) => s + (e.dir !== "ein" && N(e.interval) > 0 ? (N(e.amount) || 0) / N(e.interval) : 0),
      0,
    )
  );
}

export function fixedDue(f: Fixed, ym: string): boolean {
  const iv = N(f.interval) || 1;
  if (iv === 1) return true;
  const m = +ym.slice(5),
    st = N(f.due) || 1;
  return (((m - st) % iv) + iv) % iv === 0;
}

export function evDue(e: CalEvent, ym: string): boolean {
  const s = (e.date || "").slice(0, 7);
  if (!s || ym < s) return false;
  const iv = N(e.interval) || 0;
  if (!iv) return ym === s;
  return mdiff(s, ym) % iv === 0;
}

function evIn(d: Data, ym: string): number {
  return (d.events || []).reduce((a, e) => a + (e.dir !== "ein" && evDue(e, ym) ? N(e.amount) || 0 : 0), 0);
}

/** Geplante Fixkosten (Liste plus eigene Termine) in einem Monat. */
export function fixedIn(d: Data, ym: string): number {
  return d.fixed.reduce((s, f) => s + (fixedDue(f, ym) ? N(f.amount) || 0 : 0), 0) + evIn(d, ym);
}

function fixKey(f: Fixed): { nk: string; iban: string } {
  if (f.key) {
    const p = f.key.split("|");
    return { nk: p[0], iban: p[1] || "" };
  }
  return { nk: normKey(f.name || ""), iban: "" };
}

/** Fixkosten-Eintrag, zu dem eine Ausgabe gehört (über Empfänger und IBAN). */
export function fixEntry(t: Tx, d: Data): Fixed | null {
  if (t.amount >= 0 || t.cat === TRANSFER) return null;
  if (t.fixId) {
    // ausdrückliche Zuordnung dieser einen Buchung
    const f = d.fixed.find((x) => x.id === t.fixId);
    if (f) return f;
  }
  const nk = normKey(t.payee || "");
  if (nk.length < 3) return null;
  return (
    d.fixed.find((f) => {
      if (f.external) return false;
      const k = fixKey(f);
      return k.nk && k.nk === nk && (!k.iban || k.iban === (t.iban || ""));
    }) || null
  );
}

// Pro Fixkosten-Eintrag und Monat gilt nur die Buchung als "fix", deren Betrag
// am nächsten am geplanten Betrag liegt. Ergebnis wird je Datenstand zwischengespeichert.
const _fp = new WeakMap<Tx[], { fixed: Fixed[]; set: Set<string> }>();
function fixPick(d: Data): Set<string> {
  const c = _fp.get(d.tx);
  if (c && c.fixed === d.fixed) return c.set;
  const set = new Set<string>(),
    best: Record<string, { id: string; dv: number }> = {};
  for (const t of d.tx) {
    if (t.fixManual != null) continue;
    const f = fixEntry(t, d);
    if (!f) continue;
    if (!(N(f.amount) > 0)) {
      set.add(t.id);
      continue;
    }
    const k = f.id + "|" + ymOf(t, d);
    if (t.fixId === f.id) {
      // ausdrücklich zugeordnet: zählt immer und geht im Monat vor
      set.add(t.id);
      best[k] = { id: t.id, dv: -1 };
      continue;
    }
    const dv = Math.abs(-t.amount - N(f.amount));
    if (!best[k] || dv < best[k].dv) best[k] = { id: t.id, dv };
  }
  Object.values(best).forEach((b) => set.add(b.id));
  _fp.set(d.tx, { fixed: d.fixed, set });
  return set;
}

export function isFix(t: Tx, d: Data): boolean {
  if (t.amount >= 0 || t.cat === TRANSFER) return false;
  if (t.fixManual != null) return !!t.fixManual;
  return fixPick(d).has(t.id);
}

// ---------------------------------------------------------------- Spartöpfe

/** Spartopf einer Buchung: ausdrücklich gesetzt, über Sparkonto oder über die Kategorie. */
export function potOf(t: Tx, d: Data): string | null {
  if (t.pot != null) return t.pot || null;
  const ps = d.pots || [];
  if (t.cat === TRANSFER) {
    if (t.amount >= 0) return null;
    const ib = (t.iban || "").replace(/\s/g, "").toUpperCase(),
      py = (t.payee || "").toLowerCase();
    const p = ps.find((p) => {
      const k = String(p.key || "").trim();
      if (k.length < 3) return false;
      return k.replace(/\s/g, "").toUpperCase() === ib || py.includes(k.toLowerCase());
    });
    return p ? p.id : null;
  }
  const p = ps.find((p) => p.cat && p.cat === t.cat);
  return p ? p.id : null;
}

export function potBal(p: Pot, d: Data): { dep: number; out: number; bal: number } {
  const from = p.startDate || "";
  let dep = 0,
    out = 0;
  for (const t of d.tx) {
    if (from && t.date < from) continue;
    if (potOf(t, d) !== p.id) continue;
    if (t.cat === TRANSFER) {
      if (t.amount < 0) dep -= t.amount;
      else out += t.amount;
    } else if (t.amount > 0) dep += t.amount;
    else out -= t.amount;
  }
  return { dep, out, bal: (N(p.start) || 0) + dep - out };
}

export function potDepIn(p: Pot, d: Data, ym: string): number {
  return d.tx.reduce(
    (a, t) =>
      t.date.startsWith(ym) && potOf(t, d) === p.id && (t.cat === TRANSFER ? t.amount < 0 : t.amount > 0)
        ? a + Math.abs(t.amount)
        : a,
    0,
  );
}

// ---------------------------------------------------------------- Einkommen

function egRate(n: number): number {
  if (n < 1000) return Math.min(1, 0.67 + ((1000 - n) / 2) * 0.001);
  if (n <= 1200) return 0.67;
  if (n >= 1240) return 0.65;
  return 0.67 - ((n - 1200) / 2) * 0.001;
}

/** Geschätzte Leistung für einen Zeitraum-Typ (Elterngeld, Krankengeld, ALG I). */
export function suggest(p: Person | undefined, type: string): number | null {
  if (!p) return null;
  const n = N(p.netto) || 0,
    b = N(p.brutto) || 0;
  switch (type) {
    case "Elterngeld (Basis)":
      return Math.round(Math.min(1800, Math.max(300, n * egRate(n))));
    case "ElterngeldPlus":
      return Math.round(Math.min(900, Math.max(150, (n * egRate(n)) / 2)));
    case "Krankengeld":
      return Math.round(Math.min(0.7 * Math.min(b, 5812.5), 0.9 * n) * 0.875);
    case "ALG I":
      return Math.round(n * 0.6);
    case "ALG I (mit Kind)":
      return Math.round(n * 0.67);
  }
  return null;
}

/** Feste Gehälter statt gebuchter Gehälter verwenden? */
export function fixedInc(d: Data): boolean {
  return d.incomeMode === "fest" && d.persons.some((p) => N(p.netto) > 0);
}

/** Monat, dem eine Buchung zugerechnet wird (Stichtag-Regeln). */
export function ymOf(t: Tx, d: Data): string {
  const ym = t.date.slice(0, 7);
  if (t.amount < 0 && t.cat !== TRANSFER && +t.date.slice(8, 10) >= cutoffOf(d)) {
    const f = fixEntry(t, d);
    if (f && f.early) return addM(ym, 1);
  }
  if (d.incomeMode === "stichtag" && t.cat === "Einkommen" && t.amount > 0 && +t.date.slice(8, 10) >= cutoffOf(d))
    return addM(ym, 1);
  return ym;
}

/** Geplantes Einkommen und Zusatzausgaben eines Monats. scen = Szenarien mitrechnen. */
export function incomeFor(d: Data, ym: string, scen: boolean): { inc: number; exp: number } {
  let inc = 0,
    exp = 0;
  for (const p of d.persons) {
    let v = N(p.netto) || 0;
    for (const q of d.periods) {
      if (q.person !== p.id || ADD_TYPES.includes(q.type) || (q.scen && !scen) || !q.from) continue;
      if (ym >= q.from && ym <= (q.to || q.from))
        v = q.amount != null && q.amount !== "" ? N(q.amount) : suggest(p, q.type) || 0;
    }
    inc += v;
  }
  for (const q of d.periods) {
    if (!ADD_TYPES.includes(q.type) || (q.scen && !scen) || !q.from) continue;
    if (ym >= q.from && ym <= (q.to || q.from)) {
      if (q.type === "Zusatzeinkommen") inc += N(q.amount) || 0;
      else exp += N(q.amount) || 0;
    }
  }
  inc += N(d.kindergeld) || 0;
  return { inc, exp };
}

// ---------------------------------------------------------------- Monatsauswertung

export interface PotMonth {
  out: number;
  in: number;
  dep: number;
}

export interface MonthStats {
  ein: number;
  aus: number;
  spar: number;
  varA: number;
  byCat: Record<string, number>;
  byCatVar: Record<string, number>;
  fixA: number;
  einFix: number;
  einOther: number;
  oneEin: number;
  oneAus: number;
  byPot: Record<string, PotMonth>;
  potSum: number;
  potSave: number;
  salB: number;
  fest: boolean;
}

export function monthStats(d: Data, ym: string): MonthStats {
  let ein = 0,
    aus = 0,
    spar = 0,
    varA = 0,
    oneEin = 0,
    oneAus = 0,
    salB = 0,
    fixA = 0,
    einFix = 0;
  const byCat: Record<string, number> = {},
    byPot: Record<string, PotMonth> = {},
    byCatVar: Record<string, number> = {};
  const fest = fixedInc(d);
  let potSave = 0;
  for (const t of d.tx) {
    if (ymOf(t, d) !== ym) continue;
    const pid = potOf(t, d),
      bp = () => (byPot[pid as string] = byPot[pid as string] || { out: 0, in: 0, dep: 0 });
    const cat = t.cat as string;
    if (cat === TRANSFER) {
      spar -= t.amount;
      if (pid) {
        const b = bp();
        if (t.amount < 0) {
          b.dep -= t.amount;
          potSave -= t.amount;
        } else b.out += t.amount;
      }
      continue;
    }
    if (pid) {
      const b = bp();
      if (t.amount < 0) b.out -= t.amount;
      else b.in += t.amount;
      continue;
    }
    if (fest && cat === "Einkommen" && t.amount > 0) {
      salB += t.amount;
      continue;
    }
    if (t.oneoff && !(t.amount < 0 && N((d.budgets || {})[cat]) > 0)) {
      if (t.amount > 0) {
        ein += t.amount;
        oneEin += t.amount;
      } else {
        aus -= t.amount;
        oneAus -= t.amount;
      }
      continue;
    }
    if (INCATS.includes(cat)) {
      ein += t.amount;
      if (!fest && cat === "Einkommen") einFix += t.amount;
      continue;
    }
    aus -= t.amount;
    byCat[cat] = (byCat[cat] || 0) - t.amount;
    if (isFix(t, d)) fixA -= t.amount;
    else {
      varA -= t.amount;
      byCatVar[cat] = (byCatVar[cat] || 0) - t.amount;
    }
  }
  if (fest) {
    const v = incomeFor(d, ym, false).inc;
    ein += v;
    einFix = v;
  }
  return {
    ein,
    aus,
    spar,
    varA,
    byCat,
    byCatVar,
    fixA,
    einFix,
    einOther: ein - einFix,
    oneEin,
    oneAus,
    byPot,
    potSum: Object.values(byPot).reduce((a, b) => a + b.out, 0),
    potSave,
    salB,
    fest,
  };
}

/** Schnitt der variablen Ausgaben der letzten drei vollständigen Monate. */
export function varAuto(d: Data): number {
  const ms = monthsOf(d)
    .filter((m) => m < TODAY_YM())
    .slice(-3);
  if (!ms.length) return 0;
  return ms.reduce((s, m) => s + monthStats(d, m).varA, 0) / ms.length;
}

export function varAvg(d: Data): number {
  return d.varOverride != null && d.varOverride !== "" ? N(d.varOverride) : varAuto(d);
}

/** Summe der Budgets aller sichtbaren Ausgabenkategorien. */
export function budTotal(d: Data): number {
  const hid = d.hiddenCats || [];
  return Object.entries(d.budgets || {}).reduce(
    (s, [c, b]) => s + (N(b) > 0 && !hid.includes(c) && !INCATS.includes(c) ? N(b) : 0),
    0,
  );
}

const entryKey = (f: Fixed) => f.id || f.key || f.name;

// Je Fixkosten-Eintrag: in welchen Monaten wurde eine Buchung als diese Fixkosten gezählt?
const _fb = new WeakMap<Tx[], { fixed: Fixed[]; map: Record<string, Record<string, string>> }>();
/** Monat → Buchungsdatum je Fixkosten-Eintrag. */
export function fixBooked(d: Data): Record<string, Record<string, string>> {
  const c = _fb.get(d.tx);
  if (c && c.fixed === d.fixed) return c.map;
  const map: Record<string, Record<string, string>> = {};
  d.tx.forEach((t) => {
    if (t.oneoff || potOf(t, d) || !isFix(t, d)) return;
    const f = fixEntry(t, d);
    if (f) (map[entryKey(f)] = map[entryKey(f)] || {})[ymOf(t, d)] = t.date;
  });
  _fb.set(d.tx, { fixed: d.fixed, map });
  return map;
}

/**
 * Datum der Abbuchung, falls der Eintrag für diesen Monat bezahlt ist.
 * Seltene Fixkosten (viertel-, halb-, jährlich) gelten auch als bezahlt,
 * wenn die Abbuchung einen Monat früher oder später kam.
 */
export function bookedOn(f: Fixed, ym: string, booked: Record<string, Record<string, string>>): string | null {
  const m = booked[entryKey(f)];
  if (!m) return null;
  if (m[ym]) return m[ym];
  if ((N(f.interval) || 1) >= 2) return m[addM(ym, -1)] || m[addM(ym, 1)] || null;
  return null;
}
const isBooked = (f: Fixed, ym: string, booked: Record<string, Record<string, string>>) => !!bookedOn(f, ym, booked);

export interface FixMatch {
  f: Fixed;
  t: Tx;
  ym: string;
}

/**
 * Vorschläge "Diese Buchung könnte zu offenen Fixkosten gehören":
 * Eintrag im letzten oder laufenden Monat fällig und noch nicht abgebucht,
 * dazu eine nicht zugeordnete Ausgabe mit höchstens 10 % Abweichung.
 */
export function fixSuggestions(d: Data): FixMatch[] {
  const no = new Set(d.fixNo || []);
  const booked = fixBooked(d);
  const out: FixMatch[] = [];
  const used = new Set<string>();
  const cur = TODAY_YM(),
    lo = addM(cur, -2),
    hi = addM(cur, 1);
  // nur Ausgaben im fraglichen Zeitraum, die noch zu keinem Eintrag gehören
  const cands = d.tx.filter((t) => {
    const m = t.date.slice(0, 7);
    return (
      m >= lo && m <= hi && t.amount < 0 && t.cat !== TRANSFER && t.fixManual == null && !t.fixId && !t.oneoff && !potOf(t, d) && !fixEntry(t, d)
    );
  });
  if (!cands.length) return out;
  for (const ym of [addM(cur, -1), cur]) {
    for (const f of d.fixed) {
      const amt = N(f.amount);
      if (f.external || !(amt > 0) || !fixedDue(f, ym) || isBooked(f, ym, booked)) continue;
      const rare = (N(f.interval) || 1) >= 2;
      let best: { t: Tx; dv: number } | null = null;
      for (const t of cands) {
        if (used.has(t.id) || no.has(t.id + ">" + f.id)) continue;
        const m = ymOf(t, d);
        if (!(m === ym || (rare && (m === addM(ym, -1) || m === addM(ym, 1))))) continue;
        // Nur Buchungen derselben Kategorie oder noch nicht einsortierte ("Sonstiges"),
        // damit z. B. ein Restaurantbesuch nicht als Gas-Abschlag vorgeschlagen wird.
        if (t.cat !== f.cat && t.cat !== "Sonstiges") continue;
        const dv = Math.abs(-t.amount - amt);
        if (dv > amt * 0.1) continue;
        if (!best || dv < best.dv) best = { t, dv };
      }
      if (best) {
        used.add(best.t.id);
        out.push({ f, t: best.t, ym });
      }
    }
  }
  return out;
}

/** Noch offene (nicht abgebuchte) Fixkosten und Termine eines Monats. */
export function fixOpenIn(d: Data, ym: string): number {
  const booked = fixBooked(d);
  let fixOpen = 0;
  d.fixed.forEach((f) => {
    if (fixedDue(f, ym) && !isBooked(f, ym, booked)) fixOpen += N(f.amount) || 0;
  });
  (d.events || []).forEach((e) => {
    if (e.dir !== "ein" && evDue(e, ym) && !(e.done || {})[ym]) fixOpen += N(e.amount) || 0;
  });
  return fixOpen;
}

/** Abweichung des laufenden Monats vom Plan (fließt einmalig in die Planung ein). */
export function curExpected(d: Data): { off: number } {
  const ym = TODAY_YM(),
    st = monthStats(d, ym);
  const fixOpen = fixOpenIn(d, ym);
  let budSeg = 0,
    budSp = 0;
  const hid = d.hiddenCats || [];
  Object.entries(d.budgets || {}).forEach(([c, b]) => {
    if (N(b) > 0 && !hid.includes(c)) {
      const sp = st.byCatVar[c] || 0;
      budSeg += Math.max(N(b), sp);
      budSp += sp;
    }
  });
  const fixTot = st.fixA + fixOpen,
    noBud = Math.max(0, st.aus - st.fixA - budSp),
    fixPlan = fixedIn(d, ym),
    budTot = budTotal(d);
  return { off: fixPlan - fixTot + (budTot - budSeg) - noBud };
}

/** Geplantes Sparpotenzial eines Monats: Einkommen − Zusatzausgaben − Fixkosten − Budgets. */
export function planSpar(d: Data, ym: string, scen: boolean): number {
  const r = incomeFor(d, ym, scen);
  return r.inc - r.exp - fixedIn(d, ym) - budTotal(d);
}
