import AsyncStorage from '@react-native-async-storage/async-storage';
import { DB, emptyDB } from './types';

/**
 * Datenzugriff hinter einer Schnittstelle. Heute speichert `localRepository` im Gerät.
 * Eine Cloud-Variante (Anmeldung, Datenbank, Abgleich) wird später als weiteres Repository ergänzt,
 * ohne dass sich Bildschirme oder Berechnungen ändern.
 */
export interface Repository {
  /** Lädt alle Daten. null = noch nichts gespeichert. Wirft bei unlesbaren oder zu neuen Daten. */
  load(): Promise<DB | null>;
  /** Speichert den gesamten Stand (eine Cloud-Variante überträgt hier nur die Änderungen). */
  save(db: DB): Promise<void>;
}

/** Version des Datenformats. Erhöhen, wenn sich die Struktur so ändert, dass alte Daten umgebaut werden müssen. */
export const SCHEMA_VERSION = 4;

const KEY = 'immo-db-v1';
export const KEY_DEFEKT = 'immo-db-v1-defekt';

type Migration = (raw: any) => any;
/** MIGRATIONS[n] hebt Daten von Version n+1 auf n+2. Bisher genügen die Ergänzungen in `hydrate`. */
const MIGRATIONS: Migration[] = [];

export class DataError extends Error {
  constructor(public kind: 'corrupt' | 'newer', message: string) { super(message); }
}

/** Rohdaten in ein vollständiges DB-Objekt überführen (Migrationen, fehlende Listen). */
export function hydrate(raw: any): DB {
  const from = Number(raw?._schema ?? 1);
  if (from > SCHEMA_VERSION) throw new DataError('newer', `Die Daten stammen aus einer neueren Version der App (Datenformat ${from}, diese App kennt ${SCHEMA_VERSION}). Bitte die App aktualisieren.`);
  let cur = { ...raw };
  for (let v = from; v < SCHEMA_VERSION; v++) cur = (MIGRATIONS[v - 1] ?? ((x: any) => x))(cur);
  const { _schema, ...rest } = cur;
  const out = { ...emptyDB, ...rest } as DB;
  for (const k of Object.keys(emptyDB)) if (!Array.isArray((out as any)[k])) (out as any)[k] = [];
  return out;
}

export const localRepository: Repository = {
  async load() {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('kein Objekt');
    } catch {
      // Unlesbare Daten nie überschreiben: Kopie sichern, dann melden
      await AsyncStorage.setItem(KEY_DEFEKT, raw).catch(() => {});
      throw new DataError('corrupt', 'Die gespeicherten Daten sind nicht lesbar. Eine Kopie wurde gesichert.');
    }
    return hydrate(parsed);
  },
  async save(db) {
    await AsyncStorage.setItem(KEY, JSON.stringify({ _schema: SCHEMA_VERSION, ...db }));
  },
};
