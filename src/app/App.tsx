// App-Hülle: hält Daten und Oberflächen-Zustand und stellt die Aktionen bereit.
// Aufbau und Verhalten entsprechen dem Claude-Design-Prototyp; die Anzeige
// ist in Bildschirm-Module unter src/screens aufgeteilt.

import { Component } from "preact";
import { BANK_SINCE, CATS, CUTOFF_DAY } from "../domain/constants";
import { decode } from "../domain/csv";
import { bankAnswer, bankMerge, importCsvTexts, mergeBackup, parseBackup, type BankResponse } from "../domain/data";
import { setNow, TODAY, TODAY_YM } from "../domain/dates";
import { f2, N } from "../domain/format";
import { uiPrefs } from "../storage/prefs";
import { uid } from "../domain/format";
import { adoptSug, fixEntry, total } from "../domain/ledger";
import { normKey, recat } from "../domain/rules";
import type { BankAsk, CalEvent, Data, Tx } from "../domain/types";
import { localStore } from "../storage/local";
import { readFiles, saveBackupFile } from "../storage/icloudFile";
import { githubConfig, sync as githubSync, type GitHubConfig } from "../storage/github";
import { initialState, type UiState } from "./state";
import { renderApp } from "./render";

/** Kategorie anlegen bzw. wieder einblenden, falls sie noch nicht existiert. */
export function withCat(d: Data, c: string | null): Data {
  if (!c) return d;
  const hid = d.hiddenCats || [];
  if (CATS.includes(c)) return hid.includes(c) ? { ...d, hiddenCats: hid.filter((x) => x !== c) } : d;
  const cc = d.customCats || [];
  return cc.includes(c) ? d : { ...d, customCats: [...cc, c] };
}

/** Namen per Eingabedialog erfragen; vorhandene Namen werden wiederverwendet. */
export function askName(label: string, list: string[]): string | null {
  const n = (prompt(label) || "").trim();
  if (!n) return null;
  return list.find((c) => c.toLowerCase() === n.toLowerCase()) || n;
}

type Patch = Partial<UiState> | ((s: UiState) => Partial<UiState>);
type ListName = "persons" | "fixed" | "accounts" | "periods" | "pots" | "events";

export class App extends Component<object, UiState> {
  private _syncing = false;
  private _bq: ReturnType<typeof setTimeout> | undefined;
  private _ghTimer: ReturnType<typeof setTimeout> | undefined;
  private _ghBusy = false;
  private _ghAgain = false;
  /** Datenstand, der gerade aus dem GitHub-Abgleich kam (löst keinen neuen Abgleich aus). */
  private _ghData: Data | null = null;

  constructor() {
    super();
    this.state = { ...initialState(localStore.load()), gh: githubConfig.load(), ...uiPrefs.load() };
  }

  set(p: Patch) {
    this.setState(p as Partial<UiState>);
  }

  componentDidMount() {
    const r = adoptSug(this.state.data);
    if (r.n) this.setState({ data: r.d, msg: r.n + " neue Fixkosten erkannt und übernommen." });
    setTimeout(() => this.bankSync(false), 300);
    setTimeout(() => this.ghSync(), 200);
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("online", this.onVisible);
  }

  componentWillUnmount() {
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("online", this.onVisible);
  }

  private onVisible = () => {
    if (document.visibilityState !== "visible") return;
    // Die App bleibt oft tagelang offen: "heute" neu bestimmen, damit ein neuer Monat ankommt.
    const before = TODAY();
    setNow(new Date());
    if (TODAY() !== before) this.setState((s) => ({ month: s.month && before.slice(0, 7) !== TODAY_YM() ? null : s.month }));
    this.ghSync();
  };

  componentDidUpdate(_: object, ps: UiState) {
    if (this.state.potsOpen !== ps.potsOpen || this.state.soonOpen !== ps.soonOpen)
      uiPrefs.save({ potsOpen: !!this.state.potsOpen, soonOpen: !!this.state.soonOpen });
    if (this.state.data !== ps.data) {
      this.persist(this.state.data);
      // Eigene Änderung: kurz danach mit GitHub abgleichen (mehrere Änderungen werden gebündelt).
      if (this.state.data !== this._ghData && this.state.gh) {
        clearTimeout(this._ghTimer);
        this._ghTimer = setTimeout(() => this.ghSync(), 4000);
      }
    }
    if (this.state.view === "bank" && ps.view !== "bank") this.bankStatus();
  }

