// Setzt die Bildschirme zusammen: Kopfzeile, aktiver Bereich, Dialoge, Navigation.

import { TODAY } from "../domain/dates";
import { AddDialog } from "../screens/AddDialog";
import { CalendarScreen, EventDialog } from "../screens/Calendar";
import { Categories, CategoryDetail } from "../screens/Categories";
import { FixedScreen, FixLinkDialog } from "../screens/Fixed";
import { AssumptionsScreen, BankAskDialog, BankScreen, GitHubScreen, HelpScreen, IbansScreen, ImportScreen, MoreScreen, RulesScreen } from "../screens/More";
import { Overview } from "../screens/Overview";
import { AccountsScreen, IncomeScreen, PeriodsScreen, PlanningScreen } from "../screens/Planning";
import { PotsScreen } from "../screens/Pots";
import { Transactions, TxDialog } from "../screens/Transactions";
import type { App } from "./App";
import { buildCtx, type Ctx } from "./ctx";
import { TABL, VIEWS, type Tab } from "./state";

function Body({ c }: { c: Ctx }) {
  const { s } = c;
  switch (s.view) {
    case "cat":
      return <CategoryDetail c={c} />;
    case "kategorien":
      return <Categories c={c} />;
    case "toepfe":
      return <PotsScreen c={c} />;
    case "einkommen":
      return <IncomeScreen c={c} />;
    case "zeitraeume":
      return <PeriodsScreen c={c} />;
    case "konten":
      return <AccountsScreen c={c} />;
    case "fixkosten":
      return <FixedScreen c={c} />;
    case "kalender":
      return <CalendarScreen c={c} />;
    case "import":
      return <ImportScreen c={c} />;
    case "bank":
      return <BankScreen c={c} />;
    case "ibans":
      return <IbansScreen c={c} />;
    case "regeln":
      return <RulesScreen c={c} />;
    case "annahmen":
      return <AssumptionsScreen c={c} />;
    case "hilfe":
      return <HelpScreen />;
    case "github":
      return <GitHubScreen c={c} />;
  }
  switch (s.tab) {
    case "uebersicht":
      return <Overview c={c} />;
    case "buchungen":
      return <Transactions c={c} />;
    case "planung":
      return <PlanningScreen c={c} />;
    case "mehr":
      return <MoreScreen c={c} />;
  }
}

const TAB_ICONS: Record<Tab, preact.JSX.Element> = {
  uebersicht: (
    <>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path>
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    </>
  ),
  buchungen: (
    <>
      <path d="M3 12h.01"></path>
      <path d="M3 18h.01"></path>
      <path d="M3 6h.01"></path>
      <path d="M8 12h13"></path>
      <path d="M8 18h13"></path>
      <path d="M8 6h13"></path>
    </>
  ),
  planung: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16"></path>
      <path d="m19 9-5 5-4-4-3 3"></path>
    </>
  ),
  mehr: (
    <>
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </>
  ),
};

function TabButton({ c, tab }: { c: Ctx; tab: Tab }) {
  return (
    <button
      onClick={() => c.go(tab, null)}
      style={
        "all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding:var(--space-2) 0;min-height:52px;color:" +
        (c.s.tab === tab ? "var(--color-accent-700)" : "var(--color-neutral-700)")
      }
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        {TAB_ICONS[tab]}
      </svg>
      <span style="font-size:12px">{TABL[tab]}</span>
    </button>
  );
}

export function renderApp(app: App) {
  const c = buildCtx(app);
  const { s } = c;
  const vt = s.view ? VIEWS[s.view] : null;
  const backLabel = s.view === "cat" ? TABL[s.tab] : vt ? TABL[vt[1] as Tab] || TABL[s.tab] : "";
  const viewTitle = s.view === "cat" ? s.anCat : vt ? vt[0] : "";
  return (
    <>
      <div style="max-width:760px;margin:0 auto;padding:var(--space-6) var(--space-4) 120px;display:flex;flex-direction:column;gap:var(--space-8)">
        {!!s.msg && (
          <div style="display:flex;gap:var(--space-3);align-items:center;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--color-accent)">
            <span style="font-size:14px">{s.msg}</span>
            <button class="btn btn-ghost" onClick={() => app.setState({ msg: "" })}>
              OK
            </button>
          </div>
        )}
        {!!s.view && (
          <div style="display:flex;flex-direction:column;gap:var(--space-1)">
            <div>
              <button
                class="btn btn-ghost"
                onClick={() => {
                  app.setState({ view: null });
                  window.scrollTo(0, 0);
                }}
                style="padding-left:0"
              >
                ‹ {backLabel}
              </button>
            </div>
            <h1 style="margin:0;font-size:38px">{viewTitle}</h1>
          </div>
        )}
        <Body c={c} />
      </div>

      <nav style="position:fixed;left:0;right:0;bottom:0;z-index:45;background:var(--color-bg);border-top:1px solid var(--color-divider);padding-bottom:env(safe-area-inset-bottom)">
        <div style="max-width:760px;margin:0 auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) 76px repeat(2,minmax(0,1fr));align-items:center">
          <TabButton c={c} tab="uebersicht" />
          <TabButton c={c} tab="buchungen" />
          <div style="display:flex;justify-content:center">
            <button
              class="fab"
              onClick={() => app.setState((x) => ({ addOpen: true, qa: { ...x.qa, date: TODAY() } }))}
              aria-label="Buchen"
              style="width:56px;height:56px;margin-top:-22px;border-radius:50%;border:1px solid var(--color-accent);background:var(--color-bg);color:var(--color-accent-700);cursor:pointer;box-shadow:var(--shadow-md);display:flex;align-items:center;justify-content:center"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14"></path>
                <path d="M12 5v14"></path>
              </svg>
            </button>
          </div>
          <TabButton c={c} tab="planung" />
          <TabButton c={c} tab="mehr" />
        </div>
      </nav>

      {s.addOpen && <AddDialog c={c} />}
      {!!s.evAsk && <EventDialog c={c} />}
      {!!s.askOpen && <BankAskDialog c={c} />}
      {!!s.fixLink && <FixLinkDialog c={c} />}
      {!!s.txSel && <TxDialog c={c} />}
    </>
  );
}
