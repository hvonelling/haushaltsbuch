// Planung: Vermögensverlauf, Einkommen, Zeiträume & Szenarien, Konten & Kredite.

import { ADD_TYPES, CUTOFF_DAY, PERIOD_TYPES } from "../domain/constants";
import { addM, TODAY_YM, ymLabel } from "../domain/dates";
import { f0, N, uid } from "../domain/format";
import { suggest } from "../domain/ledger";
import { lineChart, loanPlan } from "../domain/planning";
import { kpiOf, type Ctx } from "../app/ctx";
import { NavRow, numOrNull, Seg, val } from "../ui/parts";
import { calendarVM } from "./Calendar";

const num = "font-variant-numeric:tabular-nums";

export function PlanningScreen({ c }: { c: Ctx }) {
  const { d, s, app, H, pPlan, pScen, hasScen, scenVisible, fA, sugs, today, noInc, spar, goView } = c;
  const kpi = kpiOf(c);
  const hist = Object.entries(d.snapshots || {})
    .filter(([m]) => m < TODAY_YM())
    .sort()
    .map(([ym, v]) => ({ ym, v }));
  const chart = lineChart(hist, pPlan.series, scenVisible ? pScen.series : [], H, d.periods.filter((q) => !q.scen || scenVisible));
  const endP = pPlan.series[H],
    endS = pScen.series[H];
  const loans = d.accounts.filter((a) => a.kind === "kredit");
  const debt = loans.reduce((x, a) => x + (N(a.debt) || 0), 0);
  const firstLoan = loans.map((a) => loanPlan(a, H)).find((x) => x.paid);
  const nOpenCal = calendarVM(c).nOpen;
  const planRows = [
    { label: "Einkommen", value: noInc ? "fehlt" : f0(d.persons.reduce((a, p) => a + (N(p.netto) || 0), 0)) + " netto", go: goView.einkommen },
    { label: "Fixkosten", value: "Ø " + f0(fA) + " / Monat" + (sugs.length ? " · " + sugs.length + " Vorschläge" : ""), go: goView.fixkosten },
    { label: "Kalender", value: nOpenCal ? nOpenCal + " offene Termine in 12 Monaten" : "keine Termine", go: goView.kalender },
    {
      label: "Konten & Kredite",
      value: f0(today) + (debt ? " · Kredit " + f0(debt) + (firstLoan ? " bis " + ymLabel(firstLoan.paid as string) : "") : ""),
      go: goView.konten,
    },
    { label: "Zeiträume & Szenarien", value: d.periods.length ? d.periods.length + " eingetragen" : "keine", go: goView.zeitraeume },
  ];
  const restInfo = noInc
    ? "Sparpotenzial erscheint, sobald Einkommen eingetragen sind."
    : "Sparpotenzial " +
      f0(spar) +
      " / Monat geht in der Planung aufs " +
      ((d.accounts.find((a) => a.kind !== "kredit" && /tagesgeld/i.test(a.name || "")) || d.accounts.find((a) => a.puffer) || { name: "" }).name ||
        "Puffer-Konto") +
      (pPlan.off < -0.5 || pPlan.off > 0.5
        ? " · Abweichung dieses Monats (" + (pPlan.off > 0 ? "+" : "") + f0(pPlan.off) + ") einmalig im Gesamtvermögen"
        : "");
  const endLabel = ymLabel(addM(TODAY_YM(), H));
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <h1 style="margin:0;font-size:38px">Planung</h1>
      <section style="display:flex;flex-direction:column;gap:var(--space-3)">
        <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:var(--space-3)">
          <div style="display:flex;flex-direction:column;gap:2px">
            <span style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700)">Erspartes {endLabel}</span>
            <span style={"font-family:var(--font-heading);font-size:48px;line-height:1;" + num + ";color:var(--color-accent-700)"}>{f0(endP)}</span>
            <span style={"font-size:14px;color:var(--color-neutral-700);" + num}>heute {kpi.today}</span>
          </div>
          <Seg
            name="hz"
            options={[
              { label: "3 Jahre", checked: H === 36, onChange: () => app.setState({ horizon: 36 }) },
              { label: "5 Jahre", checked: H === 60, onChange: () => app.setState({ horizon: 60 }) },
            ]}
          />
        </div>
        <svg viewBox="0 0 720 260" style="width:100%;height:auto;display:block;overflow:visible">
          {chart.bands.map((b, i) => (
            <rect key={"b" + i} x={b.x} y={chart.top} width={b.w} height={chart.bandH} fill={b.fill}></rect>
          ))}
          {chart.yticks.map((t, i) => (
            <g key={"y" + i}>
              <line x1="64" x2="708" y1={t.y} y2={t.y} stroke="var(--color-divider)"></line>
              <text x="56" y={t.ty} text-anchor="end" font-size="14" fill="var(--color-neutral-700)">
                {t.label}
              </text>
            </g>
          ))}
          {chart.xticks.map((t, i) => (
            <text key={"x" + i} x={t.x} y="252" text-anchor="middle" font-size="14" fill="var(--color-neutral-700)">
              {t.label}
            </text>
          ))}
          <line x1={chart.todayX} x2={chart.todayX} y1="14" y2="230" stroke="var(--color-neutral-500)" stroke-dasharray="2 3"></line>
          <polyline points={chart.hist} fill="none" stroke="var(--color-text)" stroke-width="1.5"></polyline>
          {scenVisible && <polyline points={chart.scen} fill="none" stroke="var(--color-text)" stroke-width="1.5" stroke-dasharray="5 4"></polyline>}
          <polyline points={chart.plan} fill="none" stroke="var(--color-accent)" stroke-width="2.5"></polyline>
        </svg>
        {hasScen && (
          <label class="radio" style="font-size:14px">
            <input
              type="checkbox"
              checked={s.showScen}
              onChange={() => app.setState((x) => ({ showScen: !x.showScen }))}
              style="accent-color:var(--color-accent)"
            />
            Was-wäre-wenn einblenden (gestrichelt)
            {scenVisible ? ": " + (endS - endP >= 0 ? "+" : "") + f0(endS - endP) + " bis " + endLabel : ""}
          </label>
        )}
      </section>
      <section style="display:flex;flex-direction:column;border-top:1px solid var(--color-text)">
        {planRows.map((r) => (
          <NavRow key={r.label} label={r.label} value={r.value} onClick={r.go} tabular />
        ))}
      </section>
      <p style={"margin:0;font-size:14px;color:var(--color-neutral-700);" + num}>{restInfo}</p>
    </main>
  );
}

