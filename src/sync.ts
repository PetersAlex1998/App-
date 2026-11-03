import { DB, Kind, emptyDB } from './types';

/**
 * Abgleich zwischen Gerät und Cloud (offline zuerst: das Gerät bleibt die Arbeitsgrundlage).
 * Regeln:
 *  - Jeder Datensatz hat `updatedAt` (Änderungszeit am Gerät). Der neuere Stand gewinnt.
 *  - Gelöscht wird per Grabstein (Zeile mit deleted=true), damit andere Geräte mitlöschen.
 *  - Lokal gelöschte Sätze werden nicht von der Cloud wiederhergestellt (Löschen gewinnt),
 *    es sei denn, ein anderes Gerät hat den Satz nach dem Löschen geändert (dann gewinnt die Änderung).
 */

export const SETTINGS_KIND = '_settings';
export const SETTINGS_ID = 'main';
export const DB_KINDS = Object.keys(emptyDB) as Kind[];

export interface Item { kind: string; id: string; updatedAt: string; data: any }
export interface RemoteRow { kind: string; id: string; data: any | null; deleted: boolean; client_updated_at: string; updated_at: string }
export interface PushRow { kind: string; id: string; data: any | null; deleted: boolean; client_updated_at: string }

export interface SyncState {
  userId: string;
  cursor: string; // größter `updated_at` der Cloud, den wir verarbeitet haben
  synced: Record<string, string>; // "kind:id" -> updatedAt beim letzten Abgleich
  uploaded: string[]; // Dokument-IDs, deren Datei in der Cloud liegt
  lastSyncAt: string;
}
export const freshState = (userId = ''): SyncState => ({ userId, cursor: '', synced: {}, uploaded: [], lastSyncAt: '' });

export interface Remote {
  pull(since: string): Promise<RemoteRow[]>;
  push(rows: PushRow[]): Promise<void>;
  upload(id: string, blob: Blob): Promise<void>;
  removeFile(id: string): Promise<void>;
}
export interface Blobs { has(id: string): Promise<boolean>; get(id: string): Promise<Blob | undefined> }

export const keyOf = (kind: string, id: string) => `${kind}:${id}`;
const stampOf = (x: { updatedAt?: string }) => x.updatedAt ?? '';

/** Alle Datensätze (und die Einstellungen) als flache Liste. */
export function flatten(db: DB, settings?: { updatedAt?: string }): Item[] {
  const out: Item[] = [];
  for (const kind of DB_KINDS) for (const x of db[kind] as unknown as { id: string; updatedAt?: string }[]) out.push({ kind, id: x.id, updatedAt: stampOf(x), data: x });
  if (settings) out.push({ kind: SETTINGS_KIND, id: SETTINGS_ID, updatedAt: stampOf(settings), data: settings });
  return out;
}

export interface Changes { puts: Item[]; dels: { kind: string; id: string }[] }

/** Was die Cloud neu hat, gegen den lokalen Stand gehalten. Ändert `state.synced` entsprechend. */
export function planPull(local: Item[], state: SyncState, rows: RemoteRow[]): Changes {
  const byKey = new Map(local.map((i) => [keyOf(i.kind, i.id), i]));
  const puts: Item[] = [];
  const dels: Changes['dels'] = [];
  for (const r of rows) {
    if (r.kind !== SETTINGS_KIND && !DB_KINDS.includes(r.kind as Kind)) continue; // unbekannte Art (neuere App-Version): ignorieren
    const k = keyOf(r.kind, r.id);
    const mine = byKey.get(k);
    if (r.deleted) {
      if (mine && stampOf({ updatedAt: mine.updatedAt }) <= r.client_updated_at) { dels.push({ kind: r.kind, id: r.id }); delete state.synced[k]; }
      else if (!mine) delete state.synced[k];
      continue;
    }
    const theirs = r.data?.updatedAt ?? '';
    if (!mine) {
      if (k in state.synced) continue; // lokal gelöscht, Löschung noch nicht hochgeladen: Löschen gewinnt
      puts.push({ kind: r.kind, id: r.id, updatedAt: theirs, data: r.data });
      state.synced[k] = theirs;
    } else if (theirs > mine.updatedAt) {
      puts.push({ kind: r.kind, id: r.id, updatedAt: theirs, data: r.data });
      state.synced[k] = theirs;
    } else if (theirs === mine.updatedAt) {
      state.synced[k] = theirs;
    }
    // theirs < mine: lokaler Stand ist neuer, wird beim Hochladen gesendet
  }
  return { puts, dels };
}

