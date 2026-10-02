// Tests: Buchungen Fixkosten zuordnen, "bezahlt"-Regel für seltene Fixkosten, Vorschläge.
import { beforeEach, describe, expect, it } from "vitest";
import { emptyData, mergeBackup } from "../src/domain/data";
import { setNow } from "../src/domain/dates";
import { bookedOn, fixBooked, fixEntry, fixOpenIn, fixSuggestions, isFix } from "../src/domain/ledger";
import type { Data, Fixed, Tx } from "../src/domain/types";

beforeEach(() => setNow(new Date(2026, 9, 2, 12))); // 2. Oktober 2026

const tx = (p: Partial<Tx>): Tx => ({
  id: p.id || Math.random().toString(36),
  date: "2026-10-01",
  payee: "X",
  purpose: "",
  amount: -10,
  cat: "Versicherungen",
  manual: true,
  src: "DKB",
  acct: "DKB",
  ...p,
});
const fixed = (p: Partial<Fixed>): Fixed => ({ id: "f1", name: "Kfz-Versicherung", amount: 580, interval: 12, due: 10, cat: "Versicherungen", ...p });
const data = (t: Tx[], f: Fixed[]): Data => ({ ...emptyData(), tx: t, fixed: f });

describe("Buchung einem Fixkosten-Eintrag zuordnen", () => {
  it("ohne Zuordnung zählt eine fremde Buchung nicht als Fixkosten", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -612 })], [fixed({})]);
    expect(fixEntry(d.tx[0], d)).toBeNull();
    expect(isFix(d.tx[0], d)).toBe(false);
    expect(fixOpenIn(d, "2026-10")).toBe(580);
  });

  it("ausdrückliche Zuordnung nur dieser Buchung", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -612, fixId: "f1" })], [fixed({})]);
    expect(fixEntry(d.tx[0], d)?.id).toBe("f1");
    expect(isFix(d.tx[0], d)).toBe(true);
    expect(fixOpenIn(d, "2026-10")).toBe(0);
  });

  it("ausdrücklich zugeordnete Buchung geht im Monat vor", () => {
    const d = data(
      [tx({ id: "a", payee: "Kfz-Versicherung", amount: -580 }), tx({ id: "b", payee: "Anderer", amount: -100, fixId: "f1" })],
      [fixed({ interval: 1 })],
    );
    expect(isFix(d.tx[1], d)).toBe(true);
    expect(isFix(d.tx[0], d)).toBe(false);
  });

  it("zeigt die Zuordnung auf einen gelöschten Eintrag, gilt wieder der Empfänger", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", fixId: "weg" })], [fixed({})]);
    expect(fixEntry(d.tx[0], d)).toBeNull();
  });
});

describe("Seltene Fixkosten: bezahlt bei bis zu einem Monat Abstand", () => {
  const f = fixed({ key: "huk coburg|" });
  it("Abbuchung im Vormonat gilt als bezahlt", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -580, date: "2026-09-28" })], [f]);
    expect(bookedOn(f, "2026-10", fixBooked(d))).toBe("2026-09-28");
    expect(fixOpenIn(d, "2026-10")).toBe(0);
  });
  it("zwei Monate daneben gilt nicht", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -580, date: "2026-08-28" })], [f]);
    expect(bookedOn(f, "2026-10", fixBooked(d))).toBeNull();
    expect(fixOpenIn(d, "2026-10")).toBe(580);
  });
  it("monatliche Fixkosten zählen nur im eigenen Monat", () => {
    const m = fixed({ key: "huk coburg|", interval: 1 });
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -580, date: "2026-09-28" })], [m]);
    expect(fixOpenIn(d, "2026-10")).toBe(580);
  });
});

describe("Vorschläge für offene Fixkosten", () => {
  it("schlägt eine Buchung mit bis zu 10 % Abweichung vor", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -612 }), tx({ id: "b", payee: "Zahnarzt", amount: -700 })], [fixed({})]);
    const s = fixSuggestions(d);
    expect(s.map((m) => [m.f.id, m.t.id, m.ym])).toEqual([["f1", "a", "2026-10"]]);
  });
  it("kein Vorschlag, wenn der Eintrag schon bezahlt ist oder abgelehnt wurde", () => {
    const paid = data([tx({ id: "a", payee: "HUK Coburg", amount: -612, fixId: "f1" }), tx({ id: "b", payee: "Andere", amount: -590 })], [fixed({})]);
    expect(fixSuggestions(paid)).toEqual([]);
    const no = { ...data([tx({ id: "a", payee: "HUK Coburg", amount: -612 })], [fixed({})]), fixNo: ["a>f1"] };
    expect(fixSuggestions(no)).toEqual([]);
  });
  it("noch nicht einsortierte Buchungen (Sonstiges) werden vorgeschlagen", () => {
    const d = data([tx({ id: "a", payee: "HUK Coburg", amount: -600, cat: "Sonstiges" })], [fixed({})]);
    expect(fixSuggestions(d)).toHaveLength(1);
  });
  it("Alltagskäufe werden nicht vorgeschlagen", () => {
    const d = data([tx({ id: "a", payee: "REWE", amount: -15, cat: "Lebensmittel" })], [fixed({ amount: 15, interval: 1, cat: "Abos", name: "Streaming" })]);
    expect(fixSuggestions(d)).toEqual([]);
  });
  it("abgelehnte Vorschläge bleiben nach dem Zusammenführen abgelehnt", () => {
    const a = { ...emptyData(), fixNo: ["a>f1"] },
      b = { ...emptyData(), fixNo: ["b>f2"] };
    expect(mergeBackup(a, b).d.fixNo?.sort()).toEqual(["a>f1", "b>f2"]);
  });
});
