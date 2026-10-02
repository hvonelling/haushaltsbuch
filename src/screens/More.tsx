// Mehr: Abgleich mit iCloud, Bankimport, Bank-Anbindung, eigene Konten, Regeln, Annahmen, Anleitung.

import { BANK_SINCE, ONEOFF_LIMIT } from "../domain/constants";
import { dLabel, fmtTime } from "../domain/dates";
import { cleanIban, f2 } from "../domain/format";
import { varAuto } from "../domain/ledger";
import { defRules, recat } from "../domain/rules";
import type { Data } from "../domain/types";
import { emptyData } from "../domain/data";
import type { Ctx } from "../app/ctx";
import { BANK_ENABLED } from "../app/features";
import { NavRow, Sheet, val } from "../ui/parts";
import { potsDueRows } from "./Pots";
import { DEFAULT_PATH, type GitHubConfig } from "../storage/github";

const fileInput = "position:absolute;width:1px;height:1px;opacity:0";

/** Offene Rückfragen "Bankbuchung passt zu manuellem Eintrag". */
export function openBankAsks(d: Data) {
  return (d.bankAsk || []).filter((a) => d.tx.some((t) => t.id === a.bank) && d.tx.some((t) => t.id === a.man));
}

export function MoreScreen({ c }: { c: Ctx }) {
  const { d, s, app, goView, pots, budgets } = c;
  const dirty = (d.changedAt || 0) > (d.savedAt || 0);
  const syncText = !d.tx.length && !d.savedAt ? "Noch nichts gesichert" : dirty ? "Ungesicherte Änderungen" : "Gesichert " + fmtTime(d.savedAt);
  const dueN = potsDueRows(c).length;
  const moreRows = [
    { label: "Kategorien & Budgets", value: Object.keys(budgets).length + " Budgets", go: goView.kategorien },
    { label: "Spartöpfe", value: pots.length + (pots.length === 1 ? " Spartopf" : " Spartöpfe") + (dueN ? " · " + dueN + " Sparrate offen" : ""), go: goView.toepfe },
    { label: "GitHub-Abgleich", value: s.gh ? (s.gh.lastErr ? "Fehler" : "aktiv") : "nicht eingerichtet", go: goView.github },
    { label: "Bankimport", value: "DKB · Sparkasse", go: goView.import },
    ...(BANK_ENABLED
      ? [
          {
            label: "Bank-Anbindung",
            value: d.bank && d.bank.url ? (d.bank.lastSync ? "abgerufen " + fmtTime(d.bank.lastSync) : "eingerichtet") : "nicht eingerichtet",
            go: goView.bank,
          },
        ]
      : []),
    { label: "Eigene Konten", value: (d.ownIbans || []).length + " IBANs", go: goView.ibans },
    { label: "Kategorie-Regeln", value: d.rules.length + " eigene", go: goView.regeln },
    { label: "Annahmen", value: "", go: goView.annahmen },
    { label: "Gemeinsam nutzen", value: "Anleitung", go: goView.hilfe },
  ];
  const saving = s.syncStep === "save";
  const firstFile = !d.savedAt && d.tx.length > 0;
  const gh = s.gh;
  const showFile = !gh || saving || !!s.showFile;
  const fileSection = (
    <section style="display:flex;flex-direction:column;gap:var(--space-3)">
      <span
        style={
          "font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:" +
          ((dirty && !gh) || saving ? "var(--color-accent-700)" : "var(--color-neutral-700)")
        }
      >
        {saving ? "Zusammengeführt – noch nicht zurückgesichert" : gh ? "Abgleich per Datei (iCloud)" : syncText}
      </span>
      {saving ? (
        <>
          <button class="btn btn-primary" onClick={() => app.saveFile()} style="min-height:48px">
            Schritt 2: Zurück in iCloud sichern
          </button>
          <span style="font-size:13px;color:var(--color-neutral-700)">
            Am iPhone: „In Dateien sichern“ → geteilter Ordner „Haushaltsbuch“ → Ersetzen. Am Rechner: die heruntergeladene Datei auf icloud.com in
            den Ordner hochladen und ersetzen.
          </span>
          <button class="btn btn-ghost" onClick={() => app.setState({ syncStep: null })} style="align-self:flex-start">
            Später
          </button>
        </>
      ) : (
        <>
          <label class={gh ? "btn btn-secondary" : "btn btn-primary"} style="min-height:48px;position:relative">
            Abgleichen: iCloud-Datei wählen
            <input type="file" accept=".json,application/json" onChange={(e) => app.onJsonFile(e)} style={fileInput} />
          </label>
          <span style="font-size:13px;color:var(--color-neutral-700)">
            Schritt 1 wählt haushaltsbuch.json aus dem geteilten Ordner und führt sie mit diesem Gerät zusammen. Danach erscheint Schritt 2 zum
            Zurücksichern. So gehen Buchungen der anderen Person nie verloren.
          </span>
          {firstFile && !gh && (
            <button
              class="btn btn-ghost"
              style="align-self:flex-start"
              onClick={() => {
                if (
                  confirm(
                    "Nur verwenden, wenn es in iCloud noch keine haushaltsbuch.json gibt. Sonst bitte zuerst „Abgleichen“, damit nichts überschrieben wird. Erste Sicherung jetzt anlegen?",
                  )
                )
                  app.saveFile();
              }}
            >
              Noch keine Datei in iCloud? Erste Sicherung anlegen
            </button>
          )}
        </>
      )}
    </section>
  );
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <h1 style="margin:0;font-size:38px">Mehr</h1>
      {gh && (
        <section style="display:flex;flex-direction:column;gap:var(--space-3)">
          <span
            style={
              "font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:" +
              (gh.lastErr ? "var(--color-text)" : "var(--color-neutral-700)") +
              ";font-weight:" +
              (gh.lastErr ? 600 : 400)
            }
          >
            {ghStatus(gh, !!s.ghBusy)}
          </span>
          <button class="btn btn-primary" onClick={() => app.ghSync(true)} disabled={!!s.ghBusy} style="min-height:48px">
            {s.ghBusy ? "Wird abgeglichen …" : "Jetzt mit GitHub abgleichen"}
          </button>
          <span style="font-size:13px;color:var(--color-neutral-700)">
            Gleicht automatisch ab: beim Öffnen und kurz nach jeder Änderung. Buchungen der anderen Person kommen dabei herein.
          </span>
          {!showFile && (
            <button class="btn btn-ghost" style="align-self:flex-start" onClick={() => app.setState({ showFile: true })}>
              Stattdessen per Datei abgleichen
            </button>
          )}
        </section>
      )}
      {showFile && fileSection}
      <section style="display:flex;flex-direction:column;border-top:1px solid var(--color-text)">
        {moreRows.map((r) => (
          <NavRow key={r.label} label={r.label} value={r.value} onClick={r.go} />
        ))}
      </section>
    </main>
  );
}

