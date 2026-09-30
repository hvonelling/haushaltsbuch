// Automatischer Abgleich über eine verschlüsselte Datei in einem privaten GitHub-Repo.
//
// Ablauf: Datei holen → entschlüsseln → mit dem Stand dieses Geräts zusammenführen →
// nur wenn sich etwas geändert hat, verschlüsselt zurückschreiben (ein Commit).
// Hat das andere Gerät zwischendurch geschrieben, lehnt GitHub ab (veralteter sha);
// dann beginnt der Ablauf von vorn.

import { mergeBackup, parseBackup, toBackup } from "../domain/data";
import type { Data } from "../domain/types";
import { decryptText, encryptText, isEncrypted } from "./crypto";

export interface GitHubConfig {
  /** "besitzer/repo" */
  repo: string;
  /** Pfad der Datei im Repo */
  path: string;
  /** Fine-grained Token mit Contents: Read and write, nur für dieses Repo */
  token: string;
  /** Passwort der verschlüsselten Datei */
  password: string;
  lastSync?: number;
  lastErr?: string | null;
}

export const DEFAULT_PATH = "haushaltsbuch.enc.json";
const KEY = "haushaltsbuch-github";

/** Einstellungen nur auf diesem Gerät speichern – nie in der Haushaltsdatei. */
export const githubConfig = {
  load(): GitHubConfig | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as GitHubConfig) : null;
    } catch {
      return null;
    }
  },
  save(c: GitHubConfig | null) {
    try {
      if (c) localStorage.setItem(KEY, JSON.stringify(c));
      else localStorage.removeItem(KEY);
    } catch {
      /* Speicher nicht verfügbar */
    }
  },
};

export class ConflictError extends Error {}

type Fetch = typeof fetch;

function api(cfg: GitHubConfig, f: Fetch, method: string, body?: unknown) {
  const path = cfg.path.split("/").map(encodeURIComponent).join("/");
  return f(`https://api.github.com/repos/${cfg.repo.trim()}/contents/${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + cfg.token.trim(),
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function errorFor(r: Response): Promise<Error> {
  if (r.status === 401) return new Error("Zugangsschlüssel ungültig oder abgelaufen.");
  if (r.status === 403) return new Error("Zugangsschlüssel darf dieses Repo nicht lesen oder schreiben (Contents: Read and write nötig).");
  if (r.status === 404) return new Error("Repo nicht gefunden oder der Zugangsschlüssel hat keinen Zugriff darauf.");
  if (r.status === 409 || r.status === 422) return new ConflictError("Datei wurde zwischendurch geändert.");
  const j = await r.json().catch(() => ({}));
  return new Error("GitHub: " + (j.message || "Fehler " + r.status));
}

/** Datei lesen. null = Datei existiert (noch) nicht. */
export async function getFile(cfg: GitHubConfig, f: Fetch = fetch): Promise<{ sha: string; text: string } | null> {
  const r = await api(cfg, f, "GET");
  if (r.status === 404) {
    // Unterscheiden: fehlt die Datei oder das ganze Repo?
    const repo = await f(`https://api.github.com/repos/${cfg.repo.trim()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token.trim() },
    });
    if (repo.ok) return null;
    throw await errorFor(repo);
  }
  if (!r.ok) throw await errorFor(r);
  const j = await r.json();
  let b64 = (j.content || "") as string;
  if (!b64 && j.git_url) {
    // Dateien über 1 MB liefert GitHub nur über die Blob-Schnittstelle.
    const br = await f(j.git_url, { cache: "no-store", headers: { Authorization: "Bearer " + cfg.token.trim() } });
    if (!br.ok) throw await errorFor(br);
    b64 = (await br.json()).content || "";
  }
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return { sha: j.sha, text: new TextDecoder().decode(bytes) };
}

/** Datei schreiben. sha = Stand, auf dem die Änderung beruht (null = neu anlegen). */
export async function putFile(cfg: GitHubConfig, text: string, sha: string | null, message: string, f: Fetch = fetch): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await api(cfg, f, "PUT", { message, content: btoa(bin), ...(sha ? { sha } : {}) });
  if (!r.ok) throw await errorFor(r);
  return (await r.json()).content.sha;
}

// Vergleich ohne Zeitstempel und unabhängig von der Reihenfolge,
// damit nicht bei jedem Öffnen ein neuer Commit entsteht.
const VOLATILE = new Set(["changedAt", "savedAt", "syncedAt"]);
function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).sort().join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .filter((k) => !VOLATILE.has(k) && (v as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export const sameContent = (a: Data, b: Data) => canon(a) === canon(b);

export interface SyncResult {
  d: Data;
  pushed: boolean;
  /** Buchungen, die vom anderen Gerät dazugekommen sind */
  added: number;
  newFixed: number;
}

/** Ein Abgleich-Durchgang. Wirft ConflictError, wenn das andere Gerät gerade geschrieben hat. */
export async function syncOnce(local: Data, cfg: GitHubConfig, f: Fetch = fetch, now = Date.now()): Promise<SyncResult> {
  const remote = await getFile(cfg, f);
  let merged = local,
    remoteData: Data | null = null,
    added = 0,
    newFixed = 0;
  if (remote) {
    let j: unknown;
    try {
      j = JSON.parse(remote.text);
    } catch {
      throw new Error("Die Datei im Repo ist keine gültige Haushaltsbuch-Datei.");
    }
    if (!isEncrypted(j)) throw new Error("Die Datei im Repo ist nicht verschlüsselt. Bitte nur die verschlüsselte Datei ablegen.");
    remoteData = parseBackup(await decryptText(j, cfg.password));
    const r = mergeBackup(local, remoteData);
    merged = r.d;
    added = Math.max(0, merged.tx.length - local.tx.length);
    newFixed = r.newFixed;
  } else {
    // Auch ohne Datei denselben Weg nehmen, damit der gespeicherte Stand
    // genau dem entspricht, was ein späterer Abgleich erzeugt.
    merged = mergeBackup(local, local).d;
  }
  const out: Data = { ...merged, savedAt: now, syncedAt: now };
  const pushed = !remoteData || !sameContent(merged, remoteData);
  if (pushed) {
    const enc = await encryptText(JSON.stringify(toBackup(out, now)), cfg.password);
    const stamp = new Date(now).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    await putFile(cfg, JSON.stringify(enc, null, 1) + "\n", remote ? remote.sha : null, "Abgleich " + stamp, f);
  }
  return { d: out, pushed, added, newFixed };
}

/** Abgleich mit bis zu drei Versuchen bei gleichzeitigen Änderungen. */
export async function sync(local: Data, cfg: GitHubConfig, f: Fetch = fetch): Promise<SyncResult> {
  for (let i = 0; ; i++) {
    try {
      return await syncOnce(local, cfg, f);
    } catch (e) {
      if (!(e instanceof ConflictError) || i >= 2) throw e;
    }
  }
}
