// Fixkosten-Liste, erkannte wiederkehrende Zahlungen, Verknüpfen mit Buchungen.

import { CUTOFF_DAY, FIXCATS, INTERVALS, TRANSFER } from "../domain/constants";
import { addM, dLabel, MONTHS, TODAY_YM, ymLong } from "../domain/dates";
import { f0, f2, N, uid } from "../domain/format";
import { fixEntry, fixedIn, fixSuggestions } from "../domain/ledger";
import { normKey } from "../domain/rules";
import type { Data, Fixed as FixedT, Tx } from "../domain/types";
import { kpiOf, type Ctx } from "../app/ctx";
import { checked, numOrNull, PickRow, Sheet, SheetHead, val } from "../ui/parts";

const ibT = (i: string | undefined) => (i ? " · IBAN …" + i.slice(-4) : "");

function fixCounts(d: Data): Record<string, number> {
  const fxCount: Record<string, number> = {};
  d.tx.forEach((t) => {
    if (t.amount < 0 && t.cat !== TRANSFER) {
      const e = fixEntry(t, d);
      if (e) fxCount[e.id] = (fxCount[e.id] || 0) + 1;
    }
  });
  return fxCount;
}

export function unlinkedFixedCount(c: Ctx): number {
  const fx = fixCounts(c.d);
  return c.d.fixed.filter((f) => !f.external && !fx[f.id]).length;
}

