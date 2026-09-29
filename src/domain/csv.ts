// Einlesen von Bank-CSV-Dateien: DKB-Umsatzliste und Sparkasse CSV-CAMT.

import { dayDiff } from "./dates";
import { cleanIban, parseAmt } from "./format";
import { normKey } from "./rules";
import type { Tx } from "./types";

export interface ParsedBank {
  tx: Tx[];
  balance: number | null;
  own: string | null;
  bank: "DKB" | "Sparkasse";
}

function splitRow(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"]|"")*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1].replace(/""/g, '"'));
  return out;
}

function parseDKB(lines: string[]): ParsedBank {
  const h = lines.findIndex((l) => l.startsWith('"Buchungsdatum"'));
  if (h < 0) throw new Error("Format nicht erkannt. Unterstützt: DKB-CSV und Sparkasse CSV-CAMT.");
  let balance: number | null = null,
    own: string | null = null;
  for (let i = 0; i < h; i++) {
    const r = splitRow(lines[i]);
    if (r[0] && r[0].startsWith("Kontostand") && r[1]) balance = parseAmt(r[1]);
    if (!own && r[1] && /^DE\d{20}$/.test(cleanIban(r[1]))) own = cleanIban(r[1]);
  }
  const seen: Record<string, number> = {},
    tx: Tx[] = [];
  const clean = (s: string) => (s || "").split(/\s{2,}/)[0].trim();
  for (let i = h + 1; i < lines.length; i++) {
    const f = splitRow(lines[i]);
    if (f.length < 9) continue;
    if (f[2] && !/gebucht/i.test(f[2])) continue;
    const dm = f[0].match(/(\d\d)\.(\d\d)\.(\d\d)/);
    if (!dm) continue;
    const date = "20" + dm[3] + "-" + dm[2] + "-" + dm[1];
    const amount = parseAmt(f[8]);
    let payee = clean(amount < 0 ? f[4] : f[3]);
    const purpose = (f[5] || "").replace(/\s+/g, " ").trim();
    const pp = purpose.match(/Ihr Einkauf bei (.+)$/i);
    if (pp && /paypal/i.test(payee)) payee = pp[1].trim() + " (PayPal)";
    const key = [date, amount, payee, purpose, f[11] || ""].join("|");
    seen[key] = (seen[key] || 0) + 1;
    tx.push({
      id: key + "#" + seen[key],
      date,
      payee,
      purpose,
      amount,
      cat: null,
      manual: false,
      src: "DKB",
      acct: "DKB",
      iban: cleanIban(f[7]),
    });
  }
  return { tx, balance, own, bank: "DKB" };
}

function parseSPK(lines: string[]): ParsedBank {
  const seen: Record<string, number> = {},
    tx: Tx[] = [];
  let own: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const f = splitRow(lines[i]);
    if (f.length < 15) continue;
    if (f[16] && /vorgemerkt/i.test(f[16])) continue;
    const dm = f[1].match(/(\d\d)\.(\d\d)\.(\d\d)/);
    if (!dm) continue;
    own = own || cleanIban(f[0]);
    const date = "20" + dm[3] + "-" + dm[2] + "-" + dm[1];
    const amount = parseAmt(f[14]);
    const purpose = (f[4] || "").replace(/\s+/g, " ").trim();
    let payee = (f[11] || "").split("//")[0].replace(/\s+/g, " ").trim();
    const kl = purpose.match(/Purchase at (.+)$/i);
    if (kl && /klarna/i.test(payee)) payee = kl[1].trim() + " (Klarna)";
    const pp = purpose.match(/Ihr Einkauf bei (.+?)(,|$)/i);
    if (pp && /paypal/i.test(payee)) payee = pp[1].trim() + " (PayPal)";
    if (!payee) payee = f[3] || "—";
    const key = ["S", date, amount, payee, purpose, f[7] || ""].join("|");
    seen[key] = (seen[key] || 0) + 1;
    tx.push({
      id: key + "#" + seen[key],
      date,
      payee,
      purpose,
      amount,
      cat: null,
      manual: false,
      src: "Sparkasse",
      acct: "Sparkasse",
      iban: cleanIban(f[12]),
    });
  }
  return { tx, balance: null, own, bank: "Sparkasse" };
}

/** Format erkennen und CSV-Text einlesen. */
export function parseBank(text: string): ParsedBank {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (/^"?Auftragskonto/.test(lines[0])) return parseSPK(lines);
  return parseDKB(lines);
}

/** Dieselbe Buchung aus zwei Quellen (CSV und Bankabruf)? */
export function sameTx(
  t: Pick<Tx, "amount" | "date" | "iban" | "payee">,
  x: { amount: number; date: string; iban?: string; payee?: string },
): boolean {
  return (
    Math.abs(t.amount - x.amount) < 0.005 &&
    dayDiff(t.date, x.date) <= 2 &&
    (t.iban && x.iban ? t.iban === x.iban : normKey(t.payee || "") === normKey(x.payee || ""))
  );
}

/** Datei-Inhalt lesen: UTF-8, bei Fehlern Windows-1252 (ältere Sparkassen-Exporte). */
export function decode(buf: ArrayBuffer): string {
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
