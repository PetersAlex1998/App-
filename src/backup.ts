import { Platform, Share } from 'react-native';
import { Cipher, decryptText, encryptText } from './crypto';
import { shareFiles } from './dispatch';
import { SCHEMA_VERSION } from './repo';
import { DB, emptyDB } from './types';
import type { Settings } from './settings';
import { blobToDataUrl, dataUrlToBlob, filesSupported, getBlob, putBlob } from './files';

const KEYS = Object.keys(emptyDB) as (keyof DB)[];

export function serialize(db: DB, settings?: Settings, files?: Record<string, string>): string {
  return JSON.stringify({ app: 'immo-verwaltung', version: 4, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: db, settings, files }, null, files ? undefined : 2);
}

/** Prüft den Inhalt einer Sicherung und liefert die Daten, oder wirft einen verständlichen Fehler. */
export class EncryptedBackupError extends Error {
  constructor() { super('Diese Sicherung ist mit einem Passwort verschlüsselt. Gib das Passwort ein und wähle sie erneut.'); }
}
export const isEncryptedBackup = (text: string) => { try { const r = JSON.parse(text); return r?.app === 'immo-verwaltung' && r.encrypted === true && !!r.cipher; } catch { return false; } };

/** Sicherung lesen, bei Bedarf entschlüsseln. */
export async function parseBackupAny(text: string, password?: string) {
  if (isEncryptedBackup(text)) {
    if (!password) throw new EncryptedBackupError();
    const inner = await decryptText(JSON.parse(text).cipher as Cipher, password);
    return parseBackup(inner);
  }
  return parseBackup(text);
}

export function parseBackup(text: string): { db: DB; settings?: Partial<Settings>; files?: Record<string, string> } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung (kein lesbares JSON).');
  }
  const data = raw?.app === 'immo-verwaltung' ? raw.data : raw;
  if (!data || typeof data !== 'object') throw new Error('Die Sicherung enthält keine Daten.');
  const out = { ...emptyDB } as DB;
  for (const k of KEYS) {
    const v = data[k];
    if (v !== undefined && !Array.isArray(v)) throw new Error(`Die Sicherung ist beschädigt (Abschnitt „${k}“).`);
    (out as any)[k] = v ?? [];
  }
  if (KEYS.every((k) => out[k].length === 0)) throw new Error('Die Sicherung ist leer.');
  const settings = raw?.app === 'immo-verwaltung' && raw.settings && typeof raw.settings === 'object' ? (raw.settings as Partial<Settings>) : undefined;
  const files = raw?.app === 'immo-verwaltung' && raw.files && typeof raw.files === 'object' ? (raw.files as Record<string, string>) : undefined;
  return { db: out, settings, files };
}

/** Sicherung erstellen und teilen bzw. speichern. Liefert, was passiert ist (bei „cancelled“ nicht als gesichert werten). */
export async function exportBackup(db: DB, settings?: Settings, opts: { withFiles?: boolean; password?: string } = {}): Promise<'shared' | 'downloaded' | 'cancelled'> {
  let files: Record<string, string> | undefined;
  if (opts.withFiles && filesSupported()) {
    files = {};
    for (const d of db.documents) {
      const b = await getBlob(d.id);
      if (b) files[d.id] = await blobToDataUrl(b);
    }
  }
  let json = serialize(db, settings, files);
  if (opts.password) json = JSON.stringify({ app: 'immo-verwaltung', version: 4, encrypted: true, exportedAt: new Date().toISOString(), cipher: await encryptText(json, opts.password) });
  const name = `immo-${opts.withFiles ? 'vollsicherung' : 'sicherung'}${opts.password ? '-verschluesselt' : ''}-${new Date().toISOString().slice(0, 10)}`;
  if (Platform.OS === 'web') return shareFiles([{ name, blob: new Blob([json], { type: 'application/json' }), ext: 'json' }], 'Sicherung Immo Verwaltung');
  await Share.share({ message: json, title: name });
  return 'shared';
}

/** Web: Dateiauswahl. Liefert den Dateiinhalt oder null bei Abbruch. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    // Im Dokument verankern: manche Browser (iOS Safari) feuern „change“ sonst nicht zuverlässig
    document.body.appendChild(input);
    input.onchange = () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      f.text().then(resolve, reject);
    };
    input.click();
  });
}

/** Textdatei speichern/teilen (Web: Download, Handy: Teilen-Dialog). */
export async function saveText(name: string, content: string, mime = 'text/csv'): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ message: content, title: name });
}

/** Dateien aus einer Vollsicherung wieder im Browser-Speicher ablegen. */
export async function restoreFiles(files: Record<string, string>): Promise<number> {
  if (!filesSupported()) return 0;
  let n = 0;
  for (const [id, url] of Object.entries(files)) {
    try { await putBlob(id, await dataUrlToBlob(url)); n++; } catch { /* Datei überspringen */ }
  }
  return n;
}