  persist(d: Data) {
    try {
      localStore.save(d);
    } catch (e) {
      setTimeout(() => this.setState({ msg: "Speichern im Browser fehlgeschlagen: " + (e as Error).message }), 0);
    }
  }

  /** Daten ändern. settings = true markiert eine Einstellungsänderung (für das Zusammenführen). */
  mut(fn: (d: Data) => Data, settings?: boolean) {
    this.setState((s) => {
      const nd = fn(s.data);
      nd.changedAt = Date.now();
      if (settings) nd.settingsAt = Date.now();
      return { data: nd };
    });
  }

  /** Ein Feld eines Listeneintrags ändern (Fixkosten, Konten, Spartöpfe …). */
  upd(list: ListName, id: string, field: string, val: unknown) {
    this.mut((d) => {
      const arr = (d[list] || []) as unknown as { id: string }[];
      const nd = { ...d, [list]: arr.map((x) => (x.id === id ? { ...x, [field]: val } : x)) } as Data;
      if (list === "accounts" && field === "balance")
        nd.snapshots = { ...d.snapshots, [TODAY_YM()]: total(nd.accounts) };
      return nd;
    }, true);
  }

  // ------------------------------------------------------------ GitHub-Abgleich

  /** Einen Abgleich mit der verschlüsselten Datei im GitHub-Repo durchführen. */
  async ghSync(manual = false) {
    const cfg = this.state.gh;
    if (!cfg) return;
    if (this._ghBusy) {
      this._ghAgain = true;
      return;
    }
    clearTimeout(this._ghTimer);
    this._ghBusy = true;
    this.setState({ ghBusy: true });
    const start = this.state.data;
    try {
      const r = await githubSync(start, cfg);
      const again = this.state.data !== start;
      const nextCfg: GitHubConfig = { ...cfg, lastSync: Date.now(), lastErr: null };
      githubConfig.save(nextCfg);
      this.setState((s) => {
        // Während des Abgleichs Geändertes nicht verlieren: noch einmal zusammenführen.
        const d = s.data !== start ? mergeBackup(s.data, r.d).d : r.d;
        this._ghData = d;
        const news = [r.added > 0 ? r.added + " neue Buchungen vom anderen Gerät übernommen." : "", r.newFixed ? r.newFixed + " neue Fixkosten erkannt." : ""]
          .filter(Boolean)
          .join(" ");
        return {
          data: d,
          gh: s.gh ? nextCfg : s.gh,
          ghBusy: false,
          ...(news ? { msg: news } : manual ? { msg: r.pushed ? "Mit GitHub abgeglichen und gespeichert." : "Mit GitHub abgeglichen – alles aktuell." } : {}),
        };
      });
      if (again) this._ghAgain = true;
    } catch (e) {
      const err = (e as Error).message || "Abgleich fehlgeschlagen.";
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const nextCfg: GitHubConfig = { ...cfg, lastErr: offline ? "Offline – wird nachgeholt." : err };
      githubConfig.save(nextCfg);
      this.setState((s) => ({ gh: s.gh ? nextCfg : s.gh, ghBusy: false, ...(manual || !offline ? { msg: "GitHub-Abgleich: " + nextCfg.lastErr } : {}) }));
    } finally {
      this._ghBusy = false;
      if (this._ghAgain) {
        this._ghAgain = false;
        this._ghTimer = setTimeout(() => this.ghSync(), 1500);
      }
    }
  }