/** Statuszeile des GitHub-Abgleichs. */
export function ghStatus(gh: GitHubConfig, busy: boolean): string {
  if (busy) return "Wird abgeglichen …";
  if (gh.lastErr) return "Abgleich fehlgeschlagen: " + gh.lastErr;
  return gh.lastSync ? "Mit GitHub abgeglichen " + fmtTime(gh.lastSync) : "GitHub-Abgleich eingerichtet";
}

/** Einrichtung des Abgleichs über ein privates GitHub-Repo. */
export function GitHubScreen({ c }: { c: Ctx }) {
  const { s, app } = c;
  const gh = s.gh;
  const dr = s.ghDraft || { repo: gh?.repo || "", path: gh?.path || DEFAULT_PATH, token: gh?.token || "", password: gh?.password || "" };
  const setDr = (k: keyof typeof dr) => (e: Event) => app.setState({ ghDraft: { ...dr, [k]: val(e) } });
  const plain = { autoCapitalize: "off", autoCorrect: "off", spellcheck: false } as const;
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Die App speichert euren Stand verschlüsselt in einem privaten GitHub-Repo und gleicht ihn automatisch ab. GitHub sieht nur unlesbare Daten.
        Zugangsschlüssel und Passwort bleiben auf diesem Gerät und werden nie mit abgeglichen.
      </p>
      {gh && (
        <section style="display:flex;flex-direction:column;gap:var(--space-2);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-text)">
          <span style={"font-size:15px;font-weight:" + (gh.lastErr ? 600 : 400)}>{ghStatus(gh, !!s.ghBusy)}</span>
          <span style="font-size:13px;color:var(--color-neutral-700)">{gh.repo + " · " + gh.path}</span>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
            <button class="btn btn-primary" onClick={() => app.ghSync(true)} disabled={!!s.ghBusy}>
              Jetzt abgleichen
            </button>
            <button class="btn btn-ghost" onClick={() => app.ghDisconnect()}>
              Auf diesem Gerät beenden
            </button>
          </div>
        </section>
      )}
      <section style="display:flex;flex-direction:column;gap:var(--space-3)">
        <h2 style="margin:0;font-size:24px">{gh ? "Zugang ändern" : "Einrichten"}</h2>
        <div class="field">
          <label>Repo (besitzer/name)</label>
          <input class="input" value={dr.repo} onInput={setDr("repo")} placeholder="z. B. max/haushaltsbuch-daten" {...plain} />
        </div>
        <div class="field">
          <label>Datei im Repo</label>
          <input class="input" value={dr.path} onInput={setDr("path")} {...plain} />
        </div>
        <div class="field">
          <label>Zugangsschlüssel (Fine-grained Token)</label>
          <input class="input" type="password" value={dr.token} onInput={setDr("token")} placeholder="github_pat_…" autoComplete="off" {...plain} />
        </div>
        <div class="field">
          <label>Passwort der Datei</label>
          <input class="input" type="password" value={dr.password} onInput={setDr("password")} autoComplete="current-password" {...plain} />
        </div>
        <div>
          <button class="btn btn-primary" onClick={() => app.ghConnect({ ...dr, path: dr.path.trim() || DEFAULT_PATH })} disabled={!!s.ghBusy}>
            {s.ghBusy ? "Wird geprüft …" : gh ? "Speichern und abgleichen" : "Verbinden und abgleichen"}
          </button>
        </div>
        <span style="font-size:13px;color:var(--color-neutral-700)">
          Die App prüft den Zugang, bevor sie ihn speichert: Datei lesen, entschlüsseln, mit diesem Gerät zusammenführen. Fehlt die Datei im Repo, wird
          sie angelegt.
        </span>
      </section>
      <section style="display:flex;flex-direction:column;gap:var(--space-2);border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
        <h2 style="margin:0;font-size:20px">Zugangsschlüssel anlegen</h2>
        <ol style="margin:0;padding-left:var(--space-6);display:flex;flex-direction:column;gap:var(--space-1);font-size:14px;line-height:1.5">
          <li>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
          <li>Repository access: „Only select repositories“ und nur das Daten-Repo wählen.</li>
          <li>Permissions → Repository permissions → Contents: „Read and write“. Sonst nichts.</li>
          <li>Ablaufdatum setzen, z. B. ein Jahr. Danach hier einen neuen Schlüssel eintragen.</li>
        </ol>
        <span style="font-size:13px;color:var(--color-neutral-700)">
          Geht ein Gerät verloren: den Schlüssel auf github.com widerrufen. Ohne Passwort bleibt die Datei trotzdem unlesbar.
        </span>
      </section>
    </main>
  );
}

