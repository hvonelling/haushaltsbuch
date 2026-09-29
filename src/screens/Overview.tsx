// Übersicht: Monatsbilanz, Aufteilung der Gehälter, Sparpotenzial, Töpfe, Budgets.

import { INCATS, TRANSFER } from "../domain/constants";
import { MONTHS, TODAY_YM, ymLong, nowDate } from "../domain/dates";
import { f0, N } from "../domain/format";
import { fixedIn, fixOpenIn, isFix, potBal, potOf, ymOf } from "../domain/ledger";
import { kpiOf, type Ctx } from "../app/ctx";
import { AlertRow, kicker } from "../ui/parts";
import { calendarVM } from "./Calendar";
import { potsDueRows } from "./Pots";
import { budgetSuggestionCount } from "./Categories";
import { unlinkedFixedCount } from "./Fixed";
import { openBankAsks } from "./More";

export function overviewVM(c: Ctx) {
  const { d, s, st, sel, EXPC, budgets, go, months } = c;
  const ms = {
    aus: f0(st.aus),
    line:
      "Einnahmen " +
      f0(st.ein) +
      " (Gehälter & Kindergeld " +
      f0(st.einFix) +
      (st.einOther > 0.5 ? ", weitere " + f0(st.einOther) : "") +
      ")" +
      " · Saldo " +
      (st.ein - st.aus >= 0 ? "+" : "") +
      f0(st.ein - st.aus),
    hasOne: !!(st.oneAus || st.oneEin),
    oneLine:
      "davon einmalig: " +
      [st.oneAus ? "Ausgaben " + f0(st.oneAus) : "", st.oneEin ? "Einnahmen " + f0(st.oneEin) : ""].filter(Boolean).join(" · "),
  };

  // --- Aufteilung der Gehaltseingänge
  const fixPlan = fixedIn(d, sel);
  const fixOpen = fixOpenIn(d, sel);
  const fixTot = st.fixA + fixOpen;
  const bdg = budgets;
  let budSeg = 0,
    budSp = 0,
    budUn = 0;
  const resv = sel >= TODAY_YM();
  EXPC.forEach((cat) => {
    const b = N(bdg[cat]) || 0;
    if (b > 0) {
      const sp = st.byCatVar[cat] || 0;
      budSeg += resv ? Math.max(b, sp) : sp;
      budSp += sp;
      if (!resv) budUn += Math.max(0, b - sp);
    }
  });
  const noBud = Math.max(0, st.aus - st.fixA - budSp),
    E = st.einFix;
  const pc = (a: number, b: number) => (b > 0 ? Math.min(100, (a / b) * 100) : a > 0 ? 100 : 0).toFixed(1) + "%",
    over = (a: number, b: number) => a > b + 0.5;
  const budTot = EXPC.reduce((x, cat) => x + (N(bdg[cat]) || 0), 0);
  const row = (label: string, sp: number, plan: number, col: string, noteFn: (o: boolean) => string) => {
    const o = over(sp, plan);
    return {
      label,
      amt: f0(sp) + (plan > 0 ? " von " + f0(plan) : ""),
      w: pc(sp, plan),
      col: o ? "var(--color-text)" : col,
      note: noteFn(o),
      noteCol: o ? "var(--color-text)" : "var(--color-neutral-700)",
      noteW: o ? 600 : 400,
    };
  };
  const rows = [];
  if (budTot > 0)
    rows.push(
      row("Budgets", budSp, budTot, "var(--color-accent)", (o) =>
        o ? f0(budSp - budTot) + " über den Budgets" : "noch " + f0(budTot - budSp) + " in den Budgets",
      ),
    );
  const spPlan = E - fixPlan - budTot,
    fixOv = Math.max(0, fixTot - fixPlan),
    fixUn = Math.max(0, fixPlan - fixTot);
  let budOv = 0;
  EXPC.forEach((cat) => {
    const b = N(bdg[cat]) || 0;
    if (b > 0) budOv += Math.max(0, (st.byCatVar[cat] || 0) - b);
  });
  const eaten = fixOv + budOv + noBud,
    spLeft = spPlan - eaten + fixUn + budUn,
    spBase = Math.max(1, spPlan),
    eatW = spPlan > 0 ? Math.min(100, (Math.min(eaten, spPlan) / spBase) * 100).toFixed(1) + "%" : "0%";
  const parts = [
    fixOv > 0.5 ? f0(fixOv) + " Fixkosten über Plan" : "",
    budOv > 0.5 ? f0(budOv) + " über Budgets" : "",
    noBud > 0.5 ? f0(noBud) + " ohne Budget" : "",
    fixUn > 0.5 ? "+" + f0(fixUn) + " Fixkosten günstiger als geplant" : "",
  ].filter(Boolean);
  const aBase = Math.max(1, E, fixTot + budSeg + noBud),
    spA = Math.max(0, spLeft),
    aW = (v: number) => ((Math.max(0, v) / aBase) * 100).toFixed(2) + "%",
    aP = (v: number) => (E > 0 ? Math.round((v / E) * 100) + " %" : "—"),
    past = sel < TODAY_YM();
  type AItem = { label: string; amt: string; pct: string; sw: string; wt: number; sub: string; cur?: string; go?: () => void };
  const aItems: AItem[] = [
    {
      label: "Fixkosten  ›",
      cur: "pointer",
      go: () => go("planung", "fixkosten"),
      amt: f0(fixTot),
      pct: aP(fixTot),
      sw: "var(--color-neutral-800)",
      wt: 400,
      sub:
        fixOpen > 0.5
          ? f0(st.fixA) + " abgebucht · " + f0(fixOpen) + (past ? " nicht abgebucht" : " vorgemerkt")
          : (fixTot > 0.5 ? "alles abgebucht" : "keine Fixkosten fällig") + (fixOv > 0.5 ? " · " + f0(fixOv) + " mehr als geplant" : ""),
    },
  ];
  if (budSeg > 0.5)
    aItems.push({
      label: "Budgets",
      amt: f0(budSeg),
      pct: aP(budSeg),
      sw: "var(--color-accent)",
      wt: 400,
      sub:
        f0(budSp) +
        " ausgegeben" +
        (budSeg - budSp > 0.5 ? " + " + f0(budSeg - budSp) + " noch frei in nicht ausgeschöpften Budgets" : "") +
        (budUn > 0.5 ? " · " + f0(budUn) + " nicht gebraucht" : "") +
        " · geplant " +
        f0(budTot) +
        (budOv > 0.5 ? ", " + f0(budOv) + " darüber" : ""),
    });
  if (noBud > 0.5)
    aItems.push({
      label: "Ohne Budget  ›",
      amt: f0(noBud),
      pct: aP(noBud),
      sw: "var(--color-neutral-400)",
      wt: 400,
      sub:
        (st.oneAus > 0.5 ? "davon " + f0(st.oneAus) + " einmalige Ausgaben · " : "") +
        "Ausgaben außerhalb von Fixkosten und Budgets · antippen zum Anzeigen",
      cur: "pointer",
      go: () => go("buchungen", null, { fCat: "__nobud", fMonth: sel, fAcct: "alle", fPot: "alle", q: "", filtersOpen: true }),
    });
  aItems.push(
    spLeft < -0.5
      ? {
          label: "Fehlbetrag",
          amt: f0(-spLeft),
          pct: aP(-spLeft),
          sw: "var(--color-text)",
          wt: 600,
          sub: "Mehr verplant und ausgegeben als eingegangen",
        }
      : {
          label: "Sparpotenzial",
          amt: f0(spA),
          pct: aP(spA),
          sw: "var(--color-accent-300)",
          wt: 400,
          sub: "Rest nach Fixkosten, Budgets und Ausgaben ohne Budget",
        },
  );
  const alloc = { ein: f0(E), fDoneW: aW(st.fixA), fOpenW: aW(fixOpen), budW: aW(budSeg), noBW: aW(noBud), spW: aW(spA), items: aItems };
  const neg = spLeft < -0.5;
  const spNote = neg
    ? "Gehälter " + f0(E) + " − Fixkosten " + f0(fixTot) + " − Budgets " + f0(budSeg) + (noBud > 0.5 ? " − ohne Budget " + f0(noBud) : "")
    : spPlan <= 0
      ? "Einnahmen decken Fixkosten und Budgets nicht"
      : eaten > 0.5
        ? "−" + f0(eaten) + " von geplant " + f0(spPlan)
        : "Noch nichts außerhalb von Fix und Budgets ausgegeben";
  const sv = st.potSave || 0,
    cap = Math.max(0, Math.min(spBase, spLeft)),
    svIn = Math.min(sv, cap),
    fr = spLeft - sv;
  const bar = {
    ein: f0(E),
    rows,
    restL: neg ? "Fehlbetrag" : "Sparpotenzial",
    rest: (neg ? "−" : "") + f0(Math.abs(spLeft)),
    restCol: neg ? "var(--color-text)" : "var(--color-accent-700)",
    spW: spPlan > 0 ? (((cap - svIn) / spBase) * 100).toFixed(1) + "%" : "0%",
    eatW,
    spNote,
    spNoteCol: neg || spPlan <= 0 ? "var(--color-text)" : "var(--color-neutral-700)",
    spNoteW: neg || spPlan <= 0 ? 600 : 400,
    spSub: parts.length ? "davon " + parts.join(" · ") : "Einnahmen − Fixkosten − Budgets",
    saveW: spPlan > 0 ? ((svIn / spBase) * 100).toFixed(1) + "%" : "0%",
    hasSave: sv > 0.5,
    saveNote: "In Töpfe gespart " + f0(sv) + " · " + (fr >= -0.5 ? "noch frei " + f0(fr) : f0(-fr) + " mehr gespart als übrig"),
    saveCol: fr < -0.5 ? "var(--color-text)" : "var(--color-neutral-700)",
    saveWt: fr < -0.5 ? 600 : 400,
  };

  // --- Budget-Ampel
  const isCur = sel === TODAY_YM();
  const dim = new Date(+sel.slice(0, 4), +sel.slice(5), 0).getDate();
  const dayPct = isCur ? nowDate().getDate() / dim : 1;
  const ampel = EXPC.filter((cat) => N(budgets[cat]) > 0)
    .map((cat) => {
      const b = N(budgets[cat]),
        sp = st.byCat[cat] || 0,
        p = sp / b;
      let col = "var(--color-accent)",
        note = "noch " + f0(b - sp) + " frei",
        noteCol = "var(--color-neutral-700)",
        noteW = 400;
      if (p > 1) {
        col = "var(--color-text)";
        note = f0(sp - b) + " über Budget";
        noteCol = "var(--color-text)";
        noteW = 600;
      } else if (isCur && p > dayPct + 0.1) {
        note = "noch " + f0(b - sp) + " frei · schneller als geplant";
        noteCol = "var(--color-accent-700)";
        noteW = 600;
      } else if (p > 0.9) {
        note = "noch " + f0(b - sp) + " frei · fast ausgeschöpft";
        noteCol = "var(--color-accent-700)";
        noteW = 600;
      }
      return {
        cat,
        txt: f0(sp) + " von " + f0(b),
        pct: c.dPct(sp, c.medOf(cat, "byCat")),
        w: Math.min(100, p * 100).toFixed(1) + "%",
        col,
        note,
        noteCol,
        noteW,
        hasTick: isCur,
        tick: (dayPct * 100).toFixed(1) + "%",
        p,
        open: () => c.openCat(cat),
      };
    })
    .sort((a, b) => b.p - a.p);
  const nbSum: Record<string, number> = {};
  EXPC.forEach((cat) => {
    if (!(N(budgets[cat]) > 0)) nbSum[cat] = 0;
  });
  d.tx.forEach((t) => {
    if (ymOf(t, d) !== sel || t.amount >= 0 || t.cat === TRANSFER || potOf(t, d) || isFix(t, d) || N(budgets[t.cat as string]) > 0) return;
    if (!t.oneoff && INCATS.includes(t.cat as string)) return;
    nbSum[t.cat as string] = (nbSum[t.cat as string] || 0) - t.amount;
  });
  const others = Object.entries(nbSum).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const otherCats = (s.allCats ? others : others.slice(0, 4)).map(([cat, v]) => ({
    cat,
    amt: f0(v),
    pct: c.dPct(v, c.medOf(cat, "byCatVar")),
    open: () => c.openCat(cat),
  }));

  // --- Töpfe
  const dueRows = potsDueRows(c);
  const ovOpen = !!s.potsOpen;
  const mn = MONTHS[+sel.slice(5) - 1];
  const ov = {
    has: c.pots.length > 0,
    open: ovOpen,
    icon: ovOpen ? "−" : "+",
    label: "Töpfe (" + c.pots.length + ")",
    total: f0(c.pots.reduce((a, p) => a + potBal(p, d).bal, 0)),
    rows: c.pots.map((p) => {
      const b = potBal(p, d),
        goal = N(p.goal) || 0,
        m = st.byPot[p.id] || ({} as { dep?: number; in?: number; out?: number }),
        din = (m.dep || 0) + (m.in || 0),
        dout = m.out || 0;
      return {
        id: p.id,
        name: p.name || "Ohne Name",
        bal: f0(b.bal),
        hasGoal: goal > 0,
        goalW: goal > 0 ? Math.min(100, Math.max(0, (b.bal / goal) * 100)).toFixed(1) + "%" : "0%",
        sub:
          (din > 0.5 || dout > 0.5
            ? mn +
              ": " +
              [din > 0.5 ? "eingezahlt " + f0(din) : "", dout > 0.5 ? "entnommen " + f0(dout) : ""].filter(Boolean).join(" · ")
            : mn + ": keine Bewegung") + (goal > 0 ? " · Ziel " + f0(goal) : ""),
        open: () => go("buchungen", null, { fPot: p.id, fMonth: "alle", fCat: "Alle", fAcct: "alle", q: "", filtersOpen: true }),
      };
    }),
    toggle: () => c.app.setState((x) => ({ potsOpen: !x.potsOpen })),
    hasDue: dueRows.length > 0,
    dueText: dueRows.length + (dueRows.length === 1 ? " Sparrate" : " Sparraten") + " offen",
  };

  const nBudSug = budgetSuggestionCount(c);
  const unlinkedN = unlinkedFixedCount(c);
  const asks = openBankAsks(d);
  const nNew = d.fixed.filter((f) => f.isNew).length;
  const dirty = (d.changedAt || 0) > (d.savedAt || 0) && d.tx.length > 0;

  return {
    selLabel: ymLong(sel),
    prevMonth: () => {
      const mi = months.indexOf(sel);
      if (mi > 0) c.app.setState({ month: months[mi - 1] });
    },
    nextMonth: () => {
      const mi = months.indexOf(sel);
      if (mi >= 0 && mi < months.length - 1) c.app.setState({ month: months[mi + 1] });
    },
    ms,
    bar,
    alloc,
    ampel,
    otherCats,
    hasOther: others.length > 0,
    canMoreCats: others.length > 4,
    moreCatsLabel: s.allCats ? "Weniger anzeigen" : "Alle " + others.length + " anzeigen",
    ov,
    soon: calendarVM(c).soon,
    kpi: kpiOf(c),
    noTx: !d.tx.length,
    hasBankAsk: asks.length > 0,
    bankAskText: asks.length + (asks.length === 1 ? " Bankbuchung passt" : " Bankbuchungen passen") + " zu einem manuellen Eintrag – prüfen",
    hasNewFix: nNew > 0,
    newFixText: nNew + " neu erkannte Fixkosten – prüfen",
    hasBudSug: nBudSug > 0,
    budSugText: nBudSug + (nBudSug === 1 ? " Budget-Vorschlag" : " Budget-Vorschläge") + " aus euren Ausgaben – prüfen",
    hasUnlinked: unlinkedN > 0,
    unlinkedText: unlinkedN + (unlinkedN === 1 ? " Fixkosten-Eintrag" : " Fixkosten-Einträge") + " ohne Buchung – verknüpfen",
    dirty,
  };
}