/** Was hochgeladen werden muss: neue oder geänderte Sätze und Grabsteine für lokal Gelöschtes. */
export function planPush(local: Item[], state: SyncState, now = new Date().toISOString()): PushRow[] {
  const rows: PushRow[] = [];
  const present = new Set<string>();
  for (const i of local) {
    const k = keyOf(i.kind, i.id);
    present.add(k);
    if (!(k in state.synced) || state.synced[k] !== i.updatedAt) rows.push({ kind: i.kind, id: i.id, data: i.data, deleted: false, client_updated_at: i.updatedAt });
  }
  for (const k of Object.keys(state.synced)) {
    if (present.has(k)) continue;
    const [kind, ...rest] = k.split(':');
    rows.push({ kind, id: rest.join(':'), data: null, deleted: true, client_updated_at: now });
  }
  return rows;
}

/** Änderungen auf einen Datenbestand anwenden (ohne neue Änderungszeit zu setzen). */
export function applyToDb(d: DB, ch: Changes): DB {
  if (!ch.puts.length && !ch.dels.length) return d;
  const next = { ...d } as Record<Kind, any[]>;
  for (const kind of DB_KINDS) {
    const puts = ch.puts.filter((p) => p.kind === kind);
    const dels = new Set(ch.dels.filter((p) => p.kind === kind).map((p) => p.id));
    if (!puts.length && !dels.size) continue;
    const byId = new Map(puts.map((p) => [p.id, p.data]));
    const seen = new Set<string>();
    const list = (d[kind] as unknown as { id: string }[]).filter((x) => !dels.has(x.id)).map((x) => { seen.add(x.id); return byId.get(x.id) ?? x; });
    for (const p of puts) if (!seen.has(p.id)) list.push(p.data);
    next[kind] = list;
  }
  return next as unknown as DB;
}

export interface SyncDeps {
  remote: Remote;
  getLocal: () => { db: DB; settings: { updatedAt?: string } };
  apply: (ch: Changes) => void;
  loadState: () => Promise<SyncState>;
  saveState: (s: SyncState) => Promise<void>;
  blobs?: Blobs;
  now?: () => string;
}
export interface SyncResult { pulled: number; pushed: number; deleted: number; files: number; at: string }

const OVERLAP_MS = 2000; // Überlappung beim Abholen: Zeilen aus später abgeschlossenen Transaktionen nicht verpassen

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const state = await deps.loadState();

  // 1) Abholen und anwenden
  const since = state.cursor ? new Date(Date.parse(state.cursor) - OVERLAP_MS).toISOString() : '';
  const rows = await deps.remote.pull(since);
  const first = deps.getLocal();
  const changes = planPull(flatten(first.db, first.settings), state, rows);
  deps.apply(changes);
  // Dokumente aus der Cloud: Datei liegt dort bereits
  for (const p of changes.puts) if (p.kind === 'documents' && !state.uploaded.includes(p.id)) state.uploaded.push(p.id);
  const maxAt = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), state.cursor);

  // 2) Hochladen (Stand nach dem Anwenden)
  const after = deps.getLocal();
  const local = flatten(after.db, after.settings);
  // Satz, den wir gerade übernommen haben, ist durch `synced` schon abgeglichen.
  const pushRows = planPush(local, state, now);
  for (let i = 0; i < pushRows.length; i += 200) await deps.remote.push(pushRows.slice(i, i + 200));
  for (const r of pushRows) {
    const k = keyOf(r.kind, r.id);
    if (r.deleted) delete state.synced[k]; else state.synced[k] = r.client_updated_at;
  }

  // 3) Dateien
  let files = 0;
  if (deps.blobs) {
    const up = new Set(state.uploaded);
    const docIds = new Set(after.db.documents.map((d) => d.id));
    for (const d of after.db.documents) {
      if (up.has(d.id)) continue;
      if (!(await deps.blobs.has(d.id))) continue;
      const b = await deps.blobs.get(d.id);
      if (!b) continue;
      await deps.remote.upload(d.id, b);
      up.add(d.id); files++;
    }
    for (const id of [...up]) if (!docIds.has(id)) { await deps.remote.removeFile(id).catch(() => {}); up.delete(id); }
    state.uploaded = [...up];
  }

  state.cursor = maxAt;
  state.lastSyncAt = now;
  await deps.saveState(state);
  return { pulled: changes.puts.length + changes.dels.length, pushed: pushRows.filter((r) => !r.deleted).length, deleted: pushRows.filter((r) => r.deleted).length, files, at: now };
}
