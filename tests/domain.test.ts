// Tests der Fachlogik mit erfundenen Daten.
import { beforeEach, describe, expect, it } from "vitest";
import { TRANSFER } from "../src/domain/constants";
import { parseBank } from "../src/domain/csv";
import { emptyData, importCsvTexts, mergeBackup, parseBackup, toBackup } from "../src/domain/data";
import { setNow } from "../src/domain/dates";
import { incomeFor, isFix, monthStats, suggest, suggestFixed } from "../src/domain/ledger";
import { categorize, normKey, recat } from "../src/domain/rules";
import type { Data, Tx } from "../src/domain/types";
import { DKB_CSV, SPK_CSV } from "./fixtures";

beforeEach(() => setNow(new Date(2026, 8, 29, 12)));

const tx = (p: Partial<Tx>): Tx => ({
  id: p.id || Math.random().toString(36),
  date: "2026-09-10",
  payee: "X",
  purpose: "",
  amount: -10,
  cat: null,
  manual: false,
  src: "DKB",
  acct: "DKB",
  ...p,
});

describe("CSV-Import", () => {
  it("liest DKB: gebuchte Umsätze, Kontostand, eigene IBAN, PayPal-Händler", () => {
    const r = parseBank(DKB_CSV);
    expect(r.bank).toBe("DKB");
    expect(r.balance).toBe(2345.67);
    expect(r.own).toBe("DE00120300000000000001");
    expect(r.tx.map((t) => t.payee)).toEqual(["Beispiel Wohnbau GmbH", "REWE Markt", "REWE Markt", "Buchladen XY (PayPal)", "Arbeitgeber AG"]);
    // doppelte Zeilen bekommen unterschiedliche IDs
    expect(new Set(r.tx.map((t) => t.id)).size).toBe(5);
    expect(r.tx[4].amount).toBe(3100);
  });

  it("liest Sparkasse CSV-CAMT und überspringt vorgemerkte Umsätze", () => {
    const r = parseBank(SPK_CSV);
    expect(r.bank).toBe("Sparkasse");
    expect(r.tx.map((t) => [t.date, t.payee, t.amount])).toEqual([
      ["2026-09-02", "Sportgeschaeft Z (Klarna)", -89.9],
      ["2026-09-04", "Max Muster", 200],
    ]);
  });

  it("importiert ohne Dubletten und legt das Girokonto an", () => {
    const a = importCsvTexts(emptyData(), [DKB_CSV]);
    expect(a.d.tx).toHaveLength(5);
    expect(a.d.accounts[0]).toMatchObject({ name: "Girokonto DKB", balance: 2345.67, giro: true });
    const b = importCsvTexts(a.d, [DKB_CSV]);
    expect(b.d.tx).toHaveLength(5);
    expect(b.msg).toContain("5 schon vorhanden");
  });

  it("erkennt Umbuchungen zwischen eigenen Konten", () => {
    const a = importCsvTexts(emptyData(), [DKB_CSV, SPK_CSV]).d;
    const t = a.tx.find((x) => x.payee === "Max Muster")!;
    expect(t.cat).toBe(TRANSFER);
  });

  it("meldet unbekannte Formate verständlich", () => {
    expect(importCsvTexts(emptyData(), ["foo;bar"]).msg).toContain("Format nicht erkannt");
  });
});

describe("Kategorien", () => {
  it("wendet eingebaute Regeln an, eigene vorher", () => {
    expect(categorize(tx({ payee: "REWE Markt" }), [], [])).toBe("Sonstiges");
    const d = { ...emptyData(), tx: [tx({ payee: "REWE Markt" }), tx({ payee: "Lohn/Gehalt", amount: 3000 })] };
    expect(recat(d).map((t) => t.cat)).toEqual(["Lebensmittel", "Einkommen"]);
    const d2 = { ...d, rules: [{ m: "rewe", c: "Shopping", s: 0 }] };
    expect(recat(d2)[0].cat).toBe("Shopping");
  });

  it("markiert hohe seltene Ausgaben als einmalig", () => {
    const d = { ...emptyData(), tx: [tx({ payee: "Autohaus", amount: -8000 })] };
    expect(recat(d)[0].oneoff).toBe(true);
  });

  it("vereinheitlicht Empfänger", () => {
    expect(normKey("Netflix 12345 / Abo")).toBe("netflix");
    expect(normKey("Buchladen (PayPal)")).toBe("buchladen");
  });
});

