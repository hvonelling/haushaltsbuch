// Schnell buchen: Ausgabe oder Einnahme mit Kategorie-Kacheln.

import { CATS, TILES } from "../domain/constants";
import { TODAY } from "../domain/dates";
import { f2, uid } from "../domain/format";
import { categorize, defRules } from "../domain/rules";
import type { Tx } from "../domain/types";
import { askName, withCat } from "../app/App";
import type { Ctx } from "../app/ctx";
import type { QuickAdd } from "../app/state";
import { Seg, Sheet, val } from "../ui/parts";

export function AddDialog({ c }: { c: Ctx }) {
  const { d, s, app, ALLC, potOpts } = c;
  const qa = s.qa;
  const setQa = (k: keyof QuickAdd, v: string) => app.setState((x) => ({ qa: { ...x.qa, [k]: v } }));
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
    setQa("cat", v);
  };
  const add = () => {
    const amt = Math.abs(
      parseFloat(
        String(qa.amount)
          .replace(/[^\d,.-]/g, "")
          .replace(/\./g, "")
          .replace(",", "."),
      ),
    );
    if (!amt) {
      app.setState({ msg: "Bitte einen Betrag eingeben." });
      return;
    }
    const payee = qa.payee.trim() || qa.cat || (qa.dir === "aus" ? "Ausgabe" : "Einnahme");
    const t: Tx = {
      id: "m" + uid() + Date.now().toString(36),
      date: qa.date || TODAY(),
      payee,
      purpose: "",
      amount: qa.dir === "aus" ? -amt : amt,
      cat: qa.cat || null,
      manual: !!qa.cat,
      src: "Manuell",
      acct: "Bar/Manuell",
      editedAt: Date.now(),
      ...(qa.pot ? { pot: qa.pot } : {}),
      ...(qa.note && qa.note.trim() ? { note: qa.note.trim() } : {}),
    };
    if (!t.cat) t.cat = categorize(t, [...d.rules, ...defRules(d)], []);
    app.setState((x) => ({
      data: { ...withCat(x.data, t.cat), tx: [...x.data.tx, t], changedAt: Date.now() },
      addOpen: false,
      qa: { ...x.qa, payee: "", amount: "", cat: "", pot: "", note: "" },
      msg: "Gebucht: " + t.payee + " " + f2(t.amount) + " (" + t.cat + ")",
    }));
  };
  return (
    <Sheet label="Buchen" onClose={close} gap="var(--space-4)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)">
        <Seg
          name="qadir"
          options={[
            { label: "Ausgabe", checked: qa.dir === "aus", onChange: () => setQa("dir", "aus") },
            { label: "Einnahme", checked: qa.dir === "ein", onChange: () => setQa("dir", "ein") },
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
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-2)">
        {tiles.map((x) => (
          <button
            key={x}
            class={qa.cat === x ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setQa("cat", qa.cat === x ? "" : x)}
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
        <select class="input" value={qa.pot} onChange={(e) => setQa("pot", val(e))} aria-label="Bezahlt aus">
          <option value="">Haushaltsgeld</option>
          {potOpts.map((o) => (
            <option key={o.v} value={o.v}>
              {(qa.dir === "ein" ? "in" : "aus") + " " + o.l}
            </option>
          ))}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:var(--space-3)">
        <input class="input" value={qa.payee} onInput={(e) => setQa("payee", val(e))} placeholder="Wofür (optional)" aria-label="Wofür" />
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
