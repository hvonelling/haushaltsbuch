// Schnell buchen: Ausgabe, Einnahme oder Sparen (Einzahlung in einen Spartopf).

import { CATS, TILES, TRANSFER } from "../domain/constants";
import { TODAY } from "../domain/dates";
import { f2, parseEuro, uid } from "../domain/format";
import { categorize, defRules } from "../domain/rules";
import type { Tx } from "../domain/types";
import { askName, withCat } from "../app/App";
import type { Ctx } from "../app/ctx";
import type { QuickAdd } from "../app/state";
import { Seg, Sheet, val } from "../ui/parts";

export function AddDialog({ c }: { c: Ctx }) {
  const { d, s, app, ALLC, potOpts, pots } = c;
  const qa = s.qa;
  const setQa = (k: keyof QuickAdd, v: string) => app.setState((x) => ({ qa: { ...x.qa, [k]: v } }));
  const spar = qa.dir === "spar";
  // Kategorie wechseln: Spartopf wieder automatisch nach Kategorie vorauswählen.
  const setCat = (v: string) => app.setState((x) => ({ qa: { ...x.qa, cat: v, pot: "" } }));
  // Spartopf, der mit der gewählten Kategorie verknüpft ist ("Ausgaben automatisch aus Kategorie").
  const linked = !spar && qa.cat ? pots.find((p) => p.cat && p.cat === qa.cat) : undefined;
  const potVal = spar ? qa.pot : qa.pot === "" ? (linked ? linked.id : "__none") : qa.pot;
  const autoPot = !spar && qa.pot === "" && !!linked;
  const onPot = (e: Event) => {
    let v = val(e);
    if (v === "__new") {
      const n = askName(
        "Name des neuen Spartopfs",
        pots.map((p) => p.name),
      );
      if (!n) {
        app.forceUpdate();
        return;
      }
      const ex = pots.find((p) => p.name === n);
      if (ex) v = ex.id;
      else {
        const np = { id: uid(), name: n, cat: "" };
        app.mut((dd) => ({ ...dd, pots: [...(dd.pots || []), np] }), true);
        v = np.id;
      }
    }
    setQa("pot", v);
  };
  const close = () => app.setState({ addOpen: false });
  const tiles = [...TILES.filter((x) => ALLC.includes(x)), ...(d.customCats || [])].slice(0, 12);
  const qaCats = qa.cat && !ALLC.includes(qa.cat) ? [...ALLC, qa.cat] : ALLC;
  const onCat = (e: Event) => {
    let v: string | null = val(e);
    if (v === "__new") {
      v = askName("Name der neuen Kategorie", [...CATS, ...(d.customCats || [])]);
      if (!v) {
        app.forceUpdate();
        return;
      }
    }
    setCat(v);
  };
  const add = () => {
    const amt = Math.abs(Number(parseEuro(qa.amount)) || 0);
    if (!amt) {
      app.setState({ msg: "Bitte einen Betrag eingeben." });
      return;
    }
    const sparPot = spar ? pots.find((p) => p.id === qa.pot) : undefined;
    if (spar && !sparPot) {
      app.setState({ msg: "Bitte den Spartopf wählen, in den das Geld fließt." });
      return;
    }
    const payee = qa.payee.trim() || (sparPot ? "Sparrate " + (sparPot.name || "Spartopf") : qa.cat || (qa.dir === "aus" ? "Ausgabe" : "Einnahme"));
    // Spartopf: gewählter Topf, ausdrücklich Haushaltsgeld ("") oder gar nichts (keine Verknüpfung).
    const potField = sparPot ? { pot: sparPot.id } : potVal === "__none" ? (linked ? { pot: "" } : {}) : { pot: potVal };
    const t: Tx = {
      id: "m" + uid() + Date.now().toString(36),
      date: qa.date || TODAY(),
      payee,
      purpose: "",
      amount: qa.dir === "ein" ? amt : -amt,
      cat: spar ? TRANSFER : qa.cat || null,
      manual: spar || !!qa.cat,
      src: "Manuell",
      acct: "Bar/Manuell",
      editedAt: Date.now(),
      ...potField,
      ...(qa.note && qa.note.trim() ? { note: qa.note.trim() } : {}),
    };
    if (!t.cat) t.cat = categorize(t, [...d.rules, ...defRules(d)], []);
    app.setState((x) => ({
      data: { ...withCat(x.data, t.cat), tx: [...x.data.tx, t], changedAt: Date.now() },
      addOpen: false,
      qa: { ...x.qa, payee: "", amount: "", cat: "", pot: "", note: "" },
      msg: sparPot
        ? "Gespart: " + f2(amt) + " in „" + (sparPot.name || "Spartopf") + "“"
        : "Gebucht: " + t.payee + " " + f2(t.amount) + " (" + t.cat + ")",
    }));
  };
  return (
    <Sheet label="Buchen" onClose={close} gap="var(--space-4)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)">
        <Seg
          name="qadir"
          options={[
            { label: "Ausgabe", checked: qa.dir === "aus", onChange: () => app.setState((x) => ({ qa: { ...x.qa, dir: "aus", pot: x.qa.dir === "spar" ? "" : x.qa.pot } })) },
            { label: "Einnahme", checked: qa.dir === "ein", onChange: () => app.setState((x) => ({ qa: { ...x.qa, dir: "ein", pot: x.qa.dir === "spar" ? "" : x.qa.pot } })) },
            { label: "Sparen", checked: spar, onChange: () => app.setState((x) => ({ qa: { ...x.qa, dir: "spar", pot: "" } })) },
          ]}
        />
        <button class="btn btn-ghost" onClick={close}>
          Abbrechen
        </button>
      </div>
      <input
        class="input"
        type="text"
        inputMode="decimal"
        value={qa.amount}
        onInput={(e) => setQa("amount", val(e))}
        placeholder="0,00 €"
        aria-label="Betrag"
        style="font-family:var(--font-heading);font-size:44px;min-height:72px;border:none;border-bottom:1px solid var(--color-text);border-radius:0;background:transparent;padding-left:0;font-variant-numeric:tabular-nums"
      />
      {spar ? (
        <div class="field">
          <label>In welchen Spartopf fließt das Geld?</label>
          <select class="input" value={potVal} onChange={onPot} aria-label="Spartopf" style="min-height:48px">
            <option value="">Spartopf wählen …</option>
            {potOpts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
            <option value="__new">+ Neuer Spartopf …</option>
          </select>
        </div>
      ) : (
        <>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-2)">
            {tiles.map((x) => (
              <button
                key={x}
                class={qa.cat === x ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setCat(qa.cat === x ? "" : x)}
                style="min-height:48px;white-space:normal;justify-content:flex-start;text-align:left;line-height:1.15"
              >
                {x}
              </button>
            ))}
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)">
            <select class="input" value={qa.cat} onChange={onCat} aria-label="Kategorie">
              <option value="">Andere Kategorie …</option>
              {qaCats.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
              <option value="__new">+ Neue Kategorie …</option>
            </select>
            <select class="input" value={potVal} onChange={onPot} aria-label="Bezahlt aus">
              <option value="__none">Haushaltsgeld</option>
              {potOpts.map((o) => (
                <option key={o.v} value={o.v}>
                  {(qa.dir === "ein" ? "in" : "aus") + " " + o.l}
                </option>
              ))}
            </select>
          </div>
          {autoPot && (
            <span style="font-size:13px;color:var(--color-neutral-700)">
              {"„" + qa.cat + "“ wird " + (qa.dir === "ein" ? "in den" : "aus dem") + " Spartopf „" + (linked!.name || "Spartopf") + "“ gebucht. Oben rechts auf „Haushaltsgeld“ stellen, wenn das hier nicht passt."}
            </span>
          )}
        </>
      )}
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:var(--space-3)">
        <input class="input" value={qa.payee} onInput={(e) => setQa("payee", val(e))} placeholder="Empfänger (optional)" aria-label="Empfänger" />
        <input class="input" type="date" value={qa.date} onInput={(e) => setQa("date", val(e))} aria-label="Datum" />
      </div>
      <textarea
        class="input"
        rows={2}
        value={qa.note || ""}
        onInput={(e) => setQa("note", val(e))}
        placeholder="Notiz (optional), z. B. Geburtstagsgeschenk Oma"
        aria-label="Notiz"
        style="min-height:44px;resize:vertical;font-family:inherit"
      ></textarea>
      <button class="btn btn-primary btn-block" onClick={add} style="min-height:52px;font-size:18px">
        Buchen
      </button>
    </Sheet>
  );
}
