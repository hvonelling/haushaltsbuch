// Datenbestand anlegen, laden, zusammenführen und importieren.
// Alles hier sind reine Funktionen ohne Zugriff auf Browser-Speicher.

import { BANK_SINCE, CUTOFF_DAY, ONEOFF_LIMIT } from "./constants";
import { parseBank, sameTx } from "./csv";
import { dayDiff, TODAY_YM } from "./dates";
import { uid } from "./format";
import { adoptSug, total } from "./ledger";
import { recat } from "./rules";
import type { Backup, BankAsk, Data, Tx } from "./types";

export function emptyData(): Data {
  return {
    persons: [
      { id: "A", name: "Person 1", netto: null, brutto: null },
      { id: "B", name: "Person 2", netto: null, brutto: null },
    ],
    tx: [],
    rules: [],
    fixed: [],
    accounts: [],
    periods: [],
    snapshots: {},
    varOverride: null,
    budgets: {},
    ownIbans: [],
    deleted: [],
    oneoffLimit: ONEOFF_LIMIT,
    pots: [
      { id: "p_urlaub", name: "Urlaubskasse", cat: "Urlaub" },
      { id: "p_ruecklage", name: "Rücklagen", cat: "" },
    ],
    incomeMode: "fest",
    incomeCutoff: CUTOFF_DAY,
    dismissedSug: [],
    changedAt: 0,
    savedAt: 0,
    settingsAt: 0,
  };
}

/** Gespeicherten Stand (lokal) aufbereiten, wie beim Start der App. */
export function normalizeLoaded(raw: Partial<Data>): Data {
  const d: Data = { ...emptyData(), ...raw };
  d.tx = d.tx.map((t) => (t.acct ? t : { ...t, acct: t.src === "Manuell" ? "Bar/Manuell" : "DKB" }));
  d.ownIbans = [...new Set(d.ownIbans || [])];
  d.tx = recat(d);
  return d;
}

/** Sicherungsdatei im Format des Prototyps erzeugen. */
export function toBackup(d: Data, now: number): Backup {
  return { app: "haushaltsbuch", version: 3, exported: new Date(now).toISOString(), data: d };
}

/** Inhalt einer Sicherungsdatei lesen. Wirft bei ungültigen Dateien. */
export function parseBackup(text: string): Data {
  const j = JSON.parse(text);
  const src = j && (j.data || j);
  // Strenger als der Prototyp: die Datei muss eine Buchungsliste enthalten.
  if (!src || !Array.isArray(src.tx)) throw new Error("Keine Haushaltsbuch-Sicherung.");
  return { ...emptyData(), ...src };
}

export interface MergeResult {
  d: Data;
  added: number;
  newFixed: number;
  msg: string;
}

/**
 * Stand aus der iCloud-Datei mit dem Stand dieses Geräts zusammenführen.
 * Buchungen: pro Buchung gewinnt die zuletzt bearbeitete; Gelöschtes bleibt gelöscht.
 * Einstellungen (Fixkosten, Konten, Budgets, Einkommen …): der zuletzt geänderte Stand gewinnt.
 */
export function mergeBackup(d: Data, inc: Data): MergeResult {
  const deleted = [...new Set([...(d.deleted || []), ...(inc.deleted || [])])],
    del = new Set(deleted);
  const map = new Map<string, Tx>();
  [...d.tx, ...inc.tx].forEach((t) => {
    const ex = map.get(t.id);
    if (!ex || (t.editedAt || 0) > (ex.editedAt || 0)) map.set(t.id, t);
  });
  const useInc = (inc.settingsAt || 0) >= (d.settingsAt || 0),
    base = useInc ? inc : d,
    other = useInc ? d : inc;
  const rules = [...(base.rules || [])];
  (other.rules || []).forEach((r) => {
    if (!rules.some((x) => x.m === r.m)) rules.push(r);
  });
  const nd: Data = {
    ...d,
    persons: base.persons,
    fixed: base.fixed,
    accounts: base.accounts,
    periods: base.periods,
    budgets: base.budgets || {},
    customCats: base.customCats || [],
    hiddenCats: base.hiddenCats || [],
    catRename: base.catRename || {},
    bank: base.bank || d.bank,
    bankAsk: [
      ...(d.bankAsk || []),
      ...(inc.bankAsk || []).filter((a) => !(d.bankAsk || []).some((x) => x.bank === a.bank && x.man === a.man)),
    ],
    events: base.events || [],
    pots: base.pots || [],
    incomeMode: base.incomeMode || "fest",
    incomeCutoff: base.incomeCutoff || CUTOFF_DAY,
    kindergeld: base.kindergeld,
    varOverride: base.varOverride,
    keepRest: base.keepRest,
    settingsAt: Math.max(d.settingsAt || 0, inc.settingsAt || 0),
    ownIbans: [...new Set([...(d.ownIbans || []), ...(inc.ownIbans || [])])],
    dismissedSug: [...new Set([...(d.dismissedSug || []), ...(inc.dismissedSug || [])])],
    oneoffLimit: base.oneoffLimit || ONEOFF_LIMIT,
    rules,
    deleted,
    tx: [...map.values()].filter((t) => !del.has(t.id)),
    snapshots: { ...d.snapshots, ...inc.snapshots },
    changedAt: Date.now(),
  };
  nd.tx = recat(nd);
  const added = nd.tx.length - d.tx.length;
  const ad = adoptSug(nd);
  return {
    d: ad.d,
    added,
    newFixed: ad.n,
    msg:
      "Zusammengeführt: " +
      nd.tx.length +
      " Buchungen" +
      (added > 0 ? " (" + added + " neu)" : "") +
      "." +
      (ad.n ? " " + ad.n + " neue Fixkosten erkannt." : ""),
  };
}

