// Kleine Oberflächen-Einstellungen, die pro Gerät gemerkt werden (nicht abgeglichen).

const KEY = "haushaltsbuch-ui";

export interface UiPrefs {
  potsOpen?: boolean;
  soonOpen?: boolean;
}

export const uiPrefs = {
  load(): UiPrefs {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") as UiPrefs;
    } catch {
      return {};
    }
  },
  save(p: UiPrefs) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};