  /** Verbindung prüfen (Datei lesen, entschlüsseln, zusammenführen) und erst dann speichern. */
  async ghConnect(cfg: GitHubConfig) {
    if (!cfg.repo.trim() || !cfg.token.trim() || !cfg.password) {
      this.setState({ msg: "Bitte Repo, Zugangsschlüssel und Passwort eintragen." });
      return;
    }
    this.setState({ ghBusy: true });
    const start = this.state.data;
    try {
      const r = await githubSync(start, cfg);
      const saved: GitHubConfig = { ...cfg, repo: cfg.repo.trim(), token: cfg.token.trim(), lastSync: Date.now(), lastErr: null };
      githubConfig.save(saved);
      this.setState((s) => {
        const d = s.data !== start ? mergeBackup(s.data, r.d).d : r.d;
        this._ghData = d;
        return {
          data: d,
          gh: saved,
          ghDraft: undefined,
          ghBusy: false,
          syncStep: null,
          month: null,
          msg: "Verbunden. " + d.tx.length + " Buchungen abgeglichen" + (r.pushed ? " und in GitHub gespeichert." : "."),
        };
      });
    } catch (e) {
      this.setState({ ghBusy: false, msg: "Verbindung fehlgeschlagen: " + (e as Error).message });
    }
  }

  ghDisconnect() {
    if (!confirm("GitHub-Abgleich auf diesem Gerät beenden? Zugangsschlüssel und Passwort werden hier gelöscht, eure Daten bleiben erhalten.")) return;
    githubConfig.save(null);
    this.setState({ gh: null, msg: "GitHub-Abgleich auf diesem Gerät beendet." });
  }

  // ------------------------------------------------------------ Bank-Anbindung (braucht den späteren Server)

  bankCall(path: string, opts?: RequestInit): Promise<any> {
    const b = this.state.data.bank || {};
    if (!b.url || !b.token) return Promise.reject(new Error("Adresse und Token der Bank-Anbindung fehlen."));
    return fetch(b.url.trim().replace(/\/$/, "") + path, {
      ...(opts || {}),
      headers: { "X-Token": b.token.trim(), "Content-Type": "application/json" },
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Fehler " + r.status);
      return j;
    });
  }
  bankStatus() {
    this.setState({ bankSt: { loading: true } });
    this.bankCall("/status")
      .then((j) => this.setState({ bankSt: { sessions: j.sessions || [] } }))
      .catch((e) => this.setState({ bankSt: { err: e.message } }));
  }
  bankSearch(q: string) {
    this.setState({ bankQ: q });
    clearTimeout(this._bq);
    if (q.trim().length < 2) {
      this.setState({ bankHits: [] });
      return;
    }
    this._bq = setTimeout(
      () =>
        this.bankCall("/aspsps?q=" + encodeURIComponent(q.trim()))
          .then((j) => this.setState({ bankHits: j.aspsps || [] }))
          .catch((e) => this.setState({ msg: e.message })),
      350,
    );
  }
  bankConnect(name: string) {
    const back = /^https?:/.test(location.href) ? location.href : "";
    this.bankCall("/connect", { method: "POST", body: JSON.stringify({ bank: name, returnUrl: back }) })
      .then((j) => {
        if (j.url) {
          const w = window.open(j.url, "_blank");
          if (!w) location.href = j.url;
          this.setState({ msg: "Freigabe bei „" + name + "“ im neuen Fenster bestätigen, danach hier „Jetzt abrufen“." });
        }
      })
      .catch((e) => this.setState({ msg: e.message }));
  }
  bankDisconnect(id: string, bank: string) {
    if (!confirm("Verbindung zu „" + bank + "“ trennen?")) return;
    this.bankCall("/disconnect", { method: "POST", body: JSON.stringify({ id }) })
      .then(() => this.bankStatus())
      .catch((e) => this.setState({ msg: e.message }));
  }
  bankSync(force: boolean) {
    const b = this.state.data.bank;
    if (!b || !b.url || !b.token || this._syncing) return;
    this._syncing = true;
    this.setState({ bankBusy: true });
    const since = b.since || BANK_SINCE;
    let from = since;
    if (b.lastSync) {
      const f = new Date(b.lastSync - 10 * 864e5).toISOString().slice(0, 10);
      if (f > from) from = f;
    }
    this.bankCall("/transactions?from=" + from + (force ? "&force=1" : ""))
      .then((res: BankResponse) => {
        this._syncing = false;
        this.setState((s) => {
          const r = bankMerge(s.data, res);
          return { data: r.d, bankBusy: false, msg: r.msg };
        });
      })
      .catch((e) => {
        this._syncing = false;
        this.setState((s) => ({
          bankBusy: false,
          msg: "Bankabruf: " + e.message,
          data: { ...s.data, bank: { ...s.data.bank, lastErr: e.message } },
        }));
      });
  }
  bankAnswer(a: BankAsk, yes: boolean) {
    this.mut((dd) => bankAnswer(dd, a, yes));
  }