export function IncomeScreen({ c }: { c: Ctx }) {
  const { d, app, noInc } = c;
  const im = d.incomeMode || "fest";
  const setIM = (v: "fest" | "stichtag" | "gebucht") => app.mut((dd) => ({ ...dd, incomeMode: v }), true);
  const cutoff = d.incomeCutoff ?? CUTOFF_DAY;
  const note =
    im === "fest"
      ? noInc
        ? "Noch kein Netto eingetragen – bis dahin zählen die gebuchten Gehälter."
        : "Jeder Monat bekommt das Netto unten plus Kindergeld (samt geplanter Zeiträume), egal wann gebucht wurde. Nur das bildet den Einnahmen-Balken; weitere Einnahmen stehen separat."
      : im === "stichtag"
        ? "Gehaltsbuchungen ab dem " + cutoff + ". zählen zum Folgemonat."
        : "Gehälter zählen im Monat der Buchung.";
  const upd = (id: string, f: string, v: unknown) => app.upd("persons", id, f, v);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <section style="display:flex;flex-direction:column;gap:var(--space-3);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-text)">
        <h2 style="margin:0;font-size:22px">Gehälter im Monat</h2>
        <Seg
          name="incmode"
          options={[
            { label: "Fest", checked: im === "fest", onChange: () => setIM("fest") },
            { label: "Stichtag", checked: im === "stichtag", onChange: () => setIM("stichtag") },
            { label: "Buchungsdatum", checked: im === "gebucht", onChange: () => setIM("gebucht") },
          ]}
        />
        {im === "stichtag" && (
          <div class="field" style="max-width:260px">
            <label>Gehalt ab dem … zählt zum Folgemonat</label>
            <input
              class="input"
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              value={cutoff as number}
              onInput={(e) => {
                const v = Math.min(31, Math.max(1, +val(e) || CUTOFF_DAY));
                app.mut((dd) => ({ ...dd, incomeCutoff: v }), true);
              }}
            />
          </div>
        )}
        <span style={"font-size:14px;color:" + (im === "fest" && noInc ? "var(--color-accent-700)" : "var(--color-neutral-700)")}>{note}</span>
      </section>
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Das Brutto braucht das Tool nur für die Krankengeld-Schätzung. Beamtinnen und Beamte erhalten kein Krankengeld.
      </p>
      {d.persons.map((p) => (
        <div
          key={p.id}
          style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-divider)"
        >
          <div class="field">
            <label>Name</label>
            <input class="input" value={p.name} onInput={(e) => upd(p.id, "name", val(e))} />
          </div>
          <div class="field">
            <label>Netto / Monat €</label>
            <input class="input" type="number" inputMode="decimal" value={(p.netto ?? "") as string} onInput={(e) => upd(p.id, "netto", numOrNull(e))} />
          </div>
          <div class="field">
            <label>Brutto / Monat €</label>
            <input class="input" type="number" inputMode="decimal" value={(p.brutto ?? "") as string} onInput={(e) => upd(p.id, "brutto", numOrNull(e))} />
          </div>
          <span style="grid-column:1 / -1;font-size:13px;color:var(--color-neutral-700)">
            {N(p.netto)
              ? "Vorschlag Elterngeld ca. " +
                f0(suggest(p, "Elterngeld (Basis)")) +
                (N(p.brutto) ? " · Krankengeld ca. " + f0(suggest(p, "Krankengeld")) : "")
              : "Netto eintragen für Vorschläge zu Elterngeld und Krankengeld"}
          </span>
        </div>
      ))}
      <div class="field" style="max-width:260px">
        <label>Kindergeld / Monat €</label>
        <input
          class="input"
          type="number"
          inputMode="decimal"
          value={(d.kindergeld ?? "") as string}
          onInput={(e) => {
            const v = val(e);
            app.mut((dd) => ({ ...dd, kindergeld: v === "" ? null : +v }), true);
          }}
          placeholder="z. B. 255"
        />
      </div>
    </main>
  );
}

