import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Online/Offline-Status des Geräts. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** Neue App-Version bereit? (vom Service Worker gemeldet) */
export function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const check = () => { if ((window as any).__immoSwWaiting) setAvailable(true); };
    check();
    window.addEventListener('immo-sw-waiting', check);
    return () => window.removeEventListener('immo-sw-waiting', check);
  }, []);
  const apply = useCallback(() => {
    const w = (window as any).__immoSwWaiting as ServiceWorker | undefined;
    if (!w) return;
    (window as any).__immoSwUpdating = true; // danach lädt die Seite mit der neuen Version neu
    w.postMessage('SKIP_WAITING');
  }, []);
  return { available, apply };
}

/** Ist der Offline-Modus (Service Worker) aktiv? */
export function useOfflineReady(): 'bereit' | 'wartet' | 'nicht-verfuegbar' {
  const [state, setState] = useState<'bereit' | 'wartet' | 'nicht-verfuegbar'>('wartet');
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return setState('nicht-verfuegbar');
    let alive = true;
    const probe = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!alive) return;
      if (!reg) return setState('nicht-verfuegbar');
      setState(navigator.serviceWorker.controller ? 'bereit' : 'wartet');
    };
    probe();
    navigator.serviceWorker.addEventListener('controllerchange', probe);
    const id = setInterval(probe, 3000);
    return () => { alive = false; clearInterval(id); navigator.serviceWorker.removeEventListener('controllerchange', probe); };
  }, []);
  return state;
}
