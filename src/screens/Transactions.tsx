// Buchungen: Suche, Filter, Mehrfachauswahl und Detail-Dialog einer Buchung.

import { CATS, INCATS, TRANSFER } from "../domain/constants";
import { dLabel, ymLabel, TODAY_YM } from "../domain/dates";
import { f2, N, uid } from "../domain/format";
import { fixEntry, isFix, potOf } from "../domain/ledger";
import { normKey, recat } from "../domain/rules";
import type { Data, Tx } from "../domain/types";
import { askName, withCat } from "../app/App";
import type { Ctx } from "../app/ctx";
import { Sheet, SheetHead, val } from "../ui/parts";

export function transactionsVM(c: Ctx) {
  const { d, s, app, ALLC, budgets, pots, potName, months } = c;
  const monthOpts = [...months].reverse().map((m) => ({ v: m, l: ymLabel(m) }));
  if (!monthOpts.length) monthOpts.push({ v: TODAY_YM(), l: ymLabel(TODAY_YM()) });
  const qv = s.q.trim().toLowerCase();
  const isNoBud = (t: Tx) =>
    t.cat !== TRANSFER &&
    !potOf(t, d) &&
    (t.oneoff && !(N(budgets[t.cat as string]) > 0)
      ? t.amount < 0
      : !INCATS.includes(t.cat as string) && !isFix(t, d) && !(N(budgets[t.cat as string]) > 0));
  const fl = d.tx
    .filter(
      (t) =>
        (s.fMonth === "alle" || t.date.startsWith(s.fMonth)) &&
        (s.fCat === "Alle" || (s.fCat === "__nobud" ? isNoBud(t) : t.cat === s.fCat)) &&
        (s.fAcct === "alle" || t.acct === s.fAcct) &&
        (s.fPot === "alle" || (s.fPot === "keiner" ? !potOf(t, d) : potOf(t, d) === s.fPot)) &&
        (!qv || (t.payee + " " + t.purpose + " " + (t.note || "")).toLowerCase().includes(qv)),
    )
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  const bPot = s.fPot !== "alle" && s.fPot !== "keiner" ? s.fPot : null,
    bIds = bPot ? fl.filter((t) => potOf(t, d) === bPot).map((t) => t.id) : [];
  const bulk = {
    show: bIds.length > 0 && !s.selMode,
    text: bIds.length + " gefilterte Buchungen in „" + potName(bPot) + "“. Mit Suche, Monat oder Kategorie eingrenzen.",
    label: "Alle " + bIds.length + " aus dem Topf nehmen",
    run: () => {
      if (
        !confirm(bIds.length + " Buchungen aus „" + potName(bPot) + "“ nehmen? Sie zählen dann wieder zu Einnahmen, Ausgaben bzw. Umbuchungen.")
      )
        return;
      const ids = new Set(bIds);
      app.mut((dd) => ({ ...dd, tx: dd.tx.map((x) => (ids.has(x.id) ? { ...x, pot: "", editedAt: Date.now() } : x)) }));
      app.setState({ msg: bIds.length + " Buchungen aus „" + potName(bPot) + "“ genommen." });
    },
  };

  const selSet = new Set(s.selIds || []);
  type Item = {
    id: string;
    payee: string;
    sub: string;
    amtL: string;
    color: string;
    open: () => void;
    hasNote: boolean;
    note: string;
    mark: string;
    bg: string;
  };
  const txGroups: { date: string; label: string; s: number; sum: string; items: Item[] }[] = [];
  fl.slice(0, s.limit).forEach((t) => {
    let g = txGroups[txGroups.length - 1];
    if (!g || g.date !== t.date) {
      g = { date: t.date, label: dLabel(t.date), s: 0, sum: "", items: [] };
      txGroups.push(g);
    }
    const tp = potOf(t, d);
    g.s += t.amount;
    g.items.push({
      id: t.id,
      payee: t.payee || "—",
      sub:
        t.cat +
        (isFix(t, d) ? " · fix" : "") +
        (tp ? ((t.cat === TRANSFER ? t.amount < 0 : t.amount > 0) ? " · in " : " · aus ") + potName(tp) : "") +
        (t.oneoff ? " · einmalig" : "") +
        (t.acct ? " · " + t.acct : ""),
      amtL: f2(t.amount),
      color: t.amount > 0 ? "var(--color-accent-700)" : "var(--color-text)",
      open: () => {
        if (s.selMode)
          app.setState((x) => {
            const a = x.selIds || [];
            return { selIds: a.includes(t.id) ? a.filter((i) => i !== t.id) : [...a, t.id] };
          });
        else app.setState({ txSel: t.id, fixAsk: null });
      },
      hasNote: !!(t.note && t.note.trim()),
      note: t.note || "",
      mark: selSet.has(t.id) ? "✓" : "",
      bg: selSet.has(t.id) ? "var(--color-accent-100)" : "transparent",
    });
  });
  txGroups.forEach((g) => (g.sum = f2(g.s)));

  const selIds = (s.selIds || []).filter((i) => d.tx.some((t) => t.id === i)),
    nSel = selIds.length,
    allSel = fl.length > 0 && fl.every((t) => selSet.has(t.id));
  const applyPot = (pid: string, lbl: string) => {
    const ids = new Set(selIds);
    app.mut((dd) => ({ ...dd, tx: dd.tx.map((x) => (ids.has(x.id) ? { ...x, pot: pid, editedAt: Date.now() } : x)) }));
    app.setState({ selIds: [], msg: nSel + (nSel === 1 ? " Buchung " : " Buchungen ") + lbl });
  };
  const sel = {
    on: !!s.selMode,
    modeL: s.selMode ? "Fertig" : "Auswählen",
    none: nSel === 0,
    countL: nSel + " ausgewählt",
    allL: allSel ? "Keine" : "Alle " + fl.length,
    toggleMode: () => app.setState((x) => ({ selMode: !x.selMode, selIds: [] })),
    all: () => app.setState({ selIds: allSel ? [] : fl.map((t) => t.id) }),
    movePot: (e: Event) => {
      const v = val(e);
      if (!v || !nSel) return;
      if (v === "__none") {
        applyPot("", "dem Haushaltsgeld zugeordnet (kein Topf).");
        return;
      }
      if (v === "__new") {
        const n = askName(
          "Name des neuen Topfs",
          pots.map((p) => p.name),
        );
        if (!n) {
          app.forceUpdate();
          return;
        }
        const ex = pots.find((p) => p.name === n);
        if (ex) {
          applyPot(ex.id, "in „" + n + "“ verschoben.");
          return;
        }
        const np = { id: uid(), name: n, cat: "" },
          ids = new Set(selIds);
        app.mut(
          (dd) => ({
            ...dd,
            pots: [...(dd.pots || []), np],
            tx: dd.tx.map((x) => (ids.has(x.id) ? { ...x, pot: np.id, editedAt: Date.now() } : x)),
          }),
          true,
        );
        app.setState({ selIds: [], msg: nSel + (nSel === 1 ? " Buchung" : " Buchungen") + " in neuen Topf „" + n + "“ verschoben." });
        return;
      }
      applyPot(v, "in „" + potName(v) + "“ verschoben.");
    },
    catOpts: ALLC.map((x) => ({ v: x, l: x })),
    moveCat: (e: Event) => {
      let cat: string | null = val(e);
      if (!cat || !nSel) return;
      if (cat === "__new") {
        cat = askName("Name der neuen Kategorie", [...CATS, ...(d.customCats || [])]);
        if (!cat) {
          app.forceUpdate();
          return;
        }
      }
      const cc = cat;
      const ids = new Set(selIds),
        isNew = withCat(d, cc) !== d,
        now = Date.now();
      app.mut((dd) => {
        const nd: Data = { ...withCat(dd, cc), tx: dd.tx.map((x) => (ids.has(x.id) ? { ...x, cat: cc, manual: true, editedAt: now } : x)) };
        nd.tx = recat(nd);
        return nd;
      }, isNew);
      app.setState({ selIds: [], msg: nSel + (nSel === 1 ? " Buchung" : " Buchungen") + " „" + cc + "“ zugeordnet." });
    },
  };

  const nFilters = +(s.fMonth !== "alle") + +(s.fCat !== "Alle") + +(s.fAcct !== "alle") + +(s.fPot !== "alle");
  const fsum = fl.reduce((a, t) => a + t.amount, 0);
  const acctOpts = [...new Set(d.tx.map((t) => t.acct).filter(Boolean))] as string[];
  return {
    monthOpts,
    acctOpts,
    txGroups,
    bulk,
    sel,
    filterLabel: nFilters ? "Filter (" + nFilters + ")" : "Filter",
    filterCls: nFilters ? "btn btn-primary" : "btn btn-secondary",
    txInfo: fl.length + " Buchungen · " + f2(fsum),
    hasMore: fl.length > s.limit,
    noBudHint: s.fCat === "__nobud",
  };
}