export function PeriodsScreen({ c }: { c: Ctx }) {
  const { d, app } = c;
  const upd = (id: string, f: string, v: unknown) => app.upd("periods", id, f, v);
  const personOpts = [...d.persons.map((p) => ({ v: p.id, l: p.name })), { v: "H", l: "Haushalt" }];
  const addPeriod = (scen: boolean) =>
    app.mut(
      (dd) => ({
        ...dd,
        periods: [
          ...dd.periods,
          {
            id: uid(),
            person: "A",
            type: "Elterngeld (Basis)",
            from: addM(TODAY_YM(), scen ? 6 : 1),
            to: addM(TODAY_YM(), scen ? 17 : 12),
            amount: null,
            scen,
          },
        ],
      }),
      true,
    );
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Ein Zeitraum ersetzt das Netto der Person oder kommt als Zusatzeinkommen bzw. Zusatzausgabe hinzu. Ohne Betrag gilt der Vorschlag. „Geplant“
        zählt im Plan, „Szenario“ nur in der gestrichelten Linie.
      </p>
      {d.periods.map((q) => {
        const p = d.persons.find((x) => x.id === q.person);
        const sg = ADD_TYPES.includes(q.type) ? null : suggest(p, q.type);
        return (
          <div
            key={q.id}
            style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-divider)"
          >
            <div class="field" style="grid-column:1 / -1">
              <label>Art</label>
              <Seg
                name={"k" + q.id}
                options={[
                  { label: "Geplant", checked: !q.scen, onChange: () => upd(q.id, "scen", false) },
                  { label: "Szenario", checked: !!q.scen, onChange: () => upd(q.id, "scen", true) },
                ]}
              />
            </div>
            <div class="field">
              <label>Typ</label>
              <select
                class="input"
                value={q.type}
                onChange={(e) => {
                  const v = val(e);
                  app.mut(
                    (dd) => ({
                      ...dd,
                      periods: dd.periods.map((x) =>
                        x.id === q.id ? { ...x, type: v, person: ADD_TYPES.includes(v) ? "H" : x.person === "H" ? "A" : x.person } : x,
                      ),
                    }),
                    true,
                  );
                }}
              >
                {PERIOD_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div class="field">
              <label>Person</label>
              <select class="input" value={q.person} onChange={(e) => upd(q.id, "person", val(e))}>
                {personOpts.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <div class="field">
              <label>Von</label>
              <input class="input" type="month" value={q.from} onInput={(e) => upd(q.id, "from", val(e))} />
            </div>
            <div class="field">
              <label>Bis</label>
              <input class="input" type="month" value={q.to || ""} onInput={(e) => upd(q.id, "to", val(e))} />
            </div>
            <div class="field">
              <label>Betrag / Monat €</label>
              <input
                class="input"
                type="number"
                inputMode="decimal"
                value={(q.amount ?? "") as string}
                onInput={(e) => upd(q.id, "amount", numOrNull(e))}
                placeholder={sg != null ? "Vorschlag " + f0(sg) : "Betrag"}
              />
            </div>
            <div style="display:flex;align-items:flex-end">
              <button class="btn btn-ghost" onClick={() => app.mut((dd) => ({ ...dd, periods: dd.periods.filter((x) => x.id !== q.id) }), true)}>
                Entfernen
              </button>
            </div>
          </div>
        );
      })}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
        <button class="btn btn-primary" onClick={() => addPeriod(false)}>
          Geplanter Zeitraum
        </button>
        <button class="btn btn-secondary" onClick={() => addPeriod(true)}>
          Was-wäre-wenn
        </button>
      </div>
    </main>
  );
}

