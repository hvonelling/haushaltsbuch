// Spartöpfe: Sparbücher mit Sparrate, Sparziel und automatischer Zuordnung.

import { TRANSFER } from "../domain/constants";
import { addM, dLabel, mdiff, TODAY, TODAY_YM, ymLong } from "../domain/dates";
import { f0, N, pNum, uid } from "../domain/format";
import { potBal, potDepIn, potOf } from "../domain/ledger";
import type { Ctx } from "../app/ctx";
import { val } from "../ui/parts";

/** Sparraten des laufenden Monats, die noch nicht eingezahlt sind. */
export function potsDueRows(c: Ctx) {
  const { d, app, pots } = c;
  const ym = TODAY_YM();
  return pots
    .filter((p) => N(p.rate) > 0 && !(p.skip || []).includes(ym) && potDepIn(p, d, ym) < 0.5)
    .map((p) => {
      const rate = N(p.rate),
        nm = p.name || "Spartopf";
      const cand = d.tx.filter(
        (t) => t.date.startsWith(ym) && t.cat === TRANSFER && t.amount < 0 && !potOf(t, d) && Math.abs(-t.amount - rate) < 1,
      )[0];
      return {
        id: p.id,
        title: nm + " · " + f0(rate),
        sub: cand
          ? "Passende Überweisung vom " + dLabel(cand.date) + " an " + (cand.payee || "Sparkonto")
          : "Noch keine Überweisung aufs Sparkonto gefunden",
        confirmL: cand ? "Zuordnen" : "Als gebucht eintragen",
        confirm: () => {
          if (cand)
            app.mut((dd) => ({ ...dd, tx: dd.tx.map((x) => (x.id === cand.id ? { ...x, pot: p.id, editedAt: Date.now() } : x)) }));
          else
            app.mut((dd) => ({
              ...dd,
              tx: [
                ...dd.tx,
                {
                  id: "m" + uid() + Date.now().toString(36),
                  date: TODAY(),
                  payee: "Sparrate " + nm,
                  purpose: "",
                  amount: -rate,
                  cat: TRANSFER,
                  manual: true,
                  src: "Manuell",
                  acct: "Bar/Manuell",
                  pot: p.id,
                  editedAt: Date.now(),
                },
              ],
            }));
          app.setState({ msg: "Sparrate " + nm + " " + f0(rate) + " gebucht." });
        },
        skip: () =>
          app.mut((dd) => ({ ...dd, pots: dd.pots.map((x) => (x.id === p.id ? { ...x, skip: [...(x.skip || []), ym] } : x)) }), true),
      };
    });
}

const num = "font-variant-numeric:tabular-nums";