  // ------------------------------------------------------------ Fixkosten

  setFix(sx: Tx, mode: "onOnly" | "offOnly" | "onList" | "offList" | "clear") {
    this.mut((dd) => {
      let fixed = dd.fixed,
        dis = dd.dismissedSug || [];
      const key = normKey(sx.payee || "") + "|" + (sx.iban || "");
      const fm = mode === "onOnly" ? true : mode === "offOnly" ? false : undefined;
      if (mode === "onList")
        fixed = [
          ...fixed,
          {
            id: uid(),
            key,
            name: sx.payee || "",
            amount: Math.round(-sx.amount * 100) / 100,
            interval: 1,
            due: +sx.date.slice(5, 7),
            cat: sx.cat as string,
            early: +sx.date.slice(8, 10) >= (+(dd.incomeCutoff as number) || CUTOFF_DAY),
          },
        ];
      if (mode === "offList") {
        const e = fixEntry(sx, dd);
        if (e) {
          fixed = fixed.filter((x) => x.id !== e.id);
          dis = [...new Set([...dis, e.key || normKey(e.name || "")])];
        }
      }
      return {
        ...dd,
        fixed,
        dismissedSug: dis,
        tx: dd.tx.map((x) => (x.id === sx.id ? { ...x, fixManual: fm, editedAt: Date.now() } : x)),
      };
    }, mode.endsWith("List"));
    this.setState({ fixAsk: null });
  }

  /**
   * Buchung einem Fixkosten-Eintrag zuordnen.
   * target: Eintrags-ID, "" = keine Fixkosten, "__new" = neuen Eintrag aus der Buchung anlegen.
   * all: Zuordnung gilt für alle Buchungen dieses Empfängers (sonst nur für diese Buchung).
   */
  assignFix(sx: Tx, target: string, all: boolean) {
    const d = this.state.data;
    if (target === "__new") {
      this.setFix(sx, "onList");
      return;
    }
    if (target === "") {
      this.mut((dd) => {
        // Würde die Buchung über den Empfänger weiter als Fixkosten zählen, ausdrücklich ausnehmen.
        const still = fixEntry({ ...sx, fixId: undefined }, dd);
        return {
          ...dd,
          tx: dd.tx.map((x) => (x.id === sx.id ? { ...x, fixId: undefined, fixManual: still ? false : undefined, editedAt: Date.now() } : x)),
        };
      });
      return;
    }
    const f = d.fixed.find((x) => x.id === target);
    if (!f) return;
    const nk = normKey(sx.payee || "");
    const forPayee = all && nk.length >= 3;
    let removeOther: string | null = null,
      otherKey = "";
    if (forPayee) {
      const other = fixEntry({ ...sx, fixId: undefined }, d);
      if (other && other.id !== f.id) {
        if (
          !confirm(
            "Buchungen von „" + (sx.payee || "") + "“ gehören bisher zu „" + (other.name || "Fixkosten") + "“. Diesen Eintrag entfernen und alles „" + (f.name || "Fixkosten") + "“ zuordnen?",
          )
        )
          return;
        removeOther = other.id;
        otherKey = other.key || normKey(other.name || "");
      }
    }
    const actual = Math.round(-sx.amount * 100) / 100,
      planned = N(f.amount) || 0;
    let newAmount: number | null = null;
    if (!(planned > 0)) newAmount = actual;
    else if (
      Math.abs(actual - planned) > 0.005 &&
      confirm("Geplanten Betrag von „" + (f.name || "Fixkosten") + "“ von " + f2(planned) + " auf " + f2(actual) + " anpassen?")
    )
      newAmount = actual;
    const early = +sx.date.slice(8, 10) >= (+(d.incomeCutoff as number) || CUTOFF_DAY);
    this.mut(
      (dd) => ({
        ...dd,
        fixed: dd.fixed
          .filter((x) => x.id !== removeOther)
          .map((x) =>
            x.id === f.id
              ? {
                  ...x,
                  ...(forPayee ? { key: nk + "|" + (sx.iban || ""), early: x.early ?? early } : {}),
                  ...(newAmount != null ? { amount: newAmount } : {}),
                }
              : x,
          ),
        dismissedSug: removeOther ? [...new Set([...(dd.dismissedSug || []), otherKey])] : dd.dismissedSug,
        // Die Buchung selbst wird immer ausdrücklich zugeordnet.
        tx: dd.tx.map((x) => (x.id === sx.id ? { ...x, fixId: f.id, fixManual: undefined, editedAt: Date.now() } : x)),
      }),
      true,
    );
    this.setState({
      msg:
        "„" + (sx.payee || "Buchung") + "“ zählt als „" + (f.name || "Fixkosten") + "“" + (forPayee ? " – künftig alle Buchungen dieses Empfängers." : " (nur diese Buchung)."),
    });
  }

