// Sicherungsdatei ver- oder entschlüsseln.
//
//   npm run encrypt -- <eingabe.json> <ausgabe.enc.json>
//   npm run encrypt -- <eingabe.json> <ausgabe.enc.json> --neues-passwort <passwort.txt>
//   npm run decrypt -- <eingabe.enc.json> <ausgabe.json>
//
// Passwort: aus der Umgebungsvariable HB_PASSWORD oder verdeckt abgefragt.
// Mit --neues-passwort wird ein zufälliges Passwort erzeugt und nur in die angegebene Datei geschrieben.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { decryptText, encryptText, randomPassword, type EncryptedFile } from "../src/storage/crypto";

function askHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(label);
    let pw = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(pw);
      } else if (ch === "\u0003") process.exit(1);
      else if (ch === "\u007f" || ch === "\b") pw = pw.slice(0, -1);
      else pw += ch;
    };
    stdin.on("data", onData);
  });
}

async function password(confirm: boolean): Promise<string> {
  if (process.env.HB_PASSWORD) return process.env.HB_PASSWORD;
  const a = await askHidden("Passwort: ");
  if (confirm && a !== (await askHidden("Passwort wiederholen: "))) throw new Error("Passwörter stimmen nicht überein.");
  return a;
}

async function main() {
  const [mode, input, output, flag, pwFile] = process.argv.slice(2);
  if (!input || !output || !["encrypt", "decrypt"].includes(mode)) {
    console.log("Aufruf: npm run encrypt -- <eingabe.json> <ausgabe.enc.json> [--neues-passwort <datei>]");
    console.log("        npm run decrypt -- <eingabe.enc.json> <ausgabe.json>");
    process.exit(1);
  }
  if (existsSync(output)) throw new Error("Ausgabedatei existiert schon: " + output);
  const text = readFileSync(input, "utf-8");

  if (mode === "decrypt") {
    const plain = await decryptText(JSON.parse(text) as EncryptedFile, await password(false));
    writeFileSync(output, plain);
    console.log("Entschlüsselt nach " + output);
    return;
  }

  const j = JSON.parse(text);
  if (!Array.isArray((j.data || j).tx)) throw new Error("Eingabe ist keine Haushaltsbuch-Sicherung.");
  let pw: string;
  if (flag === "--neues-passwort") {
    if (!pwFile) throw new Error("Bitte eine Datei für das neue Passwort angeben.");
    if (existsSync(pwFile)) throw new Error("Passwortdatei existiert schon: " + pwFile);
    pw = randomPassword();
  } else pw = await password(true);

  const enc = await encryptText(text, pw);
  // Gegenprobe: muss exakt den Ausgangstext ergeben.
  if ((await decryptText(enc, pw)) !== text) throw new Error("Gegenprobe fehlgeschlagen – nichts geschrieben.");
  // Erst nach erfolgreicher Gegenprobe schreiben: zuerst das Passwort, dann die Datei.
  if (flag === "--neues-passwort") writeFileSync(pwFile, pw + "\n");
  writeFileSync(output, JSON.stringify(enc, null, 1) + "\n");
  const n = (j.data || j).tx.length;
  console.log(`Verschlüsselt: ${n} Buchungen, ${text.length} → ${JSON.stringify(enc).length} Zeichen. Gegenprobe erfolgreich.`);
  if (flag === "--neues-passwort") console.log("Neues Passwort steht in " + pwFile + " (nicht angezeigt).");
}

main().catch((e) => {
  console.error("Fehler: " + (e as Error).message);
  process.exit(1);
});
