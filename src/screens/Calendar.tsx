// Kalender: seltene Fixkosten und eigene Termine der nächsten 12 Monate.

import { IVL, TRANSFER } from "../domain/constants";
import { addM, clampD, dLabel, MONTHS, TODAY, TODAY_YM, ymLong } from "../domain/dates";
import { f0, f2, N, pNum, uid } from "../domain/format";
import { evDue, fixedDue, fixEntry, ymOf } from "../domain/ledger";
import type { CalEvent } from "../domain/types";
import type { Ctx } from "../app/ctx";
import { PickRow, Sheet, SheetHead, val } from "../ui/parts";

type Occ = {
  ym: string;
  date: string | null;
  name: string;
  amt: number;
  ein: boolean;
  kind: "fix" | "ev";
  paid: boolean;
  pd?: string;
  iv?: number;
  e?: CalEvent;
  dn?: { tx: string };
};

export type OccRow = {
  dateL: string;
  name: string;
  amtL: string;
  amtCol: string;
  sub: string;
  subCol: string;
  subW: number;
  canCheck: boolean;
  canUndo: boolean;
  check: () => void;
  undo: () => void;
};

export function calendarVM(c: Ctx) {
  const { d, app } = c;
  const evs = d.events || [],
    fixDay: Record<string, string> = {},
    fixPaid: Record<string, Record<string, string>> = {};
  d.tx.forEach((t) => {
    if (t.amount >= 0 || t.cat === TRANSFER) return;
    const f = fixEntry(t, d);
    if (!f) return;
    const k = f.id || f.key || f.name,
      ym = ymOf(t, d);
    (fixPaid[k] = fixPaid[k] || {})[ym] = t.date;
    if (!fixDay[k] || t.date > fixDay[k]) fixDay[k] = t.date;
  });
  const occ: Occ[] = [];
  for (let i = -2; i < 12; i++) {
    const ym = addM(TODAY_YM(), i);
    if (i >= 0)
      d.fixed.forEach((f) => {
        if ((N(f.interval) || 1) < 2 || !fixedDue(f, ym)) return;
        const k = f.id || (f.key as string) || f.name,
          pd = (fixPaid[k] || {})[ym],
          day = fixDay[k] ? +fixDay[k].slice(8, 10) : null;
        occ.push({
          ym,
          date: pd || (day ? clampD(ym, day) : null),
          name: f.name || "Fixkosten",
          amt: N(f.amount) || 0,
          ein: false,
          kind: "fix",
          paid: !!pd,
          pd,
          iv: N(f.interval),
        });
      });
    evs.forEach((e) => {
      if (!evDue(e, ym)) return;
      const dn = (e.done || {})[ym];
      if (i < 0 && dn) return;
      occ.push({
        ym,
        date: clampD(ym, (e.date || "").slice(8, 10)),
        name: e.name || "Termin",
        amt: N(e.amount) || 0,
        ein: e.dir === "ein",
        kind: "ev",
        e,
        paid: !!dn,
        dn,
      });
    });
  }
  occ.sort((a, b) => ((a.date || a.ym + "-99") < (b.date || b.ym + "-99") ? -1 : 1));
  const lim30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const occRow = (o: Occ): OccRow => {
    const over = !o.paid && (o.date ? o.date < TODAY() : o.ym < TODAY_YM());
    let sub: string;
    if (o.kind === "fix")
      sub = o.paid ? "abgebucht am " + dLabel(o.pd as string) : "Lastschrift · Fixkosten-Liste · " + IVL[o.iv as number] + (o.amt ? "" : " · Betrag fehlt");
    else {
      const lt = o.dn && o.dn.tx ? d.tx.find((t) => t.id === o.dn!.tx) : null;
      sub = o.paid
        ? (o.ein ? "eingegangen" : "bezahlt") +
          (lt ? " · " + (lt.src === "Manuell" ? "manuell gebucht" : (lt.payee || "Buchung") + ", " + dLabel(lt.date)) : "")
        : (o.ein ? "erwartete Einnahme" : "eigener Termin") + " · " + IVL[N(o.e!.interval) || 0];
    }
    if (over) sub = "überfällig · " + sub;
    return {
      dateL: o.date ? +o.date.slice(8, 10) + "." : "—",
      name: o.name,
      amtL: (o.ein ? "+" : "−") + f0(o.amt),
      amtCol: o.ein ? "var(--color-accent-700)" : "var(--color-text)",
      sub,
      subCol: over ? "var(--color-text)" : "var(--color-neutral-700)",
      subW: over ? 600 : 400,
      canCheck: o.kind === "ev" && !o.paid,
      canUndo: o.kind === "ev" && o.paid,
      check: () => app.setState({ evAsk: { id: o.e!.id, ym: o.ym } }),
      undo: () => app.evUndo(o.e!.id, o.ym),
    };
  };
  const calMap: Record<string, Occ[]> = {};
  occ.forEach((o) => {
    (calMap[o.ym] = calMap[o.ym] || []).push(o);
  });
  const calMonths = Object.keys(calMap)
    .sort()
    .map((ym) => {
      const it = calMap[ym],
        out = it.filter((o) => !o.ein).reduce((a, o) => a + o.amt, 0),
        inn = it.filter((o) => o.ein).reduce((a, o) => a + o.amt, 0);
      return {
        ym,
        label: ymLong(ym),
        sumL: [out ? "Ausgaben " + f0(out) : "", inn ? "Einnahmen " + f0(inn) : ""].filter(Boolean).join(" · "),
        items: it.map(occRow),
      };
    });
  const soonO = occ.filter((o) => !o.paid && (o.date ? o.date <= lim30 : o.ym === TODAY_YM()));
  const soon = {
    has: soonO.length > 0,
    items: soonO.slice(0, 6).map((o) => ({
      ...occRow(o),
      dateL: o.date ? +o.date.slice(8, 10) + "." + o.date.slice(5, 7) + "." : MONTHS[+o.ym.slice(5) - 1],
    })),
  };
  const linked = new Set<string>();
  evs.forEach((e) => Object.values(e.done || {}).forEach((v) => v && v.tx && linked.add(v.tx)));
  return { calMonths, soon, linked, nOpen: occ.filter((o) => !o.paid).length };
}