describe("Fixkosten und Monatsauswertung", () => {
  const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  const base = (): Data => {
    const d = emptyData();
    d.tx = months.flatMap((m, i) => [
      tx({ id: "miete" + i, date: m + "-01", payee: "Wohnbau", amount: -950, cat: "Wohnen" }),
      tx({ id: "rewe" + i, date: m + "-05", payee: "REWE", amount: -300, cat: "Lebensmittel" }),
    ]);
    return d;
  };

  it("erkennt monatliche Zahlungen als Fixkosten-Vorschlag", () => {
    const s = suggestFixed(base());
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: "Wohnbau", interval: 1, amount: 950 });
  });

  it("trennt fixe und variable Ausgaben", () => {
    const d = base();
    d.fixed = [{ id: "f1", key: "wohnbau|", name: "Wohnbau", amount: 950, interval: 1, due: 1, cat: "Wohnen" }];
    expect(isFix(d.tx[0], d)).toBe(true);
    const st = monthStats(d, "2026-08");
    expect([st.aus, st.fixA, st.varA]).toEqual([1250, 950, 300]);
  });
});

describe("Einkommen", () => {
  it("schätzt Elterngeld und Krankengeld", () => {
    const p = { id: "A", name: "A", netto: 2000, brutto: 3000 };
    expect(suggest(p, "Elterngeld (Basis)")).toBe(1300);
    expect(suggest(p, "Krankengeld")).toBe(1575);
  });

  it("ersetzt das Netto im Zeitraum, Szenarien nur auf Wunsch", () => {
    const d = emptyData();
    d.persons[0].netto = 2000;
    d.periods = [{ id: "q", person: "A", type: "Elterngeld (Basis)", from: "2027-01", to: "2027-12", amount: null, scen: true }];
    expect(incomeFor(d, "2027-03", false).inc).toBe(2000);
    expect(incomeFor(d, "2027-03", true).inc).toBe(1300);
  });
});

describe("Abgleich zweier Geräte", () => {
  it("führt Buchungen beider Seiten zusammen, Löschungen bleiben gelöscht", () => {
    const a = emptyData(),
      b = emptyData();
    a.tx = [tx({ id: "1", payee: "Bäcker" }), tx({ id: "2", payee: "Kino" })];
    b.tx = [tx({ id: "1", payee: "Bäcker", note: "neu", editedAt: 5 }), tx({ id: "3", payee: "Zoo" })];
    b.deleted = ["2"];
    const r = mergeBackup(a, parseBackup(JSON.stringify(toBackup(b, 0))));
    expect(r.d.tx.map((t) => t.id).sort()).toEqual(["1", "3"]);
    expect(r.d.tx.find((t) => t.id === "1")!.note).toBe("neu");
    expect(r.msg).toContain("Zusammengeführt: 2 Buchungen");
  });

  it("übernimmt die jüngeren Einstellungen", () => {
    const a = { ...emptyData(), settingsAt: 10, budgets: { Lebensmittel: 500 } };
    const b = { ...emptyData(), settingsAt: 20, budgets: { Lebensmittel: 650 } };
    expect(mergeBackup(a, b).d.budgets).toEqual({ Lebensmittel: 650 });
    expect(mergeBackup(b, a).d.budgets).toEqual({ Lebensmittel: 650 });
  });

  it("lehnt fremde Dateien ab", () => {
    expect(() => parseBackup('{"foo":1}')).toThrow("Keine Haushaltsbuch-Sicherung");
  });
});

import { parseEuro } from "../src/domain/format";
describe("Betragseingabe", () => {
  it("versteht Komma, Tausenderpunkt und Dezimalpunkt", () => {
    expect(parseEuro("12,50")).toBe(12.5);
    expect(parseEuro("1.234,50")).toBe(1234.5);
    expect(parseEuro("12.50")).toBe(12.5);
    expect(parseEuro("12.5")).toBe(12.5);
    expect(parseEuro("1.234")).toBe(1234);
    expect(parseEuro("7")).toBe(7);
    expect(parseEuro("12,50 €")).toBe(12.5);
    expect(parseEuro("abc")).toBe("");
  });
});
