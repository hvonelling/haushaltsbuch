// Kategorien & Budgets sowie die Auswertung einer einzelnen Kategorie.

import { useEffect, useRef } from "preact/hooks";
import { MONTHS, TODAY_YM, ymLabel, ymLong } from "../domain/dates";
import { f0, N, short } from "../domain/format";
import type { Data } from "../domain/types";
import type { Ctx } from "../app/ctx";
import { val } from "../ui/parts";

const KEEP = ["Sonstiges"];

function setBudget(c: Ctx, cat: string, v: string | number | null) {
  c.app.mut((dd) => {
    const b = { ...(dd.budgets || {}) };
    if (v === "" || v == null) delete b[cat];
    else b[cat] = +v;
    return { ...dd, budgets: b };
  }, true);
}

/** Ø-Ausgaben einer Kategorie über die letzten (bis zu 12) vollständigen Monate. */
function catAvgOf(c: Ctx) {
  const avMs = c.cm.slice(-12);
  return (cat: string) => (avMs.length ? avMs.reduce((a, m) => a + (c.stOf(m).byCat[cat] || 0), 0) / avMs.length : 0);
}

/** Budget-Vorschlag aus dem Median der letzten 6 vollständigen Monate. */
function budSugOf(c: Ctx) {
  const sgMs = c.months.filter((m) => m < TODAY_YM()).slice(-6),
    dis = c.d.budgetSugDismiss || {};
  const fn = (cat: string) => {
    if (sgMs.length < 3) return null;
    const v = sgMs.map((m) => c.stOf(m).byCatVar[cat] || 0).sort((a, b) => a - b),
      n = v.length,
      med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2,
      sug = Math.round(med / 50) * 50,
      b = N(c.budgets[cat]) || 0;
    if (sug === b || dis[cat] === sug) return null;
    if (b <= 0) return sug >= 50 ? { med, sug, b } : null;
    if (Math.abs(b - med) / Math.max(med, 1) <= 0.15) return null;
    return { med, sug, b };
  };
  return { fn, n: sgMs.length };
}

export function budgetSuggestionCount(c: Ctx): number {
  const { fn } = budSugOf(c);
  return c.EXPC.filter((cat) => !!fn(cat)).length;
}

export function categoriesVM(c: Ctx) {
  const { s, st, app, budgets, EXPC, ALLC } = c;
  const catAvg = catAvgOf(c);
  const { fn: budSug, n: sgN } = budSugOf(c);
  const setDis = (cat: string, v: number) =>
    app.mut((dd: Data) => ({ ...dd, budgetSugDismiss: { ...(dd.budgetSugDismiss || {}), [cat]: v } }), true);
  const rows = EXPC.map((cat) => {
    const a = catAvg(cat);
    const noDel = KEEP.includes(cat);
    const sg = budSug(cat);
    return {
      cat,
      a,
      noDel,
      vis: noDel ? "hidden" : "visible",
      del: () => app.delCat(cat),
      ren: () => app.setState({ renOpen: cat, renVal: cat }),
      isRen: s.renOpen === cat,
      renVal: s.renOpen === cat ? s.renVal || "" : "",
      renOk: () => app.renCat(cat, ALLC, s.renVal),
      renCancel: () => app.setState({ renOpen: null }),
      avg: f0(a),
      cur: f0(st.byCat[cat] || 0),
      budget: budgets[cat] ?? "",
      open: () => c.go(s.tab, "cat", { anCat: cat }),
      hasSug: !!sg,
      sugText: sg
        ? sg.b > 0
          ? (sg.med < 50 || sg.b > sg.med * 3
              ? "Budget " + f0(sg.b) + ", Median nur " + f0(sg.med)
              : "Budget " + f0(sg.b) + " weicht " + Math.round((Math.abs(sg.b - sg.med) / sg.med) * 100) + " % vom Median ab (" + f0(sg.med) + ")") +
            " · " +
            sgN +
            " Monate"
          : "Median der letzten " + sgN + " Monate: " + f0(sg.med)
        : "",
      takeL: sg ? (sg.b > 0 ? (sg.sug > 0 ? "Auf " + f0(sg.sug) + " anpassen" : "Budget entfernen") : f0(sg.sug) + " übernehmen") : "",
      takeSug: () => {
        if (sg) setBudget(c, cat, sg.sug > 0 ? sg.sug : "");
      },
      skipSug: () => {
        if (sg) setDis(cat, sg.sug);
      },
    };
  }).sort((x, y) => y.a - x.a);
  return { rows, unassignedN: c.d.tx.filter((t) => t.cat === "Sonstiges").length };
}

