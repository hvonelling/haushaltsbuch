// Tests der Verschlüsselung mit erfundenen Daten.
import { describe, expect, it } from "vitest";
import { emptyData, toBackup } from "../src/domain/data";
import { decryptText, encryptText, isEncrypted, randomPassword } from "../src/storage/crypto";

const sample = () => {
  const d = emptyData();
  d.tx = Array.from({ length: 300 }, (_, i) => ({
    id: "t" + i, date: "2026-09-01", payee: "Beispiel " + (i % 7), purpose: "Einkauf", amount: -i,
    cat: "Sonstiges", manual: false, src: "DKB", acct: "DKB", note: "Umlaute äöüß €",
  }));
  return JSON.stringify(toBackup(d, 0));
};

describe("Verschlüsselte Sicherung", () => {
  it("ver- und entschlüsselt verlustfrei, Inhalt ist nicht lesbar", async () => {
    const plain = sample();
    const enc = await encryptText(plain, "geheim-1234");
    expect(isEncrypted(enc)).toBe(true);
    expect(JSON.stringify(enc)).not.toContain("Beispiel");
    expect(enc.data.length).toBeLessThan(plain.length / 3); // komprimiert
    expect(await decryptText(enc, "geheim-1234")).toBe(plain);
  }, 20000);

  it("erkennt falsches Passwort und veränderte Dateien", async () => {
    const enc = await encryptText(sample(), "richtig");
    await expect(decryptText(enc, "falsch")).rejects.toThrow("Falsches Passwort");
    const c = enc.data.split("");
    c[10] = c[10] === "A" ? "B" : "A";
    await expect(decryptText({ ...enc, data: c.join("") }, "richtig")).rejects.toThrow("Falsches Passwort");
  }, 20000);

  it("nutzt jedes Mal neues Salz und neuen IV", async () => {
    const a = await encryptText("x", "p"), b = await encryptText("x", "p");
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
  }, 20000);

  it("erzeugt gut tippbare Zufallspasswörter", () => {
    const p = randomPassword();
    expect(p).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){4}$/);
    expect(randomPassword()).not.toBe(p);
  });
});