export function AccountsScreen({ c }: { c: Ctx }) {
  const { d, app, H, pPlan } = c;
  const endYM = addM(TODAY_YM(), H);
  const upd = (id: string, f: string, v: unknown) => app.upd("accounts", id, f, v);
  const del = (id: string) =>
    app.mut((dd) => {
      const accounts = dd.accounts.filter((x) => x.id !== id);
      const tot = accounts.filter((x) => x.kind !== "kredit").reduce((s, x) => s + (N(x.balance) || 0), 0);
      return { ...dd, accounts, snapshots: { ...dd.snapshots, [TODAY_YM()]: tot } };
    }, true);
  return (
    <main style="display:flex;flex-direction:column;gap:var(--space-6)">
      <p style="margin:0;font-size:14px;color:var(--color-neutral-700)">
        Jedes Konto bekommt monatlich seine Sparrate plus Rendite. Reicht das Sparpotenzial nicht, geht der Fehlbetrag vom Puffer-Konto ab.
      </p>
      {d.accounts.map((a) => {
        const isLoan = a.kind === "kredit";
        let summary: string;
        if (isLoan) {
          const lp = loanPlan(a, H);
          summary = lp.empty
            ? "Restschuld, Zins und Rate eintragen"
            : lp.never
              ? "Die Rate deckt die Zinsen nicht"
              : "Tilgung derzeit " +
                f0(lp.tilg) +
                " / Monat · " +
                ymLabel(endYM) +
                ": Restschuld " +
                f0(lp.balH) +
                " · abbezahlt " +
                (lp.paid ? "ca. " + ymLabel(lp.paid) : "nach über 60 Jahren");
        } else {
          const pa = pPlan.acc.find((x) => x.id === a.id) || ({} as { bal?: number; reached?: string | null });
          summary =
            ymLabel(endYM) +
            ": " +
            f0(pa.bal) +
            (N(a.target) > 0
              ? pa.reached
                ? pa.reached === TODAY_YM()
                  ? " · Ziel bereits erreicht"
                  : " · Ziel erreicht " + ymLabel(pa.reached)
                : " · Ziel nicht im Zeitraum"
              : "");
        }
        return (
          <div
            key={a.id}
            style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);padding-bottom:var(--space-4);border-bottom:1px solid var(--color-divider)"
          >
            <div class="field" style="grid-column:1 / -1">
              <label>{isLoan ? "Kredit" : "Konto / Sparziel"}</label>
              <input class="input" value={a.name} onInput={(e) => upd(a.id, "name", val(e))} placeholder="Name" />
            </div>
            {!isLoan && (
              <>
                <div class="field">
                  <label>Stand €</label>
                  <input class="input" type="number" inputMode="decimal" value={(a.balance ?? "") as string} onInput={(e) => upd(a.id, "balance", numOrNull(e))} />
                </div>
                <div class="field">
                  <label>Rendite % p.a.</label>
                  <input
                    class="input"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={(a.rate ?? "") as string}
                    onInput={(e) => upd(a.id, "rate", numOrNull(e))}
                  />
                </div>
                <div class="field">
                  <label>Ziel €</label>
                  <input
                    class="input"
                    type="number"
                    inputMode="decimal"
                    value={(a.target ?? "") as string}
                    onInput={(e) => upd(a.id, "target", numOrNull(e))}
                    placeholder="optional"
                  />
                </div>
              </>
            )}
            {isLoan && (
              <>
                <div class="field">
                  <label>Restschuld €</label>
                  <input class="input" type="number" inputMode="decimal" value={(a.debt ?? "") as string} onInput={(e) => upd(a.id, "debt", numOrNull(e))} />
                </div>
                <div class="field">
                  <label>Zins % p.a.</label>
                  <input
                    class="input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={(a.rate ?? "") as string}
                    onInput={(e) => upd(a.id, "rate", numOrNull(e))}
                  />
                </div>
                <div class="field">
                  <label>Rate / Monat €</label>
                  <input
                    class="input"
                    type="number"
                    inputMode="decimal"
                    value={(a.monthly ?? "") as string}
                    onInput={(e) => upd(a.id, "monthly", numOrNull(e))}
                  />
                </div>
              </>
            )}
            <span style={"grid-column:1 / -1;font-size:14px;" + num}>{summary}</span>
            <div style="grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:var(--space-4);align-items:center;justify-content:space-between">
              {!isLoan && (
                <label class="radio">
                  <input
                    type="radio"
                    name="puffer"
                    checked={!!a.puffer}
                    onChange={() => app.mut((dd) => ({ ...dd, accounts: dd.accounts.map((x) => ({ ...x, puffer: x.id === a.id })) }), true)}
                  />
                  <span class="dot"></span>Puffer-Konto
                </label>
              )}
              {isLoan && <span style="font-size:13px;color:var(--color-neutral-700)">Die Rate zusätzlich unter Fixkosten führen.</span>}
              <button class="btn btn-ghost" onClick={() => del(a.id)}>
                Entfernen
              </button>
            </div>
          </div>
        );
      })}
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
        <button
          class="btn btn-primary"
          onClick={() =>
            app.mut(
              (dd) => ({
                ...dd,
                accounts: [
                  ...dd.accounts,
                  {
                    id: uid(),
                    name: "",
                    balance: null,
                    rate: null,
                    monthly: null,
                    target: null,
                    puffer: !dd.accounts.some((a) => a.puffer && a.kind !== "kredit"),
                  },
                ],
              }),
              true,
            )
          }
        >
          Konto hinzufügen
        </button>
        <button
          class="btn btn-secondary"
          onClick={() =>
            app.mut(
              (dd) => ({ ...dd, accounts: [...dd.accounts, { id: uid(), kind: "kredit", name: "Hauskredit", debt: null, rate: null, monthly: null }] }),
              true,
            )
          }
        >
          Kredit hinzufügen
        </button>
      </div>
    </main>
  );
}
