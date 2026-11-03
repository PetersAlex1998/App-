import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useStore } from './store';
import { useSettings } from './settings';
import { cloudRemote, downloadFile, loadSession, loadSyncState, saveSyncState, signIn as doSignIn, signOut as doSignOut, signUp as doSignUp } from './cloud';
import { SETTINGS_KIND, SyncResult, applyToDb, runSync } from './sync';
import { filesSupported, getBlob, hasBlob, setBlobFallback } from './files';

type Status = 'aus' | 'bereit' | 'laeuft' | 'fehler';
interface Ctx {
  email: string; // leer = nicht angemeldet
  status: Status;
  error: string;
  lastSyncAt: string;
  last: SyncResult | null;
  syncNow: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<'angemeldet' | 'bestaetigen'>;
  signOut: () => Promise<void>;
}
const CloudCtx = createContext<Ctx>({ email: '', status: 'aus', error: '', lastSyncAt: '', last: null, syncNow: async () => {}, signIn: async () => {}, signUp: async () => 'angemeldet', signOut: async () => {} });
export const useCloud = () => useContext(CloudCtx);

const AUTO_DELAY = 4000; // nach einer Änderung kurz warten, dann abgleichen

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { db, ready, loadError, mergeRemote } = useStore();
  const { s: settings, replace } = useSettings();
  const [email, setEmail] = useState('');
  const [uid, setUid] = useState('');
  const [status, setStatus] = useState<Status>('aus');
  const [error, setError] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [last, setLast] = useState<SyncResult | null>(null);
  const live = useRef({ db, settings });
  live.current = { db, settings };
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSession().then((s) => { if (s) { setEmail(s.user.email); setUid(s.user.id); setStatus('bereit'); } });
  }, []);

  // Fehlende Dateien bei Bedarf aus der Cloud holen
  useEffect(() => {
    if (!uid || !filesSupported()) return setBlobFallback(null);
    setBlobFallback(downloadFile);
    return () => setBlobFallback(null);
  }, [uid]);

  const syncNow = useCallback(async () => {
    if (!uid || !ready || loadError) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    setStatus('laeuft');
    try {
      const res = await runSync({
        remote: cloudRemote,
        getLocal: () => ({ db: live.current.db, settings: live.current.settings }),
        apply: (ch) => {
          if (!ch.puts.length && !ch.dels.length) return;
          mergeRemote((d) => applyToDb(d, ch));
          const st = ch.puts.find((p) => p.kind === SETTINGS_KIND);
          if (st) replace(st.data);
        },
        loadState: () => loadSyncState(uid),
        saveState: saveSyncState,
        blobs: filesSupported() ? { has: hasBlob, get: (id) => getBlob(id) } : undefined,
      });
      setLast(res); setLastSyncAt(res.at); setError(''); setStatus('bereit');
    } catch (e: any) {
      setError(String(e?.message ?? e)); setStatus('fehler');
      if (/neu anmelden/.test(String(e?.message))) { setEmail(''); setUid(''); }
    } finally {
      running.current = false;
      if (again.current) { again.current = false; schedule(1000); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ready, loadError, mergeRemote, replace]);

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; syncNowRef.current(); }, ms);
  }, []);
  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;

  // Abgleich: beim Start, nach Änderungen, beim Zurückkehren in die App und wenn das Netz wieder da ist
  useEffect(() => { if (uid && ready) schedule(500); }, [uid, ready, schedule]);
  useEffect(() => { if (uid && ready) schedule(AUTO_DELAY); }, [db, settings, uid, ready, schedule]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !uid) return;
    const vis = () => { if (document.visibilityState === 'visible') schedule(800); };
    const on = () => schedule(800);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', on);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', on); };
  }, [uid, schedule]);

  const afterLogin = (s: { user: { id: string; email: string } }) => { setEmail(s.user.email); setUid(s.user.id); setStatus('bereit'); setError(''); };
  const signIn = useCallback(async (e: string, p: string) => { afterLogin(await doSignIn(e.trim(), p)); }, []);
  const signUp = useCallback(async (e: string, p: string) => {
    const s = await doSignUp(e.trim(), p);
    if (!s) return 'bestaetigen' as const;
    afterLogin(s);
    return 'angemeldet' as const;
  }, []);
  const signOut = useCallback(async () => { await doSignOut(); setEmail(''); setUid(''); setStatus('aus'); setLastSyncAt(''); setLast(null); setError(''); }, []);

  return <CloudCtx.Provider value={{ email, status, error, lastSyncAt, last, syncNow, signIn, signUp, signOut }}>{children}</CloudCtx.Provider>;
}
