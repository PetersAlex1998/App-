import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DB, Kind, emptyDB } from './types';
import { deleteBlob, filesSupported } from './files';
import { normalizeIds } from './ids';
import { removeItem, upsertItem } from './dbops';
import { DataError, Repository, localRepository } from './repo';

interface Ctx {
  db: DB;
  ready: boolean;
  loadKind: 'corrupt' | 'newer' | 'other' | ''; // Art des Ladefehlers
  loadError: string; // gesetzt, wenn gespeicherte Daten nicht geladen werden konnten (dann wird nichts überschrieben)
  saveError: boolean; // letztes Speichern fehlgeschlagen (z. B. Speicher voll)
  save: <K extends Kind>(kind: K, item: DB[K][number]) => void;
  remove: (kind: Kind, id: string) => void;
  replaceAll: (next: DB) => void;
  mergeRemote: (fn: (d: DB) => DB) => void; // Stand aus der Cloud übernehmen (ohne neue Änderungszeit)
  startEmpty: () => void; // nach Ladefehler mit leeren Daten weitermachen (defekte Kopie bleibt erhalten)
}

const StoreCtx = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(StoreCtx);
export { uid } from './uid';

const SAVE_DELAY = 400; // ms: Änderungen bündeln

export function StoreProvider({ children, repo = localRepository }: { children: React.ReactNode; repo?: Repository }) {
  const [db, setDb] = useState<DB>(emptyDB);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadKind, setLoadKind] = useState<'corrupt' | 'newer' | 'other' | ''>('');
  const [saveError, setSaveError] = useState(false);
  const canPersist = useRef(false); // erst nach erfolgreichem Laden
  const dirty = useRef(false);
  const latest = useRef(db);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = db;

  useEffect(() => {
    repo.load()
      .then((loaded) => { if (loaded) setDb(normalizeIds(loaded)); canPersist.current = true; })
      .catch((e: Error) => { setLoadKind(e instanceof DataError ? e.kind : 'other'); setLoadError(e?.message || 'Die Daten konnten nicht geladen werden.'); })
      .finally(() => setReady(true));
  }, [repo]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || !canPersist.current) return;
    dirty.current = false;
    repo.save(latest.current).then(() => setSaveError(false)).catch(() => { dirty.current = true; setSaveError(true); });
  }, [repo]);

  // Änderungen verzögert sichern; beim Verlassen der App sofort
  useEffect(() => {
    if (!canPersist.current) return;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [db, flush]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); };
  }, [flush]);

  const startEmpty = useCallback(() => { canPersist.current = true; setLoadError(''); setLoadKind(''); }, []);

  const save = useCallback<Ctx['save']>((kind, item) => {
    setDb((d) => upsertItem(d, kind, item));
  }, []);

  const remove = useCallback((kind: Kind, id: string) => {
    setDb((d) => {
      const { db: next, goneDocs } = removeItem(d, kind, id);
      if (goneDocs.length && filesSupported()) goneDocs.forEach((x) => deleteBlob(x.id).catch(() => {}));
      return next;
    });
  }, []);

  const mergeRemote = useCallback((fn: (d: DB) => DB) => setDb((d) => fn(d)), []);

  const replaceAll = useCallback((next: DB) => setDb(normalizeIds(next)), []);

  return <StoreCtx.Provider value={{ db, ready, loadKind, loadError, saveError, save, remove, replaceAll, mergeRemote, startEmpty }}>{children}</StoreCtx.Provider>;
}