  /** Vorschlag "Buchung gehört zu Fixkosten" ablehnen und nicht wieder anbieten. */
  rejectFix(txId: string, fixedId: string) {
    this.mut((dd) => ({ ...dd, fixNo: [...new Set([...(dd.fixNo || []), txId + ">" + fixedId])] }));
  }

  // ------------------------------------------------------------ Import und Abgleich

  importTexts(texts: string[]) {
    const r = importCsvTexts(this.state.data, texts);
    this.setState({ data: r.d, month: null, msg: r.msg });
  }

  /** Schritt 1 des Abgleichs: iCloud-Datei einlesen und zusammenführen. */
  importJson(text: string) {
    try {
      const inc = parseBackup(text);
      const r = mergeBackup(this.state.data, inc);
      this.setState({
        data: r.d,
        month: null,
        syncStep: "save",
        msg: r.msg + " Jetzt „Zurück in iCloud sichern“ tippen.",
      });
    } catch (e) {
      this.setState({ msg: "Laden fehlgeschlagen: " + (e as Error).message });
    }
  }

  onCsvFile(e: Event) {
    const el = e.target as HTMLInputElement;
    const files = el.files;
    readFiles(files, decode).then((ts) => {
      el.value = "";
      if (ts.length) this.importTexts(ts);
    });
  }
  onJsonFile(e: Event) {
    const el = e.target as HTMLInputElement;
    const files = el.files;
    readFiles(files, decode).then((ts) => {
      el.value = "";
      if (ts.length) this.importJson(ts[0]);
    });
  }

  /** Schritt 2 des Abgleichs: zusammengeführten Stand als Datei sichern. */
  async saveFile() {
    const now = Date.now();
    try {
      const ok = await saveBackupFile(this.state.data, now);
      if (!ok) return;
    } catch (e) {
      this.setState({ msg: (e as Error).message });
      return;
    }
    this.setState((s) => ({
      data: { ...s.data, savedAt: now },
      syncStep: null,
      msg: "Gesichert als haushaltsbuch.json. Im Dialog den geteilten Ordner wählen und „Ersetzen“.",
    }));
  }

  // ------------------------------------------------------------ Kategorien

  addCat(ALLC: string[]) {
    const n = (this.state.newCat || "").trim();
    if (!n) return;
    if (ALLC.some((c) => c.toLowerCase() === n.toLowerCase())) {
      this.setState({ msg: "Die Kategorie „" + n + "“ gibt es schon." });
      return;
    }
    const hidden = this.state.data.hiddenCats || [];
    const back = CATS.find((c) => c.toLowerCase() === n.toLowerCase() && hidden.includes(c));
    this.setState({ newCat: "", msg: "Kategorie „" + (back || n) + "“ angelegt." });
    this.mut((dd) => {
      const nd = back
        ? { ...dd, hiddenCats: (dd.hiddenCats || []).filter((x) => x !== back) }
        : { ...dd, customCats: [...(dd.customCats || []), n] };
      nd.tx = recat(nd);
      return nd;
    }, true);
  }