export function Transactions({ c }: { c: Ctx }) {
  const v = transactionsVM(c);
  const { s, app, ALLC, potOpts } = c;
  const setF = (k: "fMonth" | "fCat" | "fAcct" | "fPot") => (e: Event) => app.setState({ [k]: val(e), limit: 80 } as never);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-4)">
      <h1 style="margin:0;font-size:38px">Buchungen</h1>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <input
          class="input"
          type="search"
          value={s.q}
          onInput={(e) => app.setState({ q: val(e), limit: 80 })}
          placeholder="Suchen"
          style="flex:1;min-height:44px"
        />
        <button class={v.filterCls} onClick={() => app.setState((x) => ({ filtersOpen: !x.filtersOpen }))} style="min-height:44px">
          {v.filterLabel}
        </button>
      </div>
      {s.filtersOpen && (
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3)">
          <div class="field">
            <label>Monat</label>
            <select class="input" value={s.fMonth} onChange={setF("fMonth")}>
              <option value="alle">Alle Monate</option>
              {v.monthOpts.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>Kategorie</label>
            <select class="input" value={s.fCat} onChange={setF("fCat")}>
              <option value="Alle">Alle Kategorien</option>
              <option value="__nobud">Ausgaben ohne Budget</option>
              {ALLC.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>Konto</label>
            <select class="input" value={s.fAcct} onChange={setF("fAcct")}>
              <option value="alle">Alle Konten</option>
              {v.acctOpts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>Topf</label>
            <select class="input" value={s.fPot} onChange={setF("fPot")}>
              <option value="alle">Alle</option>
              <option value="keiner">Haushaltsgeld</option>
              {potOpts.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3)">
        <span style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">{v.txInfo}</span>
        <button class="btn btn-ghost" onClick={v.sel.toggleMode}>
          {v.sel.modeL}
        </button>
      </div>
      {v.sel.on && (
        <div style="position:sticky;top:0;z-index:2;background:var(--color-bg);display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2) var(--space-3);padding:var(--space-2) 0;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent)">
          <span style="font-size:14px;flex:1 1 140px;font-variant-numeric:tabular-nums">{v.sel.countL}</span>
          <button class="btn btn-ghost" onClick={v.sel.all}>
            {v.sel.allL}
          </button>
          <select class="input" value="" onChange={v.sel.moveCat} disabled={v.sel.none} aria-label="Kategorie zuordnen" style="width:auto;min-height:40px">
            <option value="">Kategorie …</option>
            {v.sel.catOpts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
            <option value="__new">Neue Kategorie …</option>
          </select>
          <select class="input" value="" onChange={v.sel.movePot} disabled={v.sel.none} aria-label="Topf zuordnen" style="width:auto;min-height:40px">
            <option value="">Topf …</option>
            <option value="__none">Kein Topf (Haushaltsgeld)</option>
            {potOpts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
            <option value="__new">Neuer Topf …</option>
          </select>
        </div>
      )}
      {v.noBudHint && (
        <p style="margin:0;font-size:13px;color:var(--color-neutral-700)">
          Hier erscheinen Ausgaben in Kategorien ohne Budget. Eine Buchung verschwindet, sobald sie einer Kategorie mit Budget, einem Topf oder den
          Fixkosten zugeordnet ist.
        </p>
      )}
      {v.bulk.show && (
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:var(--space-2) var(--space-3);padding:var(--space-2) 0;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent)">
          <span style="font-size:14px;flex:1 1 220px">{v.bulk.text}</span>
          <button class="btn btn-secondary" onClick={v.bulk.run}>
            {v.bulk.label}
          </button>
        </div>
      )}
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        {v.txGroups.map((g) => (
          <div key={g.date} style="display:flex;flex-direction:column">
            <div style="display:flex;justify-content:space-between;gap:var(--space-3);padding-bottom:var(--space-1);border-bottom:1px solid var(--color-text)">
              <span style="font-family:var(--font-heading);font-weight:600;font-size:17px">{g.label}</span>
              <span style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">{g.sum}</span>
            </div>
            {g.items.map((t) => (
              <button
                key={t.id}
                onClick={t.open}
                style={
                  "all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--color-divider);min-height:52px;background:" +
                  t.bg
                }
              >
                {v.sel.on && (
                  <span
                    aria-hidden="true"
                    style="flex:none;width:20px;height:20px;border:1px solid var(--color-accent);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:var(--color-accent-700);font-size:14px;line-height:1"
                  >
                    {t.mark}
                  </span>
                )}
                <span style="flex:1;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px var(--space-3)">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px">{t.payee}</span>
                  <span style={"text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:" + t.color}>{t.amtL}</span>
                  <span style="font-size:13px;color:var(--color-neutral-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{t.sub}</span>
                  {t.hasNote && (
                    <span style="grid-column:1 / -1;font-size:13px;font-style:italic;color:var(--color-neutral-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      {t.note}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {v.hasMore && (
        <div>
          <button class="btn btn-secondary" onClick={() => app.setState((x) => ({ limit: x.limit + 80 }))}>
            Weitere anzeigen
          </button>
        </div>
      )}
    </main>
  );
}

/** Dialog für eine einzelne Buchung. */
export function TxDialog({ c }: { c: Ctx }) {
  const { d, s, app, ALLC, potOpts } = c;
  const sx = d.tx.find((t) => t.id === s.txSel);
  if (!sx) return null;
  const fe = fixEntry(sx, d),
    fxOn = isFix(sx, d);
  const close = () => app.setState({ txSel: null });
  const toggleOne = () =>
    app.mut((dd) => {
      const nd = { ...dd, tx: dd.tx.map((x) => (x.id === sx.id ? { ...x, oneoffManual: !sx.oneoff, editedAt: Date.now() } : x)) };
      nd.tx = recat(nd);
      return nd;
    });
  const toggleFix = () => {
    if (fxOn) {
      if (fe && sx.fixManual == null) app.setState({ fixAsk: "off" });
      else app.setFix(sx, "clear");
    } else {
      if (fe) app.setFix(sx, "clear");
      else app.setState({ fixAsk: "on" });
    }
  };
  const setNote = (e: Event) => {
    const v = val(e);
    app.mut((dd) => ({ ...dd, tx: dd.tx.map((x) => (x.id === sx.id ? { ...x, note: v, editedAt: Date.now() } : x)) }));
  };
  const del = () => {
    app.mut((dd) => ({ ...dd, tx: dd.tx.filter((x) => x.id !== sx.id), deleted: [...(dd.deleted || []), sx.id] }));
    app.setState({ txSel: null });
  };
  const setCat = (e: Event) => {
    let cat: string | null = val(e);
    if (cat === "__new") {
      cat = askName("Name der neuen Kategorie", [...CATS, ...(d.customCats || [])]);
      if (!cat) {
        app.forceUpdate();
        return;
      }
    }
    app.setTxCat(sx.id, cat, s.ruleAll !== false);
  };
  const canRule = sx.src !== "Manuell" && normKey(sx.payee || "").length >= 3;
  const potLabel = sx.cat === TRANSFER ? (sx.amount < 0 ? "Eingezahlt in" : "Entnommen aus") : sx.amount > 0 ? "Eingegangen in" : "Bezahlt aus";
  const fixSrc = sx.fixManual != null ? " (nur diese Buchung)" : fe ? " (laut Liste: „" + fe.name + "“)" : "";
  const canFix = sx.amount < 0 && sx.cat !== TRANSFER;
  return (
    <Sheet label="Buchung" onClose={close}>
      <SheetHead title={sx.payee || "—"} closeLabel="Fertig" onClose={close} />
      <span
        style={
          "font-family:var(--font-heading);font-size:40px;line-height:1;font-variant-numeric:tabular-nums;color:" +
          (sx.amount > 0 ? "var(--color-accent-700)" : "var(--color-text)")
        }
      >
        {f2(sx.amount)}
      </span>
      <span style="font-size:14px;color:var(--color-neutral-700)">{dLabel(sx.date) + " · " + (sx.acct || "")}</span>
      {!!sx.purpose && <p style="margin:0;font-size:14px;overflow-wrap:anywhere">{sx.purpose}</p>}
      <div class="field">
        <label>Kategorie</label>
        <select class="input" value={sx.cat || ""} onChange={setCat} style="min-height:44px">
          {ALLC.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
          <option value="__new">+ Neue Kategorie …</option>
        </select>
      </div>
      {canRule && (
        <label class="radio" style="font-size:14px">
          <input
            type="checkbox"
            checked={s.ruleAll !== false}
            onChange={() => app.setState((x) => ({ ruleAll: x.ruleAll === false }))}
            style="accent-color:var(--color-accent)"
          />
          {"Kategorie für alle Buchungen von „" + normKey(sx.payee || "") + "“ übernehmen"}
        </label>
      )}
      <div class="field">
        <label>{potLabel}</label>
        <select class="input" value={potOf(sx, d) || ""} onChange={(e) => app.setTxPot(sx.id, val(e))} style="min-height:44px">
          <option value="">Laufendes Haushaltsgeld</option>
          {potOpts.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
          <option value="__new">+ Neuer Topf …</option>
        </select>
      </div>
      {sx.pot == null && !!potOf(sx, d) && (
        <span style="font-size:13px;color:var(--color-neutral-700)">{"Automatisch über die Kategorie „" + sx.cat + "“. Einzeln umstellbar."}</span>
      )}
      <div class="field">
        <label>Notiz</label>
        <textarea
          class="input"
          rows={2}
          value={sx.note || ""}
          onInput={setNote}
          placeholder="Wofür war die Buchung? z. B. Geburtstagsgeschenk Oma, Rechnung Nr. 123"
          style="min-height:44px;resize:vertical;font-family:inherit"
        ></textarea>
      </div>
      <label class="radio" style="font-size:14px">
        <input type="checkbox" checked={!!sx.oneoff} onChange={toggleOne} style="accent-color:var(--color-accent)" />
        Einmalig – zählt nicht in Durchschnitte und Budgets
      </label>
      {canFix && (
        <label class="radio" style="font-size:14px">
          <input type="checkbox" checked={fxOn} onChange={toggleFix} style="accent-color:var(--color-accent)" />
          Fixkosten{fixSrc}
        </label>
      )}
      {!!s.fixAsk && (
        <div style="display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3) 0;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent)">
          <span style="font-size:14px">{s.fixAsk === "off" ? "Auch aus der Fixkosten-Liste entfernen?" : "Wie soll das gelten?"}</span>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
            <button class="btn btn-primary" onClick={() => app.setFix(sx, s.fixAsk === "on" ? "onList" : "offList")}>
              {s.fixAsk === "off" ? "Aus der Liste entfernen" : "Als Fixkosten merken"}
            </button>
            <button class="btn btn-secondary" onClick={() => app.setFix(sx, s.fixAsk === "on" ? "onOnly" : "offOnly")}>
              Nur diese Buchung
            </button>
            <button class="btn btn-ghost" onClick={() => app.setState({ fixAsk: null })}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {sx.src === "Manuell" && (
        <div>
          <button class="btn btn-secondary" onClick={del}>
            Buchung löschen
          </button>
        </div>
      )}
    </Sheet>
  );
}
