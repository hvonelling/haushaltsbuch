// Datenmodell des Haushaltsbuchs. Entspricht dem Sicherungsformat "version 3"
// des ursprünglichen Prototyps; Felder bleiben kompatibel, damit bestehende
// haushaltsbuch.json-Dateien weiter geladen und zusammengeführt werden können.
//
// Viele Zahlenfelder kommen direkt aus Eingabefeldern und können daher auch
// null oder "" sein. Die Rechenlogik wandelt sie wie der Prototyp mit Number().

export type NumLike = number | string | null | undefined;

export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  payee: string;
  purpose: string;
  amount: number;
  cat: string | null;
  manual: boolean;
  src: string; // "DKB" | "Sparkasse" | "Manuell" | "Bank"
  acct?: string;
  iban?: string;
  editedAt?: number;
  oneoff?: boolean;
  oneoffManual?: boolean;
  fixManual?: boolean;
  pot?: string; // "" = ausdrücklich kein Topf, undefined = automatisch
  note?: string;
  evId?: string;
}

export interface Rule {
  m: string; // Suchtext (klein geschrieben)
  c: string; // Kategorie
  s: number; // 1 = nur Einnahmen, -1 = nur Ausgaben, 0 = beide
  user?: boolean;
}

export interface Person {
  id: string;
  name: string;
  netto: NumLike;
  brutto: NumLike;
}

export interface Fixed {
  id: string;
  key?: string; // "<normKey>|<iban>"
  name: string;
  amount: NumLike;
  interval: NumLike;
  due: NumLike;
  cat: string;
  early?: boolean;
  external?: boolean;
  isNew?: boolean;
}

export interface Account {
  id: string;
  kind?: "kredit";
  name: string;
  iban?: string | null;
  balance?: NumLike;
  rate?: NumLike;
  monthly?: NumLike;
  target?: NumLike;
  debt?: NumLike;
  puffer?: boolean;
  giro?: boolean;
}

export interface Period {
  id: string;
  person: string; // "A" | "B" | "H"
  type: string;
  from: string; // YYYY-MM
  to: string;
  amount: NumLike;
  scen: boolean;
}

export interface Pot {
  id: string;
  name: string;
  cat: string;
  key?: string;
  start?: NumLike;
  startDate?: string;
  rate?: NumLike;
  goal?: NumLike;
  goalDate?: string;
  skip?: string[];
}

export interface CalEvent {
  id: string;
  name: string;
  amount: NumLike;
  dir: "aus" | "ein";
  date: string;
  interval: NumLike;
  cat: string;
  done?: Record<string, { tx: string } | undefined>;
}

export interface BankSettings {
  url?: string;
  token?: string;
  since?: string;
  lastSync?: number;
  lastErr?: string | null;
  askNo?: string[];
}

export interface BankAsk {
  bank: string;
  man: string;
}

export interface Data {
  persons: Person[];
  tx: Tx[];
  rules: Rule[];
  fixed: Fixed[];
  accounts: Account[];
  periods: Period[];
  snapshots: Record<string, number>;
  varOverride: NumLike;
  budgets: Record<string, NumLike>;
  ownIbans: string[];
  deleted: string[];
  oneoffLimit: NumLike;
  pots: Pot[];
  incomeMode: "fest" | "stichtag" | "gebucht";
  incomeCutoff: NumLike;
  dismissedSug: string[];
  changedAt: number;
  savedAt: number;
  settingsAt: number;
  customCats?: string[];
  hiddenCats?: string[];
  catRename?: Record<string, string>;
  budgetSugDismiss?: Record<string, number>;
  events?: CalEvent[];
  kindergeld?: NumLike;
  keepRest?: boolean;
  bank?: BankSettings;
  bankAsk?: BankAsk[];
  /** Zeitpunkt des letzten Abgleichs mit der iCloud-Datei (neu im Neubau). */
  syncedAt?: number;
}

export interface Backup {
  app: "haushaltsbuch";
  version: 3;
  exported: string;
  data: Data;
}