export function ImportScreen({ c }: { c: Ctx }) {
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-4)">
      <p style="margin:0">
        DKB-Umsatzliste (CSV) oder Sparkasse (CSV-CAMT). Das Format wird erkannt; vorhandene und vorgemerkte Buchungen werden übersprungen.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
        <label class="btn btn-primary" style="min-height:48px;position:relative">
          Bank-CSV wählen
          <input type="file" accept=".csv,text/csv" multiple onChange={(e) => c.app.onCsvFile(e)} style={fileInput} />
        </label>
      </div>
    </main>
  );
}

export function BankScreen({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const bk = d.bank || {},
    bst = s.bankSt || {};
  const setBank = (k: string, v: string) => app.mut((dd) => ({ ...dd, bank: { ...(dd.bank || {}), [k]: v } }), true);
  const ready = !!(bk.url && bk.token);
  const since = bk.since || BANK_SINCE;
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Holt neue Umsätze beim Öffnen automatisch über euren eigenen Abrufdienst (Server + Enable Banking). Bereits per CSV importierte Buchungen werden
        erkannt und übersprungen.
      </p>
      <section style="display:flex;flex-direction:column;gap:var(--space-3)">
        <h2 style="margin:0;font-size:24px">Abrufdienst</h2>
        <div class="field">
          <label>Adresse des Abrufdienstes</label>
          <input class="input" value={bk.url || ""} onInput={(e) => setBank("url", val(e))} placeholder="https://…" inputMode="url" />
        </div>
        <div class="field">
          <label>Zugangs-Token</label>
          <input class="input" type="password" value={bk.token || ""} onInput={(e) => setBank("token", val(e))} placeholder="wie ACCESS_TOKEN im Dienst" />
        </div>
        <div class="field" style="max-width:260px">
          <label>Buchungen übernehmen ab</label>
          <input class="input" type="date" value={since} onInput={(e) => setBank("since", val(e) || BANK_SINCE)} />
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3)">
          <button class="btn btn-primary" onClick={() => app.bankSync(true)} disabled={!ready}>
            {s.bankBusy ? "Wird abgerufen …" : "Jetzt abrufen"}
          </button>
          <span style="font-size:14px;color:var(--color-neutral-700)">
            {bk.lastSync
              ? "Zuletzt abgerufen " + fmtTime(bk.lastSync) + " · übernimmt Buchungen ab " + dLabel(since)
              : "Noch nicht abgerufen · übernimmt Buchungen ab " + dLabel(since)}
          </span>
        </div>
        {!!bk.lastErr && <p style="margin:0;font-size:14px;font-weight:600">{bk.lastErr}</p>}
      </section>
      {ready && (
        <section style="display:flex;flex-direction:column;gap:var(--space-2);border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3)">
            <h2 style="margin:0;font-size:24px">Verbundene Banken</h2>
            <button class="btn btn-ghost" onClick={() => app.bankStatus()}>
              Aktualisieren
            </button>
          </div>
          {bst.loading && <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">Wird geladen …</p>}
          {!!bst.err && <p style="margin:0;font-size:14px;font-weight:600">{bst.err}</p>}
          {!!bst.sessions && !bst.sessions.length && <p style="margin:0;font-size:14px">Noch keine Bank verbunden. Unten suchen und verbinden.</p>}
          {(bst.sessions || []).map((x) => {
            const left = x.validUntil ? Math.round((+new Date(x.validUntil) - Date.now()) / 864e5) : null;
            const warn = left != null && left < 14;
            return (
              <div
                key={x.id}
                style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
              >
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span>{x.bank}</span>
                  <span
                    style={
                      "font-size:13px;color:" +
                      (warn ? "var(--color-text)" : "var(--color-neutral-700)") +
                      ";font-weight:" +
                      (warn ? 600 : 400) +
                      ";font-variant-numeric:tabular-nums"
                    }
                  >
                    {(x.accounts || []).map((a) => (a.iban ? "…" + a.iban.slice(-4) : a.name)).join(", ") +
                      (left != null ? (left < 0 ? " · Freigabe abgelaufen" : " · Freigabe noch " + left + " Tage") : "")}
                  </span>
                </div>
                <div style="display:flex;gap:var(--space-2)">
                  <button class="btn btn-secondary" onClick={() => app.bankConnect(x.bank)}>
                    Erneuern
                  </button>
                  <button class="btn btn-ghost" onClick={() => app.bankDisconnect(x.id, x.bank)}>
                    Trennen
                  </button>
                </div>
              </div>
            );
          })}
          <div class="field" style="padding-top:var(--space-3)">
            <label>Bank suchen und verbinden</label>
            <input class="input" value={s.bankQ || ""} onInput={(e) => app.bankSearch(val(e))} placeholder="z. B. DKB oder Sparkasse" />
          </div>
          {(s.bankHits || []).map((a) => (
            <button
              key={a.name}
              onClick={() => app.bankConnect(a.name)}
              style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);min-height:48px"
            >
              <span style="display:flex;flex-direction:column;gap:2px">
                <span>{a.name}</span>
                <span style="font-size:13px;color:var(--color-neutral-700)">{a.maxDays ? "Freigabe bis " + Math.min(180, a.maxDays) + " Tage" : ""}</span>
              </span>
              <span style="color:var(--color-accent-700)">Verbinden ›</span>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}

export function IbansScreen({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const addIban = () => {
    const i = cleanIban(s.ibanDraft);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) {
      app.setState({ msg: "Das sieht nicht nach einer IBAN aus." });
      return;
    }
    app.setState({ ibanDraft: "" });
    app.mut((dd) => {
      const nd = { ...dd, ownIbans: [...new Set([...(dd.ownIbans || []), i])] };
      nd.tx = recat(nd);
      return nd;
    }, true);
  };
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-4)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">Überweisungen zwischen diesen Konten zählen als Umbuchung, nicht als Ausgabe.</p>
      <div style="display:flex;flex-direction:column">
        {(d.ownIbans || []).map((i) => (
          <div
            key={i}
            style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
          >
            <span style="font-variant-numeric:tabular-nums">{i.replace(/(.{4})/g, "$1 ").trim()}</span>
            <button
              class="btn btn-ghost"
              onClick={() =>
                app.mut((dd) => {
                  const nd = { ...dd, ownIbans: dd.ownIbans.filter((x) => x !== i) };
                  nd.tx = recat(nd);
                  return nd;
                }, true)
              }
            >
              Entfernen
            </button>
          </div>
        ))}
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:flex-end">
        <div class="field" style="flex:1">
          <label>Weitere IBAN</label>
          <input class="input" value={s.ibanDraft} onInput={(e) => app.setState({ ibanDraft: val(e) })} placeholder="DE…" />
        </div>
        <button class="btn btn-secondary" onClick={addIban}>
          Hinzufügen
        </button>
      </div>
    </main>
  );
}

export function RulesScreen({ c }: { c: Ctx }) {
  const { d, app } = c;
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-3)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Eine geänderte Kategorie wird zur Regel für diesen Empfänger. Eigene Regeln gelten vor den {defRules(d).length} eingebauten.
      </p>
      {!d.rules.length && <p style="margin:0">Noch keine eigenen Regeln.</p>}
      <div style="display:flex;flex-direction:column">
        {d.rules.map((r) => (
          <div
            key={r.m}
            style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
          >
            <span style="min-width:0">
              „{r.m}“ → {r.c}
            </span>
            <button
              class="btn btn-ghost"
              onClick={() =>
                app.mut((dd) => {
                  const nd = { ...dd, rules: dd.rules.filter((x) => x.m !== r.m) };
                  nd.tx = recat(nd);
                  return nd;
                })
              }
            >
              Löschen
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

export function AssumptionsScreen({ c }: { c: Ctx }) {
  const { d, app } = c;
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <div class="field" style="max-width:320px">
        <label>Variable Ausgaben pro Monat für die Planung (€)</label>
        <input
          class="input"
          type="number"
          inputMode="decimal"
          value={(d.varOverride ?? "") as string}
          onInput={(e) => {
            const v = val(e);
            app.mut((dd) => ({ ...dd, varOverride: v === "" ? null : +v }), true);
          }}
          placeholder={"automatisch: " + Math.round(varAuto(d))}
        />
      </div>
      <div class="field" style="max-width:320px">
        <label>Einmalig ab (€)</label>
        <input
          class="input"
          type="number"
          inputMode="decimal"
          value={(d.oneoffLimit ?? ONEOFF_LIMIT) as number}
          onInput={(e) => {
            const v = val(e);
            app.mut((dd) => {
              const nd = { ...dd, oneoffLimit: v === "" ? ONEOFF_LIMIT : +v };
              nd.tx = recat(nd);
              return nd;
            }, true);
          }}
        />
      </div>
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Buchungen ab diesem Betrag, deren Empfänger in weniger als drei Monaten vorkommt, gelten als einmalig. Leer bei den variablen Ausgaben = Schnitt
        der letzten drei vollständigen Monate, ohne Fixkosten laut Liste und ohne Umbuchungen.
      </p>
      <div style="border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
        <button
          class="btn btn-secondary"
          onClick={() => {
            if (confirm("Alle Daten auf diesem Gerät löschen? Vorher am besten abgleichen."))
              app.setState({ data: emptyData(), month: null, msg: "Alle Daten auf diesem Gerät gelöscht." });
          }}
        >
          Alle Daten auf diesem Gerät löschen
        </button>
      </div>
    </main>
  );
}

export function HelpScreen() {
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-3)">
      <h2 style="margin:0;font-size:22px">Mit GitHub (empfohlen)</h2>
      <ol style="margin:0;padding-left:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2);line-height:1.55">
        <li>Die verschlüsselte Datei liegt in eurem privaten GitHub-Repo.</li>
        <li>
          Auf jedem Gerät einmal: Mehr → <strong>GitHub-Abgleich</strong> → Repo, Zugangsschlüssel und Passwort eintragen.
        </li>
        <li>Danach gleicht die App selbst ab: beim Öffnen und kurz nach jeder Änderung.</li>
        <li>Als App: in Safari Teilen → „Zum Home-Bildschirm“.</li>
      </ol>
      <h2 style="margin:var(--space-3) 0 0;font-size:22px">Ohne GitHub, per iCloud-Datei</h2>
      <ol style="margin:0;padding-left:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2);line-height:1.55">
        <li>Einmalig in iCloud Drive einen Ordner „Haushaltsbuch“ anlegen und für die andere Person freigeben.</li>
        <li>
          Beim Öffnen und nach dem Buchen: Mehr → <strong>Abgleichen</strong> → haushaltsbuch.json aus dem Ordner wählen.
        </li>
        <li>
          Danach <strong>Zurück in iCloud sichern</strong> → „In Dateien sichern“ → Ordner → Ersetzen.
        </li>
        <li>Am Rechner: Datei auf icloud.com herunterladen, abgleichen, die neue Datei wieder hochladen und ersetzen.</li>
      </ol>
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Gelöschte Buchungen bleiben beim Zusammenführen gelöscht. Für Fixkosten, Konten, Budgets und Einkommen gilt der zuletzt geänderte Stand.
      </p>
    </main>
  );
}

/** Dialog: Bankbuchung und manueller Eintrag gehören zusammen? */
export function BankAskDialog({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const asks = openBankAsks(d);
  if (!s.askOpen || !asks.length) return null;
  const a = asks[0],
    mt = d.tx.find((t) => t.id === a.man)!,
    bt = d.tx.find((t) => t.id === a.bank)!;
  const close = () => app.setState({ askOpen: false });
  const kick = "font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700)";
  return (
    <Sheet label="Buchung abgleichen" onClose={close}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3)">
        <h3 style="margin:0;font-size:26px;min-width:0">{"Ist das deine Buchung vom " + dLabel(mt.date) + "?"}</h3>
        <button class="btn btn-ghost" onClick={close}>
          Später
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)">
        <span style={kick}>Manuell erfasst</span>
        <span style="font-variant-numeric:tabular-nums">{mt.payee + " · " + f2(mt.amount)}</span>
        <span style="font-size:13px;color:var(--color-neutral-700)">{dLabel(mt.date) + " · " + mt.cat + (mt.note ? " · " + mt.note : "")}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)">
        <span style={kick}>Von der Bank</span>
        <span style="font-variant-numeric:tabular-nums">{bt.payee + " · " + f2(bt.amount)}</span>
        <span style="font-size:13px;color:var(--color-neutral-700);overflow-wrap:anywhere">
          {dLabel(bt.date) + " · " + bt.acct + (bt.purpose ? " · " + bt.purpose.slice(0, 80) : "")}
        </span>
      </div>
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Bei „Ja“ übernimmt die Bankbuchung Kategorie, Spartopf und Notiz, der manuelle Eintrag wird entfernt.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
        <button class="btn btn-primary" onClick={() => app.bankAnswer(a, true)}>
          Ja, zusammenführen
        </button>
        <button class="btn btn-secondary" onClick={() => app.bankAnswer(a, false)}>
          Nein, beide behalten
        </button>
      </div>
      <span style="font-size:13px;color:var(--color-neutral-700)">{asks.length > 1 ? "Noch " + (asks.length - 1) + " weitere" : ""}</span>
    </Sheet>
  );
}