const num = "font-variant-numeric:tabular-nums";

export function Overview({ c }: { c: Ctx }) {
  const v = overviewVM(c);
  const { go, goView, app } = c;
  return (
    <>
      <main style="display:flex;flex-direction:column;gap:var(--space-8)">
        <section style="display:flex;flex-direction:column;gap:var(--space-2)">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <button class="btn btn-ghost" onClick={v.prevMonth} aria-label="Vormonat" style="font-size:20px;min-width:44px;min-height:44px">
              ‹
            </button>
            <h1 style="margin:0;font-size:30px;flex:1">{v.selLabel}</h1>
            <button class="btn btn-ghost" onClick={v.nextMonth} aria-label="Folgemonat" style="font-size:20px;min-width:44px;min-height:44px">
              ›
            </button>
          </div>
          <span style={"font-size:15px;color:var(--color-neutral-700);" + num}>{v.ms.line}</span>
          {v.ms.hasOne && (
            <>
              <div style="display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3)">
                <span style="font-size:15px">Gehälter &amp; Kindergeld</span>
                <span style={"font-family:var(--font-heading);font-size:24px;" + num}>{v.bar.ein}</span>
              </div>
              <span style={"font-size:14px;color:var(--color-neutral-700);" + num}>{v.ms.oneLine}</span>
            </>
          )}
          <span style={"font-size:15px;color:var(--color-neutral-700);" + num}>Ausgaben {v.ms.aus}</span>
        </section>

        <section style="display:flex;flex-direction:column;gap:var(--space-4)">
          <div style="display:flex;flex-direction:column;gap:2px;padding-bottom:var(--space-3);border-bottom:1px solid var(--color-text)"></div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3)">
              <span style="font-size:15px">Gehaltseingänge</span>
              <span style={"font-size:15px;" + num}>{v.alloc.ein} · 100 %</span>
            </div>
            <div style="height:16px;border-radius:var(--radius-sm);background:var(--color-neutral-200);overflow:hidden;display:flex">
              <div style={"height:16px;width:" + v.alloc.fDoneW + ";background:var(--color-neutral-800)"}></div>
              <div
                style={
                  "height:16px;width:" +
                  v.alloc.fOpenW +
                  ";background:repeating-linear-gradient(135deg,var(--color-neutral-800) 0 3px,var(--color-neutral-400) 3px 6px)"
                }
              ></div>
              <div style={"height:16px;width:" + v.alloc.budW + ";background:var(--color-accent)"}></div>
              <div style={"height:16px;width:" + v.alloc.noBW + ";background:var(--color-neutral-400)"}></div>
              <div style={"height:16px;width:" + v.alloc.spW + ";background:var(--color-accent-300)"}></div>
            </div>
            {v.alloc.items.map((a) => (
              <button
                key={a.label}
                onClick={a.go}
                style={
                  "all:unset;box-sizing:border-box;cursor:" +
                  (a.cur || "default") +
                  ";display:grid;grid-template-columns:12px minmax(0,1fr) auto 44px;gap:2px var(--space-2);align-items:baseline;padding:2px 0"
                }
              >
                <span style={"width:10px;height:10px;border-radius:2px;background:" + a.sw}></span>
                <span style={"font-size:15px;font-weight:" + a.wt}>{a.label}</span>
                <span style={"font-size:15px;" + num + ";font-weight:" + a.wt}>{a.amt}</span>
                <span style={"font-size:13px;color:var(--color-neutral-700);" + num + ";text-align:right"}>{a.pct}</span>
                <span style={"grid-column:2 / -1;font-size:13px;color:var(--color-neutral-700);" + num}>{a.sub}</span>
              </button>
            ))}
          </div>
          {v.bar.rows.map((r) => (
            <div key={r.label} style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px var(--space-3);align-items:baseline">
              <span style="font-size:15px">{r.label}</span>
              <span style={"font-size:15px;" + num}>{r.amt}</span>
              <div style="grid-column:1 / -1;height:8px;border-radius:var(--radius-sm);background:var(--color-neutral-200);overflow:hidden">
                <div style={"height:8px;width:" + r.w + ";background:" + r.col}></div>
              </div>
              <span style={"grid-column:1 / -1;font-size:13px;color:" + r.noteCol + ";font-weight:" + r.noteW + ";" + num}>{r.note}</span>
            </div>
          ))}
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px var(--space-3);align-items:baseline;padding-top:var(--space-3);border-top:1px solid var(--color-text)">
            <span style="font-size:15px">{v.bar.restL}</span>
            <span style={"font-family:var(--font-heading);font-size:28px;" + num + ";color:" + v.bar.restCol}>{v.bar.rest}</span>
            <div style="grid-column:1 / -1;height:12px;border-radius:var(--radius-sm);background:var(--color-neutral-200);overflow:hidden;display:flex">
              <div style={"height:12px;width:" + v.bar.saveW + ";background:var(--color-accent-700)"}></div>
              <div style={"height:12px;width:" + v.bar.spW + ";background:var(--color-accent-300)"}></div>
              <div
                style={
                  "height:12px;width:" +
                  v.bar.eatW +
                  ";background:repeating-linear-gradient(135deg,var(--color-neutral-400) 0 3px,var(--color-neutral-200) 3px 6px)"
                }
              ></div>
            </div>
            <span style={"grid-column:1 / -1;font-size:13px;color:" + v.bar.spNoteCol + ";font-weight:" + v.bar.spNoteW + ";" + num}>
              {v.bar.spNote}
            </span>
            <span style={"grid-column:1 / -1;font-size:13px;color:var(--color-neutral-700);" + num}>{v.bar.spSub}</span>
            {v.bar.hasSave && (
              <span style={"grid-column:1 / -1;font-size:13px;color:" + v.bar.saveCol + ";font-weight:" + v.bar.saveWt + ";" + num}>
                {v.bar.saveNote}
              </span>
            )}
          </div>
        </section>

        {v.ov.has && (
          <section style="display:flex;flex-direction:column;border-top:1px solid var(--color-text)">
            <button
              onClick={v.ov.toggle}
              aria-expanded={v.ov.open}
              style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3);padding:var(--space-3) 0;min-height:48px"
            >
              <span style="font-size:15px">{v.ov.label}</span>
              <span style="display:flex;align-items:baseline;gap:var(--space-2)">
                <span style={"font-family:var(--font-heading);font-size:24px;" + num}>{v.ov.total}</span>
                <span style="font-size:18px;color:var(--color-neutral-700);width:16px;text-align:center">{v.ov.icon}</span>
              </span>
            </button>
            {v.ov.open && (
              <>
                {v.ov.rows.map((p) => (
                  <button
                    key={p.id}
                    onClick={p.open}
                    style="all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px var(--space-3);align-items:baseline;padding:var(--space-2) 0;border-top:1px solid var(--color-divider);min-height:48px"
                  >
                    <span>{p.name}</span>
                    <span style={num}>
                      {p.bal}
                      {"  ›"}
                    </span>
                    {p.hasGoal && (
                      <div style="grid-column:1 / -1;height:6px;border-radius:var(--radius-sm);background:var(--color-neutral-200);overflow:hidden">
                        <div style={"height:6px;width:" + p.goalW + ";background:var(--color-accent-700)"}></div>
                      </div>
                    )}
                    <span style={"grid-column:1 / -1;font-size:13px;color:var(--color-neutral-700);" + num}>{p.sub}</span>
                  </button>
                ))}
                {v.ov.hasDue && (
                  <button
                    onClick={goView.toepfe}
                    style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;gap:var(--space-3);padding:var(--space-2) 0;border-top:1px solid var(--color-accent);color:var(--color-accent-700);min-height:44px;align-items:center"
                  >
                    <span>{v.ov.dueText}</span>
                    <span>›</span>
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {v.soon.has && (
          <section style="display:flex;flex-direction:column;border-top:1px solid var(--color-text)">
            <button
              onClick={goView.kalender}
              style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3);padding:var(--space-3) 0;min-height:48px"
            >
              <span style="font-size:15px">Demnächst fällig</span>
              <span style="font-size:14px;color:var(--color-neutral-700)">Kalender{"  ›"}</span>
            </button>
            {v.soon.items.map((o, i) => (
              <div
                key={i}
                style="display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:2px var(--space-3);align-items:baseline;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
              >
                <span style={"font-size:14px;" + num + ";color:var(--color-neutral-700)"}>{o.dateL}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{o.name}</span>
                <span style={num + ";white-space:nowrap;color:" + o.amtCol}>{o.amtL}</span>
                <span></span>
                <span style={"grid-column:2 / -1;font-size:13px;color:" + o.subCol + ";font-weight:" + o.subW}>{o.sub}</span>
              </div>
            ))}
          </section>
        )}
        {v.hasBankAsk && <AlertRow text={v.bankAskText} onClick={() => app.setState({ askOpen: true })} />}
        {v.hasNewFix && <AlertRow text={v.newFixText} onClick={() => go("planung", "fixkosten")} />}
        {v.dirty && <AlertRow text="Ungesicherte Änderungen – mit iCloud abgleichen" onClick={() => go("mehr", null)} />}

        {v.noTx && (
          <section style="display:flex;flex-direction:column;gap:var(--space-3);border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
            <p style="margin:0">Noch keine Buchungen. Gleicht mit eurer Datei aus iCloud ab oder importiert Bankumsätze.</p>
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
              <button class="btn btn-primary" onClick={() => go("mehr", null)}>
                Zum Abgleichen
              </button>
            </div>
          </section>
        )}

        <section style="display:flex;flex-direction:column;gap:var(--space-4);border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3)">
            <h2 style="margin:0;font-size:26px">Budgets</h2>
            <button class="btn btn-ghost" onClick={goView.kategorien}>
              Bearbeiten
            </button>
          </div>
          {!v.ampel.length && (
            <p style="margin:0;color:var(--color-neutral-700)">Noch keine Budgets. Unter „Bearbeiten“ pro Kategorie einen Monatsbetrag festlegen.</p>
          )}
          <div style="display:flex;flex-direction:column;gap:var(--space-4)">
            {v.ampel.map((b) => (
              <button
                key={b.cat}
                onClick={b.open}
                style="all:unset;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto 52px;gap:6px var(--space-3);align-items:baseline"
              >
                <span style="font-size:16px">{b.cat}</span>
                <span style={"font-size:15px;" + num}>{b.txt}</span>
                <span style={"font-size:13px;text-align:right;color:var(--color-neutral-700);" + num}>{b.pct}</span>
                <div style="grid-column:1 / -1;position:relative;height:6px;border-radius:var(--radius-sm);background:var(--color-neutral-200)">
                  <div style={"height:6px;border-radius:var(--radius-sm);width:" + b.w + ";background:" + b.col}></div>
                  {b.hasTick && (
                    <div style={"position:absolute;top:-4px;bottom:-4px;left:" + b.tick + ";width:1px;background:var(--color-text)"}></div>
                  )}
                </div>
                <span style={"grid-column:1 / -1;font-size:13px;color:" + b.noteCol + ";font-weight:" + b.noteW}>{b.note}</span>
              </button>
            ))}
          </div>
          {v.hasOther && (
            <div style="display:flex;flex-direction:column">
              <span style={kicker + ";padding-bottom:var(--space-1)"}>Ohne Budget</span>
              {v.otherCats.map((o) => (
                <button
                  key={o.cat}
                  onClick={o.open}
                  style="all:unset;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto 52px;gap:var(--space-3);align-items:baseline;padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)"
                >
                  <span>{o.cat}</span>
                  <span style={num}>{o.amt}</span>
                  <span style={"font-size:13px;text-align:right;color:var(--color-neutral-700);" + num}>{o.pct}</span>
                </button>
              ))}
              {v.canMoreCats && (
                <div style="padding-top:var(--space-2)">
                  <button class="btn btn-ghost" onClick={() => app.setState((x) => ({ allCats: !x.allCats }))} style="padding-left:0">
                    {v.moreCatsLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4);border-top:1px solid var(--color-divider);padding-top:var(--space-4)">
          <button onClick={() => go("planung", null)} style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px">
            <span style={kicker}>Sparpotenzial</span>
            <span style={"font-family:var(--font-heading);font-size:34px;line-height:1.1;" + num + ";color:var(--color-accent-700)"}>{v.kpi.spar}</span>
            <span style="font-size:13px;color:var(--color-neutral-700)">{v.kpi.sparNote}</span>
          </button>
          <button onClick={() => go("planung", null)} style="all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px">
            <span style={kicker}>Erspartes</span>
            <span style={"font-family:var(--font-heading);font-size:34px;line-height:1.1;" + num}>{v.kpi.today}</span>
            <span style="font-size:13px;color:var(--color-neutral-700)">{v.kpi.future}</span>
          </button>
        </section>
      </main>
      {v.hasBudSug && <AlertRow text={v.budSugText} onClick={goView.kategorien} />}
      {v.hasUnlinked && <AlertRow text={v.unlinkedText} onClick={() => go("planung", "fixkosten")} />}
    </>
  );
}