  renCat(c: string, ALLC: string[], v: string | undefined) {
    const n = (v || "").trim();
    this.setState({ renOpen: null });
    if (!n || n === c) return;
    if (ALLC.some((x) => x !== c && x.toLowerCase() === n.toLowerCase())) {
      this.setState({ msg: "Die Kategorie „" + n + "“ gibt es schon." });
      return;
    }
    const sw = <T,>(o: Record<string, T>) => {
      if (!o || !(c in o)) return o;
      const r = { ...o };
      r[n] = r[c];
      delete r[c];
      return r;
    };
    this.mut((dd) => {
      const rn = { ...(dd.catRename || {}) };
      let hidden = [...(dd.hiddenCats || [])],
        custom = (dd.customCats || []).filter((x) => x !== c);
      if (CATS.includes(c)) {
        hidden = [...new Set([...hidden, c])];
        rn[c] = n;
      }
      Object.keys(rn).forEach((k) => {
        if (rn[k] === c) rn[k] = n;
      });
      if (CATS.includes(n)) {
        hidden = hidden.filter((x) => x !== n);
        delete rn[n];
        Object.keys(rn).forEach((k) => {
          if (rn[k] === n && k === n) delete rn[k];
        });
      } else custom = [...custom, n];
      const nd: Data = {
        ...dd,
        catRename: rn,
        hiddenCats: hidden,
        customCats: custom,
        budgets: sw(dd.budgets || {}),
        budgetSugDismiss: sw(dd.budgetSugDismiss || {}),
        rules: dd.rules.map((r) => (r.c === c ? { ...r, c: n } : r)),
        pots: (dd.pots || []).map((p) => (p.cat === c ? { ...p, cat: n } : p)),
        fixed: dd.fixed.map((f) => (f.cat === c ? { ...f, cat: n } : f)),
        events: (dd.events || []).map((e) => (e.cat === c ? { ...e, cat: n } : e)),
        tx: dd.tx.map((t) => (t.cat === c ? { ...t, cat: n } : t)),
        settingsAt: Date.now(),
      };
      nd.tx = recat(nd);
      return nd;
    }, true);
    this.setState((x) => ({ anCat: x.anCat === c ? n : x.anCat, msg: "Kategorie „" + c + "“ heißt jetzt „" + n + "“." }));
  }

  delCat(c: string) {
    const n = this.state.data.tx.filter((t) => t.cat === c).length;
    if (
      !confirm("Kategorie „" + c + "“ löschen?" + (n ? " " + n + " Buchungen werden neu zugeordnet (sonst „Sonstiges“)." : ""))
    )
      return;
    this.mut((dd) => {
      const budgets = { ...(dd.budgets || {}) };
      delete budgets[c];
      const nd: Data = {
        ...dd,
        customCats: (dd.customCats || []).filter((x) => x !== c),
        hiddenCats: CATS.includes(c) ? [...new Set([...(dd.hiddenCats || []), c])] : dd.hiddenCats || [],
        budgets,
        rules: dd.rules.filter((r) => r.c !== c),
        pots: (dd.pots || []).map((p) => (p.cat === c ? { ...p, cat: "" } : p)),
        fixed: dd.fixed.map((f) => (f.cat === c ? { ...f, cat: "Sonstiges" } : f)),
        tx: dd.tx.map((t) => (t.cat === c ? { ...t, manual: false, cat: null } : t)),
      };
      nd.tx = recat(nd);
      return nd;
    }, true);
    this.setState((x) => ({ anCat: x.anCat === c ? "Lebensmittel" : x.anCat, msg: "Kategorie „" + c + "“ gelöscht." }));
  }

