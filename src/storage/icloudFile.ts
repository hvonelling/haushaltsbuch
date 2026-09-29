// Abgleich über eine gemeinsame Datei "haushaltsbuch.json" (z. B. in iCloud Drive).
// Browser dürfen iCloud nicht selbst lesen oder schreiben. Deshalb:
// Laden = Datei auswählen, Sichern = Teilen-Dialog (iPhone) bzw. Download (Rechner).

import { toBackup } from "../domain/data";
import type { Data } from "../domain/types";

export const FILE_NAME = "haushaltsbuch.json";

export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/** Ausgewählte Dateien als Text lesen (UTF-8, notfalls Windows-1252). */
export async function readFiles(files: FileList | null, decode: (b: ArrayBuffer) => string): Promise<string[]> {
  const fs = [...(files || [])];
  return Promise.all(fs.map((f) => f.arrayBuffer().then(decode)));
}

/**
 * Stand als Datei sichern. Auf dem iPhone öffnet sich der Teilen-Dialog
 * ("In Dateien sichern"), am Rechner startet ein Download.
 * Gibt false zurück, wenn der Dialog abgebrochen wurde.
 */
export async function saveBackupFile(d: Data, now: number): Promise<boolean> {
  const json = JSON.stringify(toBackup({ ...d, savedAt: now }, now));
  const file = new File([json], FILE_NAME, { type: "application/json" });
  if (isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Haushaltsbuch" });
    } catch (e) {
      if (e && (e as Error).name === "AbortError") return false;
      throw new Error("Teilen fehlgeschlagen: " + (e as Error).message);
    }
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return true;
}
