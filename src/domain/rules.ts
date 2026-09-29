// Kategorisierung von Buchungen und Erkennung einmaliger Buchungen.

import { DEFAULT_RULES, INCATS, ONEOFF_LIMIT, TRANSFER } from "./constants";
import type { Data, Rule, Tx } from "./types";

/** Empfängername vereinheitlichen, damit gleiche Empfänger zusammenpassen. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((paypal|klarna)\)/, "")
    .replace(/[\/*].*$/, "")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y),
    n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
}

/** Kategorie für eine Buchung nach eigenen IBANs und Regeln bestimmen. */
export function categorize(t: Pick<Tx, "iban" | "payee" | "purpose" | "amount">, rules: Rule[], own: string[] | null): string {
  if (t.iban && own && own.includes(t.iban)) return TRANSFER;
  const hay = (t.payee + " " + t.purpose).toLowerCase();
  for (const r of rules) {
    if (r.s > 0 && t.amount <= 0) continue;
    if (r.s < 0 && t.amount >= 0) continue;
    if (hay.includes(r.m)) return r.c;
  }
  return t.amount > 0 ? "Sonstige Einnahmen" : "Sonstiges";
}

/** Eingebaute Regeln mit umbenannten Kategorien. */
export function defRules(d: Data): Rule[] {
  const rn = d.catRename || {};
  return DEFAULT_RULES.map((r) => (rn[r.c] ? { ...r, c: rn[r.c] } : r));
}

const payeeKey = (t: Tx) => (t.amount < 0 ? "-" : "+") + normKey(t.payee || "");

/**
 * Alle nicht manuell zugeordneten Buchungen neu kategorisieren und das
 * Merkmal "einmalig" neu bestimmen. Gibt die neue Buchungsliste zurück.
 */
export function recat(d: Data): Tx[] {
  const hid = d.hiddenCats || [];
  const rules = [...d.rules, ...defRules(d)].filter((r) => !hid.includes(r.c)),
    own = [...new Set(d.ownIbans || [])];
  const tx = d.tx.map((t) => (t.manual ? t : { ...t, cat: categorize(t, rules, own) }));
  const km: Record<string, Set<string>> = {};
  tx.forEach((t) => {
    const k = payeeKey(t);
    (km[k] = km[k] || new Set()).add(t.date.slice(0, 7));
  });
  const lim = +(d.oneoffLimit as number) || ONEOFF_LIMIT;
  const ka: Record<string, number[]> = {};
  tx.forEach((t) => {
    const k = payeeKey(t);
    (ka[k] = ka[k] || []).push(Math.abs(t.amount));
  });
  return tx.map((t) => {
    const k = payeeKey(t),
      A = Math.abs(t.amount);
    let auto = false;
    if (t.cat !== TRANSFER && A >= lim) {
      const others = ka[k].filter((v) => v !== A);
      auto = !!(
        km[k].size < 3 ||
        (others.length && A > 3 * median(others)) ||
        (t.amount > 0 && !INCATS.includes(t.cat as string))
      );
    }
    const one = t.oneoffManual != null ? t.oneoffManual : auto;
    return one === !!t.oneoff ? t : { ...t, oneoff: one };
  });
}
