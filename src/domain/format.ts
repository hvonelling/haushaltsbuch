// Zahlen- und Betragsformatierung (deutsches Format).

const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** Betrag ohne Nachkommastellen, z. B. "1.234 €". */
export const f0 = (v: number | null | undefined) => eur0.format(Math.round(v || 0));
/** Betrag mit Cent, z. B. "1.234,56 €". */
export const f2 = (v: number | null | undefined) => eur2.format(v || 0);
/** Kurzform für Diagrammachsen, z. B. "12 T€". */
export const short = (v: number) =>
  Math.abs(v) >= 1000
    ? (v / 1000).toLocaleString("de-DE", { maximumFractionDigits: Math.abs(v) >= 10000 ? 0 : 1 }) + " T€"
    : Math.round(v) + " €";

/** Wie der unäre Plus-Operator in JavaScript: wandelt Eingabewerte in Zahlen. */
export const N = (v: unknown): number => Number(v);

/** Betrag aus einem Bank-CSV ("-1.234,56 €") lesen. */
export function parseAmt(s: unknown): number {
  return (
    parseFloat(
      String(s)
        .replace(/[^\d,.-]/g, "")
        .replace(/\./g, "")
        .replace(",", "."),
    ) || 0
  );
}

/** Betrag aus einem Eingabefeld lesen; leer oder ungültig ergibt "". */
export const pNum = (v: unknown): number | "" => {
  const n = parseFloat(
    String(v)
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return isNaN(n) ? "" : n;
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const cleanIban = (s: string | null | undefined) => (s || "").replace(/\s/g, "").toUpperCase();
