/** Passwortverschlüsselung für Sicherungen: AES-256-GCM, Schlüssel per PBKDF2 (SHA-256). Läuft im Gerät (Web Crypto). */
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 250_000;

const toB64 = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytes = (u: Uint8Array) => u.slice().buffer as ArrayBuffer; // eigener ArrayBuffer (Typen/Browser)

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface Cipher { kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; data: string }

export async function encryptText(text: string, password: string): Promise<Cipher> {
  if (!cryptoAvailable()) throw new Error('Verschlüsselung ist in diesem Browser nicht verfügbar.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(enc.encode(text))));
  return { kdf: 'PBKDF2-SHA256', iter: ITER, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

export async function decryptText(c: Cipher, password: string): Promise<string> {
  if (!cryptoAvailable()) throw new Error('Entschlüsselung ist in diesem Browser nicht verfügbar.');
  try {
    const key = await deriveKey(password, fromB64(c.salt), c.iter);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(fromB64(c.iv)) }, key, bytes(fromB64(c.data)));
    return dec.decode(plain);
  } catch {
    throw new Error('Das Passwort ist falsch oder die Datei ist beschädigt.');
  }
}

/** Zufälliges Salz + Hash für die PIN-Sperre (PBKDF2, 100.000 Runden). */
export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: 100_000, hash: 'SHA-256' }, base, 256);
  return { hash: toB64(new Uint8Array(bits)), salt: toB64(salt) };
}
