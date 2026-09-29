// Datums-Hilfen. "Heute" wird wie im Prototyp einmal beim Start festgelegt,
// lässt sich für Tests aber mit setNow() umstellen.

export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export const MONTHS_L = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export const pad2 = (n: number | string) => String(n).padStart(2, "0");

let _now = new Date();
let _today = "";
let _todayYM = "";
function recompute() {
  _today = _now.getFullYear() + "-" + pad2(_now.getMonth() + 1) + "-" + pad2(_now.getDate());
  _todayYM = _today.slice(0, 7);
}
recompute();

/** Nur für Tests und Vergleichsläufe: "heute" festlegen. */
export function setNow(d: Date) {
  _now = d;
  recompute();
}
/** Das beim Start festgelegte Datum (für Tagesanteile im laufenden Monat). */
export const nowDate = () => _now;
/** Heute als YYYY-MM-DD. */
export const TODAY = () => _today;
/** Aktueller Monat als YYYY-MM. */
export const TODAY_YM = () => _todayYM;

export const addM = (ym: string, n: number) => {
  let y = +ym.slice(0, 4),
    m = +ym.slice(5) + n;
  y += Math.floor((m - 1) / 12);
  m = ((((m - 1) % 12) + 12) % 12) + 1;
  return y + "-" + pad2(m);
};
export const mdiff = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5));
export const ymLabel = (ym: string) => MONTHS[+ym.slice(5) - 1] + " " + ym.slice(0, 4);
export const ymLong = (ym: string) => MONTHS_L[+ym.slice(5) - 1] + " " + ym.slice(0, 4);
export const dayDiff = (a: string, b: string) => Math.abs((+new Date(a) - +new Date(b)) / 864e5);

export const dLabel = (ds: string) => {
  const dt = new Date(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10));
  return (
    WD[dt.getDay()] +
    ", " +
    dt.getDate() +
    ". " +
    MONTHS[dt.getMonth()] +
    (ds.slice(0, 4) !== _today.slice(0, 4) ? " " + ds.slice(0, 4) : "")
  );
};

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Tag im Monat begrenzen und als Datum zurückgeben. */
export const clampD = (ym: string, day: string | number) => {
  const dim = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
  return ym + "-" + String(Math.min(Math.max(1, +day || 1), dim)).padStart(2, "0");
};