/** Bank-CSV-Dateien importieren. Vorhandene Buchungen werden übersprungen. */
export function importCsvTexts(d0: Data, texts: string[]): { d: Data; msg: string } {
  let d = d0;
  const msgs: string[] = [];
  for (const text of texts) {
    try {
      const r = parseBank(text);
      const byId = new Map(d.tx.map((t) => [t.id, t] as const));
      const fresh: Tx[] = [];
      let dup = 0;
      const bankTx = d.tx.filter((t) => t.src === "Bank"),
        used = new Set<string>();
      r.tx.forEach((t) => {
        const ex = byId.get(t.id);
        if (ex) {
          dup++;
          if (!ex.iban || !ex.acct) byId.set(t.id, { ...ex, iban: t.iban, acct: t.acct });
          return;
        }
        const bm = bankTx.find((b) => !used.has(b.id) && sameTx(b, t));
        if (bm) {
          used.add(bm.id);
          dup++;
          return;
        }
        fresh.push(t);
      });
      const ownIbans = [...new Set([...(d.ownIbans || []), ...(r.own ? [r.own] : [])])];
      let accounts = d.accounts;
      let i = accounts.findIndex((a) => r.own && a.iban === r.own);
      if (i < 0 && r.bank === "DKB") i = accounts.findIndex((a) => a.giro && !a.iban);
      if (i >= 0)
        accounts = accounts.map((a, j) =>
          j === i ? { ...a, iban: r.own, balance: r.balance != null ? r.balance : a.balance } : a,
        );
      else
        accounts = [
          ...accounts,
          {
            id: uid(),
            name: "Girokonto " + r.bank,
            iban: r.own,
            balance: r.balance,
            rate: 0,
            monthly: 0,
            target: null,
            puffer: !accounts.some((a) => a.puffer),
            giro: true,
          },
        ];
      d = {
        ...d,
        tx: [...byId.values(), ...fresh],
        ownIbans,
        accounts,
        snapshots: { ...d.snapshots, [TODAY_YM()]: total(accounts) },
        changedAt: Date.now(),
        settingsAt: Date.now(),
      };
      d.tx = recat(d);
      msgs.push(
        r.bank +
          ": " +
          fresh.length +
          " neu" +
          (dup ? ", " + dup + " schon vorhanden" : "") +
          (r.balance == null ? " (Kontostand unter Planung → Konten eintragen)" : ""),
      );
    } catch (e) {
      msgs.push((e as Error).message);
    }
  }
  const ad = adoptSug(d);
  d = ad.d;
  if (ad.n) msgs.push(ad.n + " neue Fixkosten erkannt und übernommen");
  return { d, msg: msgs.join(" · ") };
}

// ---------------------------------------------------------------- Bankabruf (für den späteren Server)

export interface BankResponse {
  tx?: { date: string; amount: number; payee?: string; purpose?: string; ref?: string; iban?: string; ownIban?: string; bank: string }[];
  accounts?: { iban?: string; balance?: number | null }[];
  errors?: string[];
}

