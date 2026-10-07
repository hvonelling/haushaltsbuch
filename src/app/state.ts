// Oberflächen-Zustand (nicht gespeichert, außer "data").

import { TODAY } from "../domain/dates";
import type { Data } from "../domain/types";
import type { GitHubConfig } from "../storage/github";

export type Tab = "uebersicht" | "buchungen" | "planung" | "mehr";
export type View =
  | "cat"
  | "toepfe"
  | "kategorien"
  | "einkommen"
  | "zeitraeume"
  | "konten"
  | "fixkosten"
  | "kalender"
  | "import"
  | "bank"
  | "ibans"
  | "regeln"
  | "annahmen"
  | "hilfe"
  | "github";

export interface QuickAdd {
  date: string;
  payee: string;
  amount: string;
  cat: string;
  /** "" = automatisch nach Kategorie, "__none" = ausdrücklich Haushaltsgeld, sonst Spartopf-ID */
  pot: string;
  dir: "aus" | "ein" | "spar";
  note: string;
}

export interface UiState {
  tab: Tab;
  view: View | null;
  month: string | null;
  anCat: string;
  horizon: number;
  showScen: boolean;
  q: string;
  fCat: string;
  fMonth: string;
  fAcct: string;
  fPot: string;
  ruleAll: boolean;
  fixAsk: "on" | "off" | null;
  filtersOpen: boolean;
  limit: number;
  msg: string;
  addOpen: boolean;
  txSel: string | null;
  allCats: boolean;
  ibanDraft: string;
  qa: QuickAdd;
  data: Data;
  newCat?: string;
  renOpen?: string | null;
  renVal?: string;
  selMode?: boolean;
  selIds?: string[];
  bankSt?: { loading?: boolean; err?: string; sessions?: BankSession[] };
  bankQ?: string;
  bankHits?: { name: string; maxDays?: number }[];
  bankBusy?: boolean;
  askOpen?: boolean;
  fixLink?: string | null;
  fixLinkQ?: string;
  evAsk?: { id: string; ym: string } | null;
  evEdit?: string | null;
  potEdit?: string | null;
  potsOpen?: boolean;
  /** Block "Demnächst fällig" auf der Übersicht aufgeklappt */
  soonOpen?: boolean;
  /** Dialog "Buchung passt zu offenen Fixkosten" offen */
  fixSugOpen?: boolean;
  /** Fixkosten-Zuordnung für alle Buchungen des Empfängers (Standard: ja) */
  fixAll?: boolean;
  /** Nach dem Zusammenführen: Datei jetzt zurück in iCloud sichern. */
  syncStep?: "save" | null;
  /** GitHub-Abgleich dieses Geräts (null = nicht eingerichtet) */
  gh?: GitHubConfig | null;
  ghBusy?: boolean;
  /** Datei-Abgleich trotz GitHub einblenden */
  showFile?: boolean;
  /** Eingaben im Einrichtungsformular */
  ghDraft?: { repo: string; path: string; token: string; password: string };
}

export interface BankSession {
  id: string;
  bank: string;
  validUntil?: string;
  accounts?: { iban?: string; name?: string }[];
}

export const TABL: Record<Tab, string> = { uebersicht: "Übersicht", buchungen: "Buchungen", planung: "Planung", mehr: "Mehr" };

export const VIEWS: Record<View, [string, Tab | null]> = {
  cat: ["Kategorie", null],
  toepfe: ["Spartöpfe", "mehr"],
  kategorien: ["Kategorien & Budgets", "uebersicht"],
  einkommen: ["Einkommen", "planung"],
  zeitraeume: ["Zeiträume & Szenarien", "planung"],
  konten: ["Konten & Kredite", "planung"],
  fixkosten: ["Fixkosten", "planung"],
  kalender: ["Kalender", "planung"],
  import: ["Bankimport", "mehr"],
  bank: ["Bank-Anbindung", "mehr"],
  ibans: ["Eigene Konten", "mehr"],
  regeln: ["Kategorie-Regeln", "mehr"],
  annahmen: ["Annahmen", "mehr"],
  hilfe: ["Gemeinsam nutzen", "mehr"],
  github: ["GitHub-Abgleich", "mehr"],
};

export function initialState(data: Data): UiState {
  return {
    tab: "uebersicht",
    view: null,
    month: null,
    anCat: "Lebensmittel",
    horizon: 60,
    showScen: true,
    q: "",
    fCat: "Alle",
    fMonth: "alle",
    fAcct: "alle",
    fPot: "alle",
    ruleAll: true,
    fixAsk: null,
    filtersOpen: false,
    limit: 80,
    msg: "",
    addOpen: false,
    txSel: null,
    allCats: false,
    ibanDraft: "",
    qa: { date: TODAY(), payee: "", amount: "", cat: "", pot: "", dir: "aus", note: "" },
    data,
  };
}