function nextOcc(e: CalEvent): string | null {
  for (let i = 0; i < 36; i++) {
    const ym = addM(TODAY_YM(), i);
    if (evDue(e, ym) && !(e.done || {})[ym]) return clampD(ym, (e.date || "").slice(8, 10));
  }
  return null;
}

const num = "font-variant-numeric:tabular-nums";

export function CalendarScreen({ c }: { c: Ctx }) {
  const { d, s, app, ALLC } = c;
  const v = calendarVM(c);
  const upd = (id: string, f: string, x: unknown) => app.upd("events", id, f, x);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Viertel-, halb- und jährliche Fixkosten aus der Fixkosten-Liste und eure eigenen Termine für die nächsten 12 Monate. Offene Ausgaben sind im
        fälligen Monat wie Fixkosten eingeplant.
      </p>
      {!v.calMonths.length && (
        <p style="margin:0">
          Noch keine Termine. Unten einen eigenen Termin anlegen oder in der Fixkosten-Liste ein Intervall von 3, 6 oder 12 Monaten setzen.
        </p>
      )}
      {v.calMonths.map((m) => (
        <section key={m.ym} style="display:flex;flex-direction:column">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3);padding-bottom:var(--space-1);border-bottom:1px solid var(--color-text)">
            <h2 style="margin:0;font-size:22px">{m.label}</h2>
            <span style={"font-size:13px;color:var(--color-neutral-700);" + num + ";text-align:right"}>{m.sumL}</span>
          </div>
          {m.items.map((o, i) => (
            <div
              key={i}
              style="display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:2px var(--space-3);align-items:baseline;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
            >
              <span style={"font-size:14px;" + num + ";color:var(--color-neutral-700)"}>{o.dateL}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{o.name}</span>
              <span style={num + ";white-space:nowrap;color:" + o.amtCol}>{o.amtL}</span>
              <span></span>
              <span style={"font-size:13px;color:" + o.subCol + ";font-weight:" + o.subW}>{o.sub}</span>
              <span style="display:flex;justify-content:flex-end">
                {o.canCheck && (
                  <button class="btn btn-secondary" onClick={o.check}>
                    Abhaken
                  </button>
                )}
                {o.canUndo && (
                  <button class="btn btn-ghost" onClick={o.undo}>
                    Rückgängig
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
      ))}
      <section style="display:flex;flex-direction:column;gap:var(--space-3);border-top:1px solid var(--color-text);padding-top:var(--space-3)">
        <h2 style="margin:0;font-size:22px">Eigene Termine</h2>
        <span style="font-size:13px;color:var(--color-neutral-700)">
          Zahlungen ohne Lastschrift (z. B. Kfz-Steuer, Mitgliedsbeiträge) und erwartete Einnahmen (z. B. Steuererstattung).
        </span>
        {(d.events || []).map((e) => {
          const nx = nextOcc(e);
          const editing = s.evEdit === e.id || !e.name;
          return (
            <div key={e.id} style="display:flex;flex-direction:column;gap:var(--space-2);padding-bottom:var(--space-3);border-bottom:1px solid var(--color-divider)">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3)">
                <span style="font-size:16px">{e.name || "Neuer Termin"}</span>
                <button class="btn btn-ghost" onClick={() => app.setState((x) => ({ evEdit: x.evEdit === e.id ? null : e.id }))}>
                  {s.evEdit === e.id ? "Fertig" : "Bearbeiten"}
                </button>
              </div>
              <span style={"font-size:13px;color:var(--color-neutral-700);" + num}>
                {(e.dir === "ein" ? "+" : "−") +
                  f0(N(e.amount) || 0) +
                  " · " +
                  IVL[N(e.interval) || 0] +
                  (nx ? " · nächster Termin " + dLabel(nx) : " · kein offener Termin")}
              </span>
              {editing && (
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--space-3)">
                  <div class="field">
                    <label>Bezeichnung</label>
                    <input class="input" value={e.name || ""} onInput={(ev) => upd(e.id, "name", val(ev))} placeholder="z. B. Kfz-Steuer" />
                  </div>
                  <div class="field">
                    <label>Betrag</label>
                    <input
                      class="input"
                      inputMode="decimal"
                      value={(e.amount ?? "") as string}
                      onInput={(ev) => upd(e.id, "amount", pNum(val(ev)))}
                      placeholder="0"
                    />
                  </div>
                  <div class="field">
                    <label>Art</label>
                    <select class="input" value={e.dir || "aus"} onChange={(ev) => upd(e.id, "dir", val(ev))}>
                      <option value="aus">Ausgabe</option>
                      <option value="ein">Einnahme</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Erster Termin</label>
                    <input class="input" type="date" value={e.date || ""} onInput={(ev) => upd(e.id, "date", val(ev))} />
                  </div>
                  <div class="field">
                    <label>Wiederholung</label>
                    <select class="input" value={String(e.interval ?? 12)} onChange={(ev) => upd(e.id, "interval", +val(ev))}>
                      <option value="0">einmalig</option>
                      <option value="1">monatlich</option>
                      <option value="3">vierteljährlich</option>
                      <option value="6">halbjährlich</option>
                      <option value="12">jährlich</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Kategorie</label>
                    <select class="input" value={e.cat || ""} onChange={(ev) => upd(e.id, "cat", val(ev))}>
                      <option value="">automatisch</option>
                      {ALLC.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style="grid-column:1 / -1">
                    <button
                      class="btn btn-ghost"
                      onClick={() => {
                        if (!confirm("Termin „" + (e.name || "") + "“ entfernen?")) return;
                        app.mut((dd) => ({ ...dd, events: (dd.events || []).filter((x) => x.id !== e.id) }), true);
                      }}
                    >
                      Termin entfernen
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div>
          <button
            class="btn btn-primary"
            onClick={() => {
              const id = uid();
              app.mut(
                (dd) => ({ ...dd, events: [...(dd.events || []), { id, name: "", amount: "", dir: "aus", date: TODAY(), interval: 12, cat: "" }] }),
                true,
              );
              app.setState({ evEdit: id });
            }}
          >
            Termin anlegen
          </button>
        </div>
      </section>
    </main>
  );
}

/** Dialog: Termin abhaken (echte Buchung zuordnen oder manuelle Buchung anlegen). */
export function EventDialog({ c }: { c: Ctx }) {
  const { d, s, app } = c;
  const ea = s.evAsk,
    eE = ea && (d.events || []).find((e) => e.id === ea.id);
  if (!ea || !eE) return null;
  const { linked } = calendarVM(c);
  const ein = eE.dir === "ein",
    amt = N(eE.amount) || 0;
  const cands = d.tx
    .filter((t) => t.date.startsWith(ea.ym) && (ein ? t.amount > 0 : t.amount < 0) && t.cat !== TRANSFER && !linked.has(t.id))
    .sort((a, b) => Math.abs(Math.abs(a.amount) - amt) - Math.abs(Math.abs(b.amount) - amt))
    .slice(0, 6);
  const close = () => app.setState({ evAsk: null });
  return (
    <Sheet label="Termin abhaken" onClose={close}>
      <SheetHead title={eE.name || "Termin"} closeLabel="Abbrechen" onClose={close} />
      <span style={"font-size:14px;color:var(--color-neutral-700);" + num}>
        {(ein ? "Erwartet " : "Fällig ") + ymLong(ea.ym) + " · " + (ein ? "+" : "−") + f0(amt)}
      </span>
      <span style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700);padding-top:var(--space-2)">
        Echte Buchung zuordnen
      </span>
      {cands.map((t) => (
        <PickRow
          key={t.id}
          payee={t.payee || "—"}
          amt={f2(t.amount)}
          sub={dLabel(t.date) + " · " + t.cat + (t.acct ? " · " + t.acct : "")}
          onClick={() => app.evLink(eE, ea.ym, t.id)}
        />
      ))}
      {!cands.length && <span style="font-size:14px">{"Keine " + (ein ? "Einnahme" : "Ausgabe") + " im " + ymLong(ea.ym) + " gefunden."}</span>}
      <div style="border-top:1px solid var(--color-divider);padding-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2)">
        <button class="btn btn-primary" onClick={() => app.evCreate(eE, ea.ym, clampD(ea.ym, (eE.date || "").slice(8, 10)))}>
          Neue Buchung anlegen
        </button>
        <span style="font-size:13px;color:var(--color-neutral-700)">
          Für Bar- oder nicht importierte Zahlungen. Legt eine manuelle Buchung über {f2(ein ? amt : -amt)} an.
        </span>
      </div>
    </Sheet>
  );
}