export function PotsScreen({ c }: { c: Ctx }) {
  const { d, s, app, pots, EXPC } = c;
  const dueRows = potsDueRows(c);
  const upd = (id: string, f: string, v: unknown) => app.upd("pots", id, f, v);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Jeder Spartopf ist ein Sparbuch. Überweisungen aufs Sparkonto sind Einzahlungen und verbrauchen Sparpotenzial. Ausgaben, die ihr einem Spartopf
        zuordnet („Bezahlt aus“), sind Entnahmen und zählen nicht zu den Monatsausgaben.
      </p>
      {dueRows.length > 0 && (
        <div style="display:flex;flex-direction:column;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent)">
          <span style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-accent-700);padding:var(--space-2) 0 var(--space-1)">
            Sparraten {ymLong(TODAY_YM())}
          </span>
          {dueRows.map((r) => (
            <div
              key={r.id}
              style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2) var(--space-3);padding:var(--space-2) 0;border-top:1px solid var(--color-divider)"
            >
              <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 220px">
                <span>{r.title}</span>
                <span style={"font-size:13px;color:var(--color-neutral-700);" + num}>{r.sub}</span>
              </div>
              <div style="display:flex;gap:var(--space-2)">
                <button class="btn btn-primary" onClick={r.confirm}>
                  {r.confirmL}
                </button>
                <button class="btn btn-ghost" onClick={r.skip}>
                  Aussetzen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pots.map((p) => {
        const b = potBal(p, d),
          goal = N(p.goal) || 0,
          rate = N(p.rate) || 0,
          rem = goal - b.bal,
          dm = potDepIn(p, d, TODAY_YM());
        let goalNote = "";
        if (goal > 0) {
          if (rem <= 0.5) goalNote = "Ziel " + f0(goal) + " erreicht";
          else if (p.goalDate) {
            const ml = Math.max(1, mdiff(TODAY_YM(), p.goalDate) + 1),
              need = rem / ml;
            goalNote =
              "Noch " +
              f0(rem) +
              " bis " +
              f0(goal) +
              " · bis " +
              ymLong(p.goalDate) +
              " " +
              f0(need) +
              " pro Monat nötig" +
              (rate ? (rate >= need - 0.5 ? " · Sparrate reicht" : " · Sparrate " + f0(rate) + " reicht nicht") : "");
          } else
            goalNote =
              "Noch " +
              f0(rem) +
              " bis " +
              f0(goal) +
              (rate ? " · mit Sparrate erreicht " + ymLong(addM(TODAY_YM(), Math.max(0, Math.ceil(rem / rate) - (dm > 0.5 ? 0 : 1)))) : "");
        }
        const editing = s.potEdit === p.id || !p.name;
        const setN = (f: string) => (e: Event) => upd(p.id, f, pNum(val(e)));
        return (
          <div key={p.id} style="display:flex;flex-direction:column;gap:var(--space-2);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-divider)">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3)">
              <span style="font-family:var(--font-heading);font-size:22px">{p.name || "Ohne Name"}</span>
              <span style={"font-family:var(--font-heading);font-size:28px;" + num}>{f0(b.bal)}</span>
            </div>
            {goal > 0 && (
              <>
                <div style="height:8px;border-radius:var(--radius-sm);background:var(--color-neutral-200);overflow:hidden">
                  <div
                    style={
                      "height:8px;width:" + Math.min(100, Math.max(0, (b.bal / goal) * 100)).toFixed(1) + "%;background:var(--color-accent-700)"
                    }
                  ></div>
                </div>
                <span style={"font-size:13px;color:var(--color-neutral-700);" + num}>{goalNote}</span>
              </>
            )}
            <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2) var(--space-3)">
              <span style={"font-size:14px;color:var(--color-neutral-700);" + num}>
                {"Eingezahlt " + f0(b.dep) + " · entnommen " + f0(b.out) + (rate ? " · Sparrate " + f0(rate) : "")}
              </span>
              <div style="display:flex;gap:var(--space-2)">
                <button
                  class="btn btn-ghost"
                  onClick={() => c.go("buchungen", null, { fPot: p.id, fMonth: "alle", fCat: "Alle", fAcct: "alle", q: "", filtersOpen: true })}
                >
                  Buchungen
                </button>
                <button class="btn btn-ghost" onClick={() => app.setState((x) => ({ potEdit: x.potEdit === p.id ? null : p.id }))}>
                  {s.potEdit === p.id ? "Fertig" : "Bearbeiten"}
                </button>
              </div>
            </div>
            {editing && (
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3);padding-top:var(--space-2)">
                <div class="field">
                  <label>Name</label>
                  <input class="input" value={p.name || ""} onInput={(e) => upd(p.id, "name", val(e))} placeholder="z. B. Urlaubskasse" />
                </div>
                <div class="field">
                  <label>Sparkonto (Empfänger oder IBAN)</label>
                  <input class="input" value={p.key || ""} onInput={(e) => upd(p.id, "key", val(e))} placeholder="z. B. DE12 … oder Tagesgeld" />
                </div>
                <div class="field">
                  <label>Anfangsbestand</label>
                  <input class="input" inputMode="decimal" value={(p.start ?? "") as string} onInput={setN("start")} placeholder="0" />
                </div>
                <div class="field">
                  <label>Stand am</label>
                  <input class="input" type="date" value={p.startDate || ""} onInput={(e) => upd(p.id, "startDate", val(e))} />
                </div>
                <div class="field">
                  <label>Sparrate pro Monat</label>
                  <input class="input" inputMode="decimal" value={(p.rate ?? "") as string} onInput={setN("rate")} placeholder="keine" />
                </div>
                <div class="field">
                  <label>Sparziel</label>
                  <input class="input" inputMode="decimal" value={(p.goal ?? "") as string} onInput={setN("goal")} placeholder="keins" />
                </div>
                <div class="field">
                  <label>Ziel bis (optional)</label>
                  <input class="input" type="month" value={p.goalDate || ""} onInput={(e) => upd(p.id, "goalDate", val(e))} />
                </div>
                <div class="field">
                  <label>Ausgaben automatisch aus Kategorie</label>
                  <select class="input" value={p.cat || ""} onChange={(e) => upd(p.id, "cat", val(e))}>
                    <option value="">keine</option>
                    {EXPC.map((x) => (
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
                      if (!confirm("Spartopf „" + (p.name || "") + "“ entfernen? Seine Buchungen zählen dann wieder zu den Monatsausgaben.")) return;
                      app.mut(
                        (dd) => ({
                          ...dd,
                          pots: dd.pots.filter((x) => x.id !== p.id),
                          tx: dd.tx.map((x) => (x.pot === p.id ? { ...x, pot: undefined } : x)),
                        }),
                        true,
                      );
                    }}
                  >
                    Spartopf entfernen
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
            // Anders als im Prototyp bleibt das Formular beim Tippen des Namens offen.
            const id = uid();
            app.mut((dd) => ({ ...dd, pots: [...(dd.pots || []), { id, name: "", cat: "" }] }), true);
            app.setState({ potEdit: id });
          }}
        >
          Spartopf anlegen
        </button>
      </div>
    </main>
  );
}