export function FixedScreen({ c }: { c: Ctx }) {
  const { d, app, ALLC, fA, sugs } = c;
  const fxCount = fixCounts(d);
  const upd = (id: string, field: string, v: unknown) => app.upd("fixed", id, field, v);
  const kpi = kpiOf(c);
  const due12 = [...Array(12)].map((_, i) => {
    const m = addM(TODAY_YM(), i + 1),
      a = fixedIn(d, m);
    return { m, a, label: MONTHS[+m.slice(5) - 1].slice(0, 1) };
  });
  const dmax = Math.max(1, fA, ...due12.map((x) => x.a));
  const cutoff = +(d.incomeCutoff as number) || CUTOFF_DAY;
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <span style="font-size:15px;font-variant-numeric:tabular-nums">
        Ø {kpi.fixAvg} pro Monat · {f0(fA * 12)} im Jahr
      </span>
      {sugs.length > 0 && (
        <section style="display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-3) 0;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent)">
          <h2 style="margin:0;font-size:22px">Erkannte wiederkehrende Zahlungen</h2>
          <span style="font-size:13px;color:var(--color-neutral-700);padding-bottom:var(--space-1)">
            Aus euren Buchungen der letzten Monate. „Übernehmen“ fügt sie der Liste hinzu.
          </span>
          {sugs.map((x) => (
            <div
              key={x.key}
              style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2) var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
            >
              <div style="min-width:0;flex:1 1 200px;display:flex;flex-direction:column">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{x.name}</span>
                <span style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">
                  {f2(x.amount) + " · " + (x.interval === 1 ? "monatlich" : "quartalsweise") + " · " + x.cat + " · " + x.n + "× gesehen"}
                </span>
              </div>
              <div style="display:flex;gap:var(--space-1)">
                <button
                  class="btn btn-primary"
                  onClick={() =>
                    app.mut(
                      (dd) => ({
                        ...dd,
                        fixed: [
                          ...dd.fixed,
                          {
                            id: uid(),
                            key: x.key,
                            name: x.name,
                            amount: x.amount,
                            interval: x.interval,
                            due: x.due,
                            cat: FIXCATS.includes(x.cat) ? x.cat : x.cat,
                          },
                        ],
                      }),
                      true,
                    )
                  }
                >
                  Übernehmen
                </button>
                <button class="btn btn-ghost" onClick={() => app.mut((dd) => ({ ...dd, dismissedSug: [...(dd.dismissedSug || []), x.key] }), true)}>
                  Ignorieren
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {d.fixed.map((f) => {
        const n = fxCount[f.id];
        const nk = f.key ? f.key.split("|")[0] : "";
        const linkL = f.external
          ? "Wird nicht von euren Konten abgebucht – immer voll eingeplant"
          : !n
            ? f.key
              ? "Verknüpft mit „" +
                nk +
                "“, aber keine passende Ausgabe gefunden" +
                (d.tx.some((t) => t.cat === TRANSFER && normKey(t.payee || "") === nk)
                  ? " – die Buchungen sind als „Umbuchung / Sparen“ kategorisiert. Als Spartopf führen oder Eintrag entfernen"
                  : "")
              : "Noch keine Buchung verknüpft"
            : f.key
              ? "Verknüpft mit „" + nk + "“" + ibT(f.key.split("|")[1])
              : "Über den Namen verknüpft";
        const warn = !f.external && !n;
        return (
          <div
            key={f.id}
            style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-divider)"
          >
            {f.isNew && (
              <div style="grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)">
                <span class="tag tag-accent">Neu erkannt</span>
                <button class="btn btn-ghost" onClick={() => upd(f.id, "isNew", false)}>
                  Behalten
                </button>
              </div>
            )}
            <div class="field" style="grid-column:1 / -1">
              <label>Bezeichnung</label>
              <input class="input" value={f.name} onInput={(e) => upd(f.id, "name", val(e))} placeholder="z. B. Miete" />
            </div>
            <div class="field">
              <label>Betrag €</label>
              <input
                class="input"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={(f.amount ?? "") as string}
                onInput={(e) => upd(f.id, "amount", numOrNull(e))}
              />
            </div>
            <div class="field">
              <label>Intervall</label>
              <select class="input" value={String(f.interval)} onChange={(e) => upd(f.id, "interval", +val(e))}>
                {INTERVALS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            {(N(f.interval) || 1) > 1 && (
              <div class="field">
                <label>Fällig im</label>
                <select class="input" value={String(f.due)} onChange={(e) => upd(f.id, "due", +val(e))}>
                  {MONTHS.map((l, i) => (
                    <option key={i} value={i + 1}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div class="field">
              <label>Kategorie</label>
              <select class="input" value={f.cat} onChange={(e) => upd(f.id, "cat", val(e))}>
                {ALLC.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div style="grid-column:1 / -1;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2)">
              <span
                style={
                  "font-size:14px;color:" +
                  (warn ? "var(--color-text)" : "var(--color-neutral-700)") +
                  ";font-weight:" +
                  (warn ? 600 : 400) +
                  ";min-width:0;overflow-wrap:anywhere"
                }
              >
                {linkL}
              </span>
              {!f.external && (
                <button class="btn btn-secondary" onClick={() => app.setState({ fixLink: f.id, fixLinkQ: "" })}>
                  {f.key || n ? "Ändern" : "Buchung verknüpfen"}
                </button>
              )}
            </div>
            <label style="grid-column:1 / -1;display:flex;align-items:center;gap:var(--space-2);cursor:pointer;min-height:44px;font-size:15px">
              <input
                type="checkbox"
                checked={!!f.external}
                onChange={(e) => upd(f.id, "external", checked(e))}
                style="width:18px;height:18px;accent-color:var(--color-accent)"
              />
              <span>Wird nicht von unseren Konten abgebucht</span>
            </label>
            <label style="grid-column:1 / -1;display:flex;align-items:center;gap:var(--space-2);cursor:pointer;min-height:44px;font-size:15px">
              <input
                type="checkbox"
                checked={!!f.early}
                onChange={(e) => upd(f.id, "early", checked(e))}
                style="width:18px;height:18px;accent-color:var(--color-accent)"
              />
              <span>{"Abbuchung ab dem " + cutoff + ". zählt zum Folgemonat"}</span>
            </label>
            <div style="grid-column:1 / -1;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:14px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">
                {f2((N(f.amount) || 0) / (N(f.interval) || 1))} pro Monat · {(n || 0) + " Buchungen zugeordnet"}
              </span>
              <button
                class="btn btn-ghost"
                onClick={() =>
                  app.mut(
                    (dd) => ({
                      ...dd,
                      fixed: dd.fixed.filter((x) => x.id !== f.id),
                      dismissedSug: [...new Set([...(dd.dismissedSug || []), f.key || normKey(f.name || "")])],
                    }),
                    true,
                  )
                }
              >
                Entfernen
              </button>
            </div>
          </div>
        );
      })}
      <div>
        <button
          class="btn btn-primary"
          onClick={() =>
            app.mut((dd) => ({ ...dd, fixed: [...dd.fixed, { id: uid(), name: "", amount: null, interval: 1, due: 1, cat: "Wohnen" }] }), true)
          }
        >
          Fixkosten hinzufügen
        </button>
      </div>
      <section style="display:flex;flex-direction:column;gap:var(--space-2);border-top:1px solid var(--color-text);padding-top:var(--space-3)">
        <h2 style="margin:0;font-size:24px">Abfluss der nächsten 12 Monate</h2>
        <span style="font-size:13px;color:var(--color-neutral-700)">Gestrichelt: Monatsdurchschnitt. Jährliche Posten fallen im Fälligkeitsmonat voll an.</span>
        <div style="position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px;align-items:end;height:110px;border-bottom:1px solid var(--color-text)">
          <div
            style={
              "position:absolute;left:0;right:0;bottom:" +
              Math.round((100 * fA) / dmax) +
              "px;border-top:1px dashed var(--color-text);pointer-events:none"
            }
          ></div>
          {due12.map((m) => (
            <div
              key={m.m}
              style={
                "height:" +
                Math.round((100 * m.a) / dmax) +
                "px;background:" +
                (m.a > fA + 0.5 ? "var(--color-accent)" : "var(--color-accent-100)") +
                ";border:1px solid var(--color-accent);border-bottom:none"
              }
            ></div>
          ))}
        </div>
        <div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px">
          {due12.map((m) => (
            <span key={m.m} style="font-size:11px;text-align:center">
              {m.label}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

/** Dialog: eine Buchung als Vorlage für einen Fixkosten-Eintrag wählen. */
export function FixLinkDialog({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const lf = d.fixed.find((f) => f.id === s.fixLink);
  if (!lf) return null;
  const q = (s.fixLinkQ || "").trim().toLowerCase(),
    from = addM(TODAY_YM(), -6),
    seen: Record<string, number> = {},
    cands: { t: Tx; key: string; other: FixedT | undefined; dv: number }[] = [];
  [...d.tx]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((t) => {
      if (t.amount >= 0 || t.cat === TRANSFER || t.date.slice(0, 7) < from) return;
      const nk = normKey(t.payee || "");
      if (nk.length < 3) return;
      const key = nk + "|" + (t.iban || "");
      if (seen[key]) return;
      seen[key] = 1;
      if (q && !((t.payee || "") + " " + (t.purpose || "")).toLowerCase().includes(q)) return;
      const other = d.fixed.find((f) => f.id !== lf.id && f.key === key);
      cands.push({ t, key, other, dv: N(lf.amount) > 0 ? Math.abs(-t.amount - N(lf.amount)) : 0 });
    });
  cands.sort((a, b) => a.dv - b.dv);
  const pick = (cd: (typeof cands)[number]) => {
    if (cd.other && !confirm("Diese Buchung gehört schon zu „" + cd.other.name + "“. Den anderen Eintrag entfernen?")) return;
    const early = +cd.t.date.slice(8, 10) >= (+(d.incomeCutoff as number) || CUTOFF_DAY);
    app.mut(
      (dd) => ({
        ...dd,
        fixed: dd.fixed
          .filter((f) => !cd.other || f.id !== cd.other.id)
          .map((f) => (f.id === lf.id ? { ...f, key: cd.key, early: f.early ?? early } : f)),
      }),
      true,
    );
    app.setState({ fixLink: null, msg: "„" + (lf.name || "Eintrag") + "“ mit „" + (cd.t.payee || "") + "“ verknüpft." });
  };
  const close = () => app.setState({ fixLink: null });
  return (
    <Sheet label="Buchung verknüpfen" onClose={close}>
      <SheetHead title={lf.name || "Fixkosten"} closeLabel="Abbrechen" onClose={close} />
      <span style="font-size:14px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">
        {"Geplant " + (N(lf.amount) > 0 ? f2(-N(lf.amount)) : "ohne Betrag") + " · Buchungen der letzten 6 Monate, ähnlichster Betrag zuerst"}
      </span>
      <div class="field">
        <label>Suchen</label>
        <input class="input" value={s.fixLinkQ || ""} onInput={(e) => app.setState({ fixLinkQ: val(e) })} placeholder="Empfänger oder Verwendungszweck" />
      </div>
      {cands.slice(0, 20).map((cd) => (
        <PickRow
          key={cd.key}
          payee={cd.t.payee || "—"}
          amt={f2(cd.t.amount)}
          sub={dLabel(cd.t.date) + " · " + cd.t.cat + ibT(cd.t.iban) + (cd.other ? " · gehört zu „" + cd.other.name + "“" : "")}
          onClick={() => pick(cd)}
        />
      ))}
      {!cands.length && (
        <span style="font-size:14px">
          Keine passende Buchung gefunden. Wird der Betrag von einem anderen Konto abgebucht, setze „Wird nicht von unseren Konten abgebucht“.
        </span>
      )}
    </Sheet>
  );
}

/** Dialog: Passt diese Buchung zu einem offenen Fixkosten-Eintrag? */
export function FixSuggestDialog({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const list = fixSuggestions(d);
  if (!s.fixSugOpen || !list.length) return null;
  const { f, t, ym } = list[0];
  const close = () => app.setState({ fixSugOpen: false });
  const nk = normKey(t.payee || "");
  const fixAll = s.fixAll !== false;
  const kick = "font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700)";
  return (
    <Sheet label="Fixkosten zuordnen" onClose={close}>
      <SheetHead title={"Ist das „" + (f.name || "Fixkosten") + "“?"} closeLabel="Später" onClose={close} />
      <div style="display:flex;flex-direction:column;gap:2px;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)">
        <span style={kick}>Buchung</span>
        <span style="font-variant-numeric:tabular-nums">{(t.payee || "—") + " · " + f2(t.amount)}</span>
        <span style="font-size:13px;color:var(--color-neutral-700);overflow-wrap:anywhere">
          {dLabel(t.date) + " · " + t.cat + (t.acct ? " · " + t.acct : "") + (t.purpose ? " · " + t.purpose.slice(0, 80) : "")}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)">
        <span style={kick}>Offene Fixkosten</span>
        <span style="font-variant-numeric:tabular-nums">{(f.name || "Fixkosten") + " · " + f2(-N(f.amount))}</span>
        <span style="font-size:13px;color:var(--color-neutral-700)">{"fällig " + ymLong(ym) + " · noch keine Abbuchung gefunden"}</span>
      </div>
      {nk.length >= 3 && (
        <label class="radio" style="font-size:14px">
          <input
            type="checkbox"
            checked={fixAll}
            onChange={() => app.setState((x) => ({ fixAll: x.fixAll === false }))}
            style="accent-color:var(--color-accent)"
          />
          {"Künftig alle Buchungen von „" + nk + "“ so zuordnen"}
        </label>
      )}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
        <button class="btn btn-primary" onClick={() => app.assignFix(t, f.id, fixAll)}>
          Ja, zuordnen
        </button>
        <button class="btn btn-secondary" onClick={() => app.rejectFix(t.id, f.id)}>
          Nein, passt nicht
        </button>
      </div>
      <span style="font-size:13px;color:var(--color-neutral-700)">{list.length > 1 ? "Noch " + (list.length - 1) + " weitere" : ""}</span>
    </Sheet>
  );
}
