// Tests des GitHub-Abgleichs gegen ein simuliertes GitHub (erfundene Daten).
import { describe, expect, it } from "vitest";
import { emptyData } from "../src/domain/data";
import type { Data, Tx } from "../src/domain/types";
import { sameContent, sync, type GitHubConfig } from "../src/storage/github";

/** Minimales GitHub: eine Datei mit sha, prüft Token und sha wie die echte Schnittstelle. */
function fakeGitHub(token = "tok") {
  const st = { sha: null as string | null, content: "", commits: 0 };
  let n = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const f = (async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== "Bearer " + token) return json(401, { message: "Bad credentials" });
    if (url.endsWith("/repos/me/daten")) return json(200, {});
    if (!url.includes("/repos/me/daten/contents/")) return json(404, { message: "Not Found" });
    if (!init?.method || init.method === "GET") {
      if (!st.sha) return json(404, { message: "Not Found" });
      return json(200, { sha: st.sha, content: st.content.replace(/(.{60})/g, "$1\n") });
    }
    // PUT
    const b = JSON.parse(String(init.body));
    if ((b.sha || null) !== st.sha) return json(409, { message: "sha mismatch" });
    st.sha = "sha" + ++n;
    st.content = b.content;
    st.commits++;
    return json(200, { content: { sha: st.sha } });
  }) as typeof fetch;
  return { f, st };
}

const cfg: GitHubConfig = { repo: "me/daten", path: "haushaltsbuch.enc.json", token: "tok", password: "pw" };
const tx = (id: string, payee: string): Tx => ({
  id, date: "2026-09-10", payee, purpose: "", amount: -10, cat: null, manual: false, src: "Manuell", acct: "Bar/Manuell", editedAt: 1,
});
const withTx = (d: Data, ...t: Tx[]): Data => ({ ...d, tx: [...d.tx, ...t] });

describe("GitHub-Abgleich", () => {
  it("legt die Datei an, wenn sie fehlt, und schreibt nur bei Änderungen", async () => {
    const gh = fakeGitHub();
    const a = await sync(withTx(emptyData(), tx("1", "Bäcker")), cfg, gh.f);
    expect(a.pushed).toBe(true);
    expect(gh.st.commits).toBe(1);
    expect(atob(gh.st.content)).not.toContain("Bäcker"); // verschlüsselt
    const b = await sync(a.d, cfg, gh.f);
    expect(b.pushed).toBe(false);
    expect(gh.st.commits).toBe(1);
  }, 30000);

  it("zwei Geräte: beide Buchungen landen auf beiden Geräten", async () => {
    const gh = fakeGitHub();
    const base = (await sync(emptyData(), cfg, gh.f)).d;
    let A = withTx(base, tx("a", "Kino"));
    let B = withTx(base, tx("b", "Zoo"));
    A = (await sync(A, cfg, gh.f)).d;
    const rb = await sync(B, cfg, gh.f);
    B = rb.d;
    expect(rb.added).toBe(1);
    A = (await sync(A, cfg, gh.f)).d;
    expect(A.tx.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(B.tx.map((t) => t.id).sort()).toEqual(["a", "b"]);
    // danach kein Hin und Her mehr
    const commits = gh.st.commits;
    await sync(A, cfg, gh.f);
    await sync(B, cfg, gh.f);
    expect(gh.st.commits).toBe(commits);
  }, 30000);

  it("ein Gerät mit altem Stand überschreibt nichts, sondern führt zusammen", async () => {
    const gh = fakeGitHub();
    const base = (await sync(emptyData(), cfg, gh.f)).d;
    const other = (await sync(withTx(base, tx("x", "Andere")), cfg, gh.f)).d;
    await sync(withTx(other, tx("y", "Noch eine")), cfg, gh.f);
    // Gerät A kennt nur den Ausgangsstand und hat selbst etwas gebucht:
    const A = await sync(withTx(base, tx("z", "Mein")), cfg, gh.f);
    expect(A.d.tx.map((t) => t.id).sort()).toEqual(["x", "y", "z"]);
    const again = await sync(withTx(base), cfg, gh.f);
    expect(again.d.tx.map((t) => t.id).sort()).toEqual(["x", "y", "z"]);
  }, 30000);

  it("wiederholt bei veraltetem Stand (409) automatisch", async () => {
    const gh = fakeGitHub();
    await sync(withTx(emptyData(), tx("1", "A")), cfg, gh.f);
    let raced = false;
    const racing = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT" && !raced) {
        raced = true;
        gh.st.sha = "fremd"; // anderes Gerät hat eben geschrieben
      }
      return gh.f(url, init);
    }) as typeof fetch;
    const r = await sync(withTx(emptyData(), tx("2", "B")), cfg, racing);
    expect(r.pushed).toBe(true);
    expect(raced).toBe(true);
  }, 30000);

  it("meldet falschen Schlüssel und falsches Passwort verständlich", async () => {
    const gh = fakeGitHub();
    await sync(withTx(emptyData(), tx("1", "A")), cfg, gh.f);
    await expect(sync(emptyData(), { ...cfg, token: "falsch" }, gh.f)).rejects.toThrow("Zugangsschlüssel ungültig");
    await expect(sync(emptyData(), { ...cfg, password: "falsch" }, gh.f)).rejects.toThrow("Falsches Passwort");
    await expect(sync(emptyData(), { ...cfg, repo: "me/fehlt" }, gh.f)).rejects.toThrow("Repo nicht gefunden");
  }, 30000);

  it("vergleicht Inhalte unabhängig von Reihenfolge und Zeitstempeln", () => {
    const a = withTx(emptyData(), tx("1", "A"), tx("2", "B"));
    const b = { ...withTx(emptyData(), tx("2", "B"), tx("1", "A")), changedAt: 99, savedAt: 5 };
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(a, withTx(emptyData(), tx("1", "A")))).toBe(false);
  });
});