  setTxCat(id: string, cat: string, rule: boolean) {
    const d0 = this.state.data;
    const isNew = withCat(d0, cat) !== d0;
    this.mut((dd) => {
      const sx = dd.tx.find((x) => x.id === id);
      if (!sx) return dd;
      const key = normKey(sx.payee || "");
      let rules = dd.rules;
      if (rule && key.length >= 3 && sx.src !== "Manuell")
        rules = [{ m: key, c: cat, s: 0, user: true }, ...dd.rules.filter((r) => r.m !== key)];
      const nd: Data = {
        ...withCat(dd, cat),
        rules,
        tx: dd.tx.map((x) => (x.id === id ? { ...x, cat, manual: true, editedAt: Date.now() } : x)),
      };
      nd.tx = recat(nd);
      return nd;
    }, isNew);
    if (isNew) this.setState({ msg: "Kategorie „" + cat + "“ angelegt." });
  }

  // ------------------------------------------------------------ Termine

  evLink(e: CalEvent, ym: string, txId: string) {
    const ein = e.dir === "ein";
    this.mut(
      (dd) => ({
        ...dd,
        events: (dd.events || []).map((x) => (x.id === e.id ? { ...x, done: { ...(x.done || {}), [ym]: { tx: txId } } } : x)),
        tx: dd.tx.map((t) =>
          t.id === txId ? { ...t, evId: e.id, fixManual: ein ? t.fixManual : true, editedAt: Date.now() } : t,
        ),
      }),
      true,
    );
    this.setState({ evAsk: null, msg: "„" + (e.name || "Termin") + "“ abgehakt." });
  }

  evCreate(e: CalEvent, ym: string, date: string) {
    const ein = e.dir === "ein",
      amt = +(e.amount as number) || 0,
      cat = e.cat || (ein ? "Sonstige Einnahmen" : "Sonstiges"),
      t: Tx = {
        id: "m" + uid() + Date.now().toString(36),
        date,
        payee: e.name || "Termin",
        purpose: "",
        amount: ein ? amt : -amt,
        cat,
        manual: true,
        src: "Manuell",
        acct: "Bar/Manuell",
        evId: e.id,
        editedAt: Date.now(),
      };
    if (!ein) t.fixManual = true;
    this.mut(
      (dd) => ({
        ...withCat(dd, cat),
        tx: [...dd.tx, t],
        events: (dd.events || []).map((x) => (x.id === e.id ? { ...x, done: { ...(x.done || {}), [ym]: { tx: t.id } } } : x)),
      }),
      true,
    );
    this.setState({ evAsk: null, msg: "„" + t.payee + "“ gebucht und abgehakt." });
  }

  evUndo(id: string, ym: string) {
    this.mut((dd) => {
      const e = (dd.events || []).find((x) => x.id === id);
      if (!e) return dd;
      const dn = (e.done || {})[ym],
        tid = dn && dn.tx,
        lt = tid ? dd.tx.find((t) => t.id === tid) : undefined,
        drop = !!(lt && lt.src === "Manuell" && lt.evId === id);
      const done = { ...(e.done || {}) };
      delete done[ym];
      return {
        ...dd,
        events: (dd.events || []).map((x) => (x.id === id ? { ...x, done } : x)),
        tx: drop
          ? dd.tx.filter((t) => t.id !== tid)
          : dd.tx.map((t) => (t.id === tid ? { ...t, evId: undefined, fixManual: undefined, editedAt: Date.now() } : t)),
        deleted: drop ? [...(dd.deleted || []), tid as string] : dd.deleted,
      };
    }, true);
  }

  // ------------------------------------------------------------ Spartöpfe

  setTxPot(id: string, v: string) {
    const pots = this.state.data.pots || [];
    let pid = v,
      np: { id: string; name: string; cat: string } | null = null;
    if (v === "__new") {
      const n = askName(
        "Name des neuen Spartopfs",
        pots.map((p) => p.name),
      );
      if (!n) {
        this.forceUpdate();
        return;
      }
      const ex = pots.find((p) => p.name === n);
      if (ex) pid = ex.id;
      else {
        np = { id: uid(), name: n, cat: "" };
        pid = np.id;
      }
    }
    this.mut(
      (dd) => ({
        ...dd,
        pots: np ? [...(dd.pots || []), np] : dd.pots,
        tx: dd.tx.map((x) => (x.id === id ? { ...x, pot: pid, editedAt: Date.now() } : x)),
      }),
      !!np,
    );
  }

  render() {
    return renderApp(this);
  }
}
