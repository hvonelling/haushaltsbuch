// Wiederkehrende Oberflächen-Bausteine (Stil wie im Prototyp).

import type { ComponentChildren, JSX } from "preact";

type Handler = () => void;

/** Goldumrandete Hinweiszeile mit Pfeil, z. B. "3 neu erkannte Fixkosten – prüfen ›". */
export function AlertRow(p: { text: string; onClick: Handler }) {
  return (
    <button
      onClick={p.onClick}
      style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-top:1px solid var(--color-accent);border-bottom:1px solid var(--color-accent);color:var(--color-accent-700);min-height:48px"
    >
      <span>{p.text}</span>
      <span>›</span>
    </button>
  );
}

/** Große Navigationszeile (Planung, Mehr). */
export function NavRow(p: { label: string; value: string; onClick: Handler; tabular?: boolean }) {
  return (
    <button
      onClick={p.onClick}
      style="all:unset;box-sizing:border-box;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-4) 0;border-bottom:1px solid var(--color-divider);min-height:56px"
    >
      <span style="font-family:var(--font-heading);font-weight:600;font-size:20px">{p.label}</span>
      <span
        style={
          "font-size:14px;color:var(--color-neutral-700);text-align:right" + (p.tabular ? ";font-variant-numeric:tabular-nums" : "")
        }
      >
        {p.value}
        {"  ›"}
      </span>
    </button>
  );
}

/** Umschalter mit zwei oder drei Optionen (Segmented Control). */
export function Seg(p: { name: string; options: { label: string; checked: boolean; onChange: Handler }[] }) {
  return (
    <div class="seg">
      {p.options.map((o) => (
        <label class="seg-opt" key={o.label}>
          <input
            type="radio"
            name={p.name}
            checked={o.checked}
            onChange={o.onChange}
            style="position:absolute;opacity:0;pointer-events:none"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Dialog-Blatt, das von unten hereinkommt. Tipp auf den Hintergrund schließt. */
export function Sheet(p: { label: string; onClose: Handler; gap?: string; children: ComponentChildren }) {
  const bg = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) p.onClose();
  };
  return (
    <div
      class="dialog-backdrop"
      onClick={bg}
      style="position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;padding:0"
    >
      <div
        class="dialog"
        role="dialog"
        aria-label={p.label}
        style={
          "width:100%;max-width:560px;max-height:92vh;overflow-y:auto;display:flex;flex-direction:column;gap:" +
          (p.gap || "var(--space-3)") +
          ";padding:var(--space-6) var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom));border-radius:var(--radius-lg) var(--radius-lg) 0 0"
        }
      >
        {p.children}
      </div>
    </div>
  );
}

/** Kopfzeile eines Dialogs mit Titel und Schließen-Knopf. */
export function SheetHead(p: { title: string; closeLabel: string; onClose: Handler }) {
  return (
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3)">
      <h3 style="margin:0;font-size:26px;min-width:0;overflow-wrap:anywhere">{p.title}</h3>
      <button class="btn btn-ghost" onClick={p.onClose}>
        {p.closeLabel}
      </button>
    </div>
  );
}

/** Auswahl-Zeile in Dialogen (Kandidaten-Buchungen). */
export function PickRow(p: { payee: string; amt: string; sub: string; onClick: Handler }) {
  return (
    <button
      onClick={p.onClick}
      style="all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider);min-height:48px"
    >
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{p.payee}</span>
      <span style="font-variant-numeric:tabular-nums">
        {p.amt}
        {"  ›"}
      </span>
      <span style="grid-column:1 / -1;font-size:13px;color:var(--color-neutral-700)">{p.sub}</span>
    </button>
  );
}

export const kicker = "font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-700)";
export const muted13 = "font-size:13px;color:var(--color-neutral-700)";
export const muted14 = "margin:0;font-size:14px;color:var(--color-neutral-700)";

/** Wert eines Eingabefelds lesen. */
export const val = (e: Event) => (e.target as HTMLInputElement).value;
/** Zahl aus einem Zahlenfeld: leer = null. */
export const numOrNull = (e: Event) => {
  const v = val(e);
  return v === "" ? null : +v;
};
export const checked = (e: Event) => (e.target as HTMLInputElement).checked;