/** Ergebnis eines Bankabrufs übernehmen; Doppelte aus CSV werden erkannt. */
export function bankMerge(d: Data, res: BankResponse): { d: Data; msg: string } {
  const b = d.bank || {},
    since = b.since || BANK_SINCE,
    ex = d.tx,
    ids = new Set(ex.map((t) => t.id)),
    del = new Set(d.deleted || []),
    no = new Set(b.askNo || []),
    used = new Set<string>(),
    fresh: Tx[] = [],
    asks: BankAsk[] = [...(d.bankAsk || [])];
  let skip = 0;
  const accName = (iban: string | undefined, bank: string) => {
    const a = (d.accounts || []).find((x) => x.iban && x.iban === iban);
    return a
      ? (a.name || "").replace(/^Girokonto\s*/, "") || bank
      : /dkb|deutsche kreditbank/i.test(bank)
        ? "DKB"
        : /sparkasse/i.test(bank)
          ? "Sparkasse"
          : bank;
  };
  (res.tx || []).forEach((x) => {
    if (x.date < since) return;
    const id = "EB|" + (x.ref || [x.date, x.amount, x.payee, x.purpose].join("|"));
    if (ids.has(id) || del.has(id)) return;
    const dup = ex.find((t) => t.src !== "Manuell" && t.src !== "Bank" && !used.has(t.id) && sameTx(t, x));
    if (dup) {
      used.add(dup.id);
      skip++;
      return;
    }
    const t: Tx = {
      id,
      date: x.date,
      payee: x.payee || "—",
      purpose: x.purpose || "",
      amount: x.amount,
      cat: null,
      manual: false,
      src: "Bank",
      acct: accName(x.ownIban, x.bank),
      iban: x.iban || "",
    };
    fresh.push(t);
    ids.add(id);
    const m = ex.find(
      (t) =>
        t.src === "Manuell" &&
        Math.abs(t.amount - x.amount) < 0.005 &&
        dayDiff(t.date, x.date) <= 5 &&
        !no.has(t.id + ">" + id) &&
        !asks.some((a) => a.man === t.id),
    );
    if (m) asks.push({ bank: id, man: m.id });
  });
  let accounts = d.accounts || [];
  (res.accounts || []).forEach((a) => {
    if (a.balance != null && a.iban) accounts = accounts.map((x) => (x.iban === a.iban ? { ...x, balance: a.balance } : x));
  });
  const own = [...new Set([...(d.ownIbans || []), ...(res.accounts || []).map((a) => a.iban).filter(Boolean)])] as string[];
  let nd: Data = {
    ...d,
    tx: [...ex, ...fresh],
    accounts,
    ownIbans: own,
    bankAsk: asks,
    bank: { ...b, lastSync: Date.now(), lastErr: (res.errors || []).join(" · ") || null },
    changedAt: Date.now(),
  };
  nd.tx = recat(nd);
  nd = adoptSug(nd).d;
  const na = asks.length - (d.bankAsk || []).length;
  return {
    d: nd,
    msg:
      "Bank: " +
      fresh.length +
      " neue Buchungen" +
      (skip ? " · " + skip + " schon per CSV vorhanden" : "") +
      (na > 0 ? " · " + na + " passen zu manuellen Einträgen" : "") +
      ((res.errors || []).length ? " · " + (res.errors || []).join(" · ") : ""),
  };
}

/** Antwort auf "Ist das deine Buchung?": manuellen Eintrag in Bankbuchung aufgehen lassen oder beide behalten. */
export function bankAnswer(dd: Data, a: BankAsk, yes: boolean): Data {
  const b = dd.bank || {};
  const rest = (dd.bankAsk || []).filter((x) => !(x.bank === a.bank && x.man === a.man));
  if (!yes) return { ...dd, bankAsk: rest, bank: { ...b, askNo: [...(b.askNo || []), a.man + ">" + a.bank] } };
  const m = dd.tx.find((t) => t.id === a.man);
  if (!m) return { ...dd, bankAsk: rest };
  const tx = dd.tx
    .filter((t) => t.id !== a.man)
    .map((t) =>
      t.id === a.bank
        ? {
            ...t,
            cat: m.cat,
            manual: m.manual,
            pot: m.pot,
            note: m.note || t.note,
            fixManual: m.fixManual,
            evId: m.evId,
            oneoff: m.oneoff ?? t.oneoff,
            editedAt: Date.now(),
          }
        : t,
    );
  const events = (dd.events || []).map((e) => {
    const dn = { ...(e.done || {}) };
    let ch = false;
    Object.keys(dn).forEach((k) => {
      const v = dn[k];
      if (v && v.tx === a.man) {
        dn[k] = { ...v, tx: a.bank };
        ch = true;
      }
    });
    return ch ? { ...e, done: dn } : e;
  });
  return { ...dd, tx, events, bankAsk: rest.filter((x) => x.man !== a.man), deleted: [...(dd.deleted || []), a.man] };
}
