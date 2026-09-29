// Verschlüsselte Sicherungsdatei für die Ablage in einem (privaten) Git-Repo.
// Läuft im Browser und in Node gleich (Web Crypto + CompressionStream).
//
// Verfahren: Passwort → Schlüssel per PBKDF2-SHA-256 (600.000 Runden, zufälliges Salz),
// Inhalt gzip-komprimiert und mit AES-256-GCM verschlüsselt (zufälliger IV).
// GCM erkennt jede Veränderung der Datei und ein falsches Passwort.

export const ENC_FORMAT = "haushaltsbuch-enc-v1";
const ITERATIONS = 600_000;

export interface EncryptedFile {
  app: "haushaltsbuch";
  format: typeof ENC_FORMAT;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  compression: "gzip";
  data: string;
}

const subtle = () => globalThis.crypto.subtle;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Text (die Sicherungsdatei als JSON) verschlüsseln. */
export async function encryptText(plain: string, password: string): Promise<EncryptedFile> {
  if (!password) throw new Error("Kein Passwort angegeben.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const packed = await pipe(new TextEncoder().encode(plain), new CompressionStream("gzip"));
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, packed as BufferSource));
  return {
    app: "haushaltsbuch",
    format: ENC_FORMAT,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: "AES-GCM", iv: b64(iv) },
    compression: "gzip",
    data: b64(ct),
  };
}

/** Ist dieser Dateiinhalt eine verschlüsselte Sicherung? */
export function isEncrypted(j: unknown): j is EncryptedFile {
  return !!j && typeof j === "object" && (j as EncryptedFile).format === ENC_FORMAT;
}

/** Verschlüsselte Sicherung entschlüsseln. Wirft bei falschem Passwort oder veränderter Datei. */
export async function decryptText(file: EncryptedFile, password: string): Promise<string> {
  if (!isEncrypted(file)) throw new Error("Keine verschlüsselte Haushaltsbuch-Datei.");
  const key = await deriveKey(password, unb64(file.kdf.salt), file.kdf.iterations);
  let packed: Uint8Array;
  try {
    packed = new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv: unb64(file.cipher.iv) as BufferSource }, key, unb64(file.data) as BufferSource),
    );
  } catch {
    throw new Error("Falsches Passwort oder beschädigte Datei.");
  }
  return new TextDecoder().decode(await pipe(packed, new DecompressionStream("gzip")));
}

/** Zufälliges, gut tippbares Passwort (5 Vierergruppen, ca. 99 Bit). */
export function randomPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne leicht verwechselbare Zeichen
  const out: string[] = [];
  const buf = new Uint32Array(20);
  globalThis.crypto.getRandomValues(buf);
  for (let g = 0; g < 5; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += abc[buf[g * 4 + i] % abc.length];
    out.push(s);
  }
  return out.join("-");
}
