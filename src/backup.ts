import { Platform, Share } from 'react-native';
import { DB, emptyDB } from './types';

const KEYS = Object.keys(emptyDB) as (keyof DB)[];

export function serialize(db: DB): string {
  return JSON.stringify({ app: 'immo-verwaltung', version: 1, exportedAt: new Date().toISOString(), data: db }, null, 2);
}

/** Prüft den Inhalt einer Sicherung und liefert die Daten, oder wirft einen verständlichen Fehler. */
export function parseBackup(text: string): DB {
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
  return out;
}

export async function exportBackup(db: DB): Promise<void> {
  const json = serialize(db);
  const name = `immo-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ message: json, title: name });
}

/** Web: Dateiauswahl. Liefert den Dateiinhalt oder null bei Abbruch. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0];
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