function RenameInput(p: { value: string; onInput: (e: Event) => void; onKey: (e: KeyboardEvent) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <input ref={ref} class="input" style="flex:1;min-width:0" value={p.value} onInput={p.onInput} onKeyDown={p.onKey} aria-label="Neuer Name" />
  );
}

export function Categories({ c }: { c: Ctx }) {
  const v = categoriesVM(c);
  const { s, app, ALLC } = c;
  return (
    <main style="display:flex;flex-direction:column">
      <p style="margin:0 0 var(--space-3);font-size:14px;color:var(--color-neutral-700)">Ø der vollständigen Monate · Budget leer lassen = kein Budget</p>
      <div style="display:flex;gap:var(--space-2);align-items:flex-end;padding-bottom:var(--space-3);border-bottom:1px solid var(--color-text)">
        <div class="field" style="flex:1">
          <label>Neue Kategorie</label>
          <input class="input" value={s.newCat || ""} onInput={(e) => app.setState({ newCat: val(e) })} placeholder="z. B. Haustier" />
        </div>
        <button class="btn btn-primary" onClick={() => app.addCat(ALLC)} style="min-height:40px">
          Anlegen
        </button>
      </div>
      <button
        onClick={() => c.go("buchungen", null, { fCat: "Sonstiges", fMonth: "alle", fAcct: "alle", fPot: "alle", q: "", filtersOpen: true })}
        style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--color-text);min-height:48px;color:var(--color-accent-700)"
      >
        <span>{v.unassignedN} Buchungen unter „Sonstiges“ zuordnen</span>
        <span>›</span>
      </button>
      {v.rows.map((r) => (
        <div
          key={r.cat}
          style="display:grid;grid-template-columns:minmax(0,1fr) 110px 36px 36px;gap:var(--space-1) var(--space-2);align-items:center;padding:var(--space-3) 0;border-bottom:1px solid var(--color-divider)"
        >
          {r.isRen ? (
            <div style="grid-column:1 / -1;display:flex;gap:var(--space-2);align-items:center">
              <RenameInput
                value={r.renVal}
                onInput={(e) => app.setState({ renVal: val(e) })}
                onKey={(e) => {
                  if (e.key === "Enter") r.renOk();
                  if (e.key === "Escape") app.setState({ renOpen: null });
                }}
              />
              <button class="btn btn-primary" onClick={r.renOk}>
                Speichern
              </button>
              <button class="btn btn-ghost" onClick={r.renCancel}>
                Abbrechen
              </button>
            </div>
          ) : (
            <>
              <button onClick={r.open} style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0">
                <span style="font-size:16px">{r.cat}</span>
                <span style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">
                  Ø {r.avg} · jetzt {r.cur}
                </span>
              </button>
              <input
                class="input"
                type="number"
                inputMode="decimal"
                value={r.budget as string}
                onInput={(e) => setBudget(c, r.cat, val(e))}
                placeholder="Budget"
                aria-label="Budget"
              />
              <button
                class="btn btn-ghost"
                onClick={r.ren}
                aria-label="Kategorie umbenennen"
                title="Umbenennen"
                style={"visibility:" + r.vis + ";padding:0;display:flex;align-items:center;justify-content:center"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.17 6.81a2.83 2.83 0 0 0-4-4L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"></path>
                </svg>
              </button>
              <button class="btn btn-ghost" onClick={r.del} disabled={r.noDel} aria-label="Kategorie löschen" style={"visibility:" + r.vis + ";font-size:18px"}>
                ×
              </button>
            </>
          )}
          {r.hasSug && (
            <div style="grid-column:1 / -1;display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-3)">
              <span style="flex:1 1 200px;font-size:13px;color:var(--color-accent-700);font-variant-numeric:tabular-nums">{r.sugText}</span>
              <div style="display:flex;gap:var(--space-2)">
                <button class="btn btn-secondary" onClick={r.takeSug}>
                  {r.takeL}
                </button>
                <button class="btn btn-ghost" onClick={r.skipSug}>
                  Ignorieren
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}

/** Auswertung einer Kategorie: 12 Monate, Durchschnitt, Budget, größte Empfänger. */
export function CategoryDetail({ c }: { c: Ctx }) {
  const { d, s, st, sel, months, budgets, app } = c;
  const anCat = s.anCat,
    am = months.slice(-12);
  const catAvg = catAvgOf(c);
  const avg = catAvg(anCat),
    curV = st.byCat[anCat] || 0,
    bud = N(budgets[anCat]) || 0;
  const vals = am.map((m) => c.stOf(m).byCat[anCat] || 0),
    amax = Math.max(1, ...vals, avg, bud) * 1.15;
  const aslot = 704 / Math.max(am.length, 1),
    abw = Math.min(36, aslot * 0.55),
    abase = 190,
    abh = 165;
  const pA = avg ? ((curV - avg) / avg) * 100 : null;
  const tmap: Record<string, { n: number; v: number }> = {};
  for (const t of d.tx) {
    if (t.cat !== anCat || !am.includes(t.date.slice(0, 7))) continue;
    const k = t.payee || "—";
    tmap[k] = tmap[k] || { n: 0, v: 0 };
    tmap[k].n++;
    tmap[k].v -= t.amount;
  }
  const topM = Object.entries(tmap)
    .filter(([, x]) => x.v > 0)
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 6);
  const line = "Ø " + f0(avg) + (pA != null ? " · " + (pA >= 0 ? "+" : "") + Math.round(pA) + " % zum Schnitt" : "") + (bud ? " · Budget " + f0(bud) : "");
  const selLabel = ymLong(sel);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <section style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700)">{selLabel}</span>
        <span style="font-family:var(--font-heading);font-size:56px;line-height:1;font-variant-numeric:tabular-nums">{f0(curV)}</span>
        <span style="font-size:15px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">{line}</span>
      </section>
      <svg viewBox="0 0 720 220" style="width:100%;height:auto;display:block;overflow:visible">
        <line x1="0" x2="720" y1="190" y2="190" stroke="var(--color-text)"></line>
        {am.map((m, i) => {
          const v = vals[i],
            h = Math.max(0, (abh * v) / amax),
            x = 8 + aslot * i + (aslot - abw) / 2;
          return (
            <g key={m} onClick={() => app.setState({ month: m })} style="cursor:pointer">
              <rect
                x={x}
                y={abase - h}
                width={abw}
                height={h}
                fill={m === sel ? "var(--color-accent)" : "var(--color-accent-100)"}
                stroke="var(--color-accent)"
                stroke-width="1"
              ></rect>
              <text x={x + abw / 2} y={abase - h - 6} text-anchor="middle" font-size="13" fill="var(--color-neutral-700)">
                {v ? short(v) : ""}
              </text>
              <text x={x + abw / 2} y="212" text-anchor="middle" font-size="15" font-weight={m === sel ? 600 : 400} fill="var(--color-text)">
                {MONTHS[+m.slice(5) - 1]}
              </text>
            </g>
          );
        })}
        <line x1="0" x2="720" y1={abase - (abh * avg) / amax} y2={abase - (abh * avg) / amax} stroke="var(--color-text)" stroke-dasharray="5 4"></line>
        {bud > 0 && (
          <line x1="0" x2="720" y1={abase - (abh * bud) / amax} y2={abase - (abh * bud) / amax} stroke="var(--color-accent)" stroke-width="1.5"></line>
        )}
      </svg>
      <span style="font-size:13px;color:var(--color-neutral-700)">Gestrichelt: Durchschnitt · Goldlinie: Budget · Monat antippen zum Wechseln</span>
      <div>
        <button
          class="btn btn-secondary"
          onClick={() => c.go("buchungen", null, { fCat: anCat, fMonth: sel, fAcct: "alle", fPot: "alle", q: "", filtersOpen: true })}
        >
          Buchungen im {selLabel} anzeigen
        </button>
      </div>
      <div class="field" style="max-width:220px">
        <label>Budget pro Monat (€)</label>
        <input
          class="input"
          type="number"
          inputMode="decimal"
          value={(budgets[anCat] ?? "") as string}
          onInput={(e) => setBudget(c, anCat, val(e))}
          placeholder="kein Budget"
        />
      </div>
      <section style="display:flex;flex-direction:column;border-top:1px solid var(--color-text);padding-top:var(--space-3);gap:var(--space-1)">
        <h2 style="margin:0;font-size:24px">Wo das Geld hingeht</h2>
        <span style="font-size:13px;color:var(--color-neutral-700);padding-bottom:var(--space-2)">
          {am.length ? ymLabel(am[0]) + " bis " + ymLabel(am[am.length - 1]) : ""}
        </span>
        {topM.map(([name, x]) => (
          <button
            key={name}
            onClick={() =>
              c.go("buchungen", null, { fCat: anCat, fMonth: "alle", fAcct: "alle", fPot: "alle", q: name === "—" ? "" : name, filtersOpen: true })
            }
            style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);min-height:44px;align-items:center"
          >
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{name + " · " + x.n + "×"}</span>
            <span style="font-variant-numeric:tabular-nums;white-space:nowrap">
              {f0(x.v)}
              {"  ›"}
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
