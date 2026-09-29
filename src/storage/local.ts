// Speicherung auf diesem Gerät (localStorage des Browsers).
// Austauschbar: ein späterer Server-Abgleich kann dieselbe Schnittstelle nutzen.

import { emptyData, normalizeLoaded } from "../domain/data";
import type { Data } from "../domain/types";

/** Gleicher Schlüssel wie im Prototyp. */
const LS = "haushaltsbuch-v1";

export interface LocalStore {
  load(): Data;
  save(d: Data): void;
}

export const localStore: LocalStore = {
  load() {
    try {
      const raw = localStorage.getItem(LS);
      if (raw) return normalizeLoaded(JSON.parse(raw));
    } catch {
      /* beschädigter Stand: mit leerem Bestand starten */
    }
    return emptyData();
  },
  save(d) {
    localStorage.setItem(LS, JSON.stringify(d));
  },
};
