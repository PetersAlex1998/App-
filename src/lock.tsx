import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cryptoAvailable, hashPin } from './crypto';
import { useColors } from './ui';
import { MIN_TARGET, type } from './theme';

/**
 * App-Sperre per 6-stelligem Code. Schützt vor neugierigen Blicken, wenn das Handy entsperrt ist.
 * Die Daten selbst sind im Browser nicht verschlüsselt: Das ist kein Schutz gegen gezielte Auslese des Geräts.
 */
const KEY = 'immo-lock-v1';
export const PIN_LENGTH = 6;
export const TIMEOUTS = [{ label: 'Sofort', value: 0 }, { label: '1 Min.', value: 1 }, { label: '5 Min.', value: 5 }, { label: '15 Min.', value: 15 }];

interface Cfg { hash: string; salt: string; timeoutMin: number; fails: number; until: number }
const empty: Cfg = { hash: '', salt: '', timeoutMin: 1, fails: 0, until: 0 };

interface Ctx {
  supported: boolean;
  enabled: boolean;
  locked: boolean;
  timeoutMin: number;
  verify: (pin: string) => Promise<{ ok: boolean; wait?: number }>;
  enable: (pin: string, timeoutMin: number) => Promise<void>;
  disable: () => Promise<void>;
  setTimeoutMin: (m: number) => void;
  lockNow: () => void;
  waitSeconds: () => number;
}
const LockCtx = createContext<Ctx>(null as unknown as Ctx);
export const useLock = () => useContext(LockCtx);

export function LockProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<Cfg>(empty);
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(true); // bis die Einstellung geladen ist, bleibt alles verdeckt
  const hiddenAt = useRef(0);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const supported = Platform.OS === 'web' && cryptoAvailable();

  const persist = useCallback((next: Cfg) => { setCfg(next); cfgRef.current = next; AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const c: Cfg = raw ? { ...empty, ...JSON.parse(raw) } : empty;
        setCfg(c); cfgRef.current = c;
        setLocked(!!c.hash);
      })
      .catch(() => setLocked(false))
      .finally(() => setLoaded(true));
  }, []);

  // Beim Wechsel in den Hintergrund merken, beim Zurückkehren ggf. sperren
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      const c = cfgRef.current;
      if (c.hash && hiddenAt.current && Date.now() - hiddenAt.current >= c.timeoutMin * 60000) setLocked(true);
      hiddenAt.current = 0;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const waitSeconds = useCallback(() => Math.max(0, Math.ceil((cfgRef.current.until - Date.now()) / 1000)), []);

  const verify = useCallback(async (pin: string) => {
    const c = cfgRef.current;
    const wait = Math.max(0, Math.ceil((c.until - Date.now()) / 1000));
    if (wait > 0) return { ok: false, wait };
    const { hash } = await hashPin(pin, c.salt);
    if (hash === c.hash) { persist({ ...c, fails: 0, until: 0 }); setLocked(false); return { ok: true }; }
    const fails = c.fails + 1;
    // ab dem 5. Fehlversuch Wartezeit: 30 s, 60 s, 120 s … (max. 15 Min.)
    const delay = fails >= 5 ? Math.min(900, 30 * 2 ** Math.floor((fails - 5) / 1)) : 0;
    persist({ ...c, fails, until: delay ? Date.now() + delay * 1000 : 0 });
    return { ok: false, wait: delay || undefined };
  }, [persist]);

  const value: Ctx = {
    supported, enabled: !!cfg.hash, locked, timeoutMin: cfg.timeoutMin,
    verify,
    enable: async (pin, timeoutMin) => { const { hash, salt } = await hashPin(pin); persist({ hash, salt, timeoutMin, fails: 0, until: 0 }); setLocked(false); },
    disable: async () => { persist({ ...empty }); setLocked(false); },
    setTimeoutMin: (m) => persist({ ...cfgRef.current, timeoutMin: m }),
    lockNow: () => { if (cfgRef.current.hash) setLocked(true); },
    waitSeconds,
  };
  return <LockCtx.Provider value={value}>{children}</LockCtx.Provider>;
}

/** Zifferntastatur mit Punkten. Ruft onComplete, sobald PIN_LENGTH Ziffern eingegeben sind. */
export function PinPad({ title, subtitle, error, onComplete, disabled, resetKey }: { title: string; subtitle?: string; error?: string; onComplete: (pin: string) => void; disabled?: boolean; resetKey?: string | number }) {
  const c = useColors();
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [resetKey]);
  const press = (d: string) => {
    if (disabled) return;
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 80);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  return (
    <View style={{ alignItems: 'center', gap: 18, width: '100%' }}>
      <Text accessibilityRole="header" style={{ fontSize: type.title, fontWeight: '800', color: c.text, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: type.subhead, color: c.muted, textAlign: 'center', maxWidth: 300 }}>{subtitle}</Text> : null}
      <View accessibilityLabel={`${pin.length} von ${PIN_LENGTH} Ziffern eingegeben`} style={{ flexDirection: 'row', gap: 14, marginVertical: 6 }}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < pin.length ? c.ink : 'transparent', borderWidth: 1.5, borderColor: i < pin.length ? c.ink : c.muted }} />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ minHeight: 22, color: c.danger, fontSize: type.subhead, textAlign: 'center' }}>{error ?? ''}</Text>
      <View style={{ width: 288, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {keys.map((k, i) => (
          k === '' ? <View key={i} style={{ width: 84, height: 64 }} /> :
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={k === '⌫' ? 'Löschen' : k} disabled={disabled}
            onPress={() => (k === '⌫' ? setPin(pin.slice(0, -1)) : press(k))}
            style={({ pressed }) => ({ width: 84, height: 64, minHeight: MIN_TARGET, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: k === '⌫' ? 'transparent' : pressed ? c.fill : c.card, opacity: disabled ? 0.5 : 1 })}>
            {k === '⌫' ? <Ionicons name="backspace-outline" size={26} color={c.text} /> : <Text style={{ fontSize: 28, fontWeight: '600', color: c.text }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Vollbild-Sperre über der App. */
export function LockOverlay() {
  const { enabled, locked, verify, waitSeconds } = useLock();
  const c = useColors();
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!locked) return;
    const w = waitSeconds(); setWait(w);
    if (w <= 0) return;
    const id = setInterval(() => { const x = waitSeconds(); setWait(x); if (x <= 0) { clearInterval(id); setError(''); } }, 500);
    return () => clearInterval(id);
  }, [locked, tick, waitSeconds]);
  if (!locked) return null;

  const onPin = async (pin: string) => {
    const r = await verify(pin);
    if (r.ok) { setError(''); return; }
    setTick((t) => t + 1);
    setError(r.wait ? `Zu viele Versuche. Bitte ${r.wait} Sekunden warten.` : 'Falscher Code.');
  };
  const forgot = () => {
    const ok = typeof window !== 'undefined' && window.confirm('Code vergessen?\n\nDie App kann nur zurückgesetzt werden. Dabei werden ALLE Daten auf diesem Gerät gelöscht (Häuser, Mieter, Zahlungen, Dokumente). Hast du eine Sicherung, kannst du sie danach einspielen.\n\nJetzt alles löschen?');
    if (!ok) return;
    (async () => {
      try { await AsyncStorage.clear(); } catch {}
      try { const dbs = (await (indexedDB as any).databases?.()) ?? [{ name: 'immo-files' }]; dbs.forEach((d: any) => d.name && indexedDB.deleteDatabase(d.name)); } catch {}
      window.location.reload();
    })();
  };

  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {!enabled ? null : (
        <>
          <Ionicons name="lock-closed" size={36} color={c.ink} style={{ marginBottom: 12 }} />
          <PinPad title="Immo Verwaltung" subtitle={wait > 0 ? `Bitte ${wait} Sekunden warten.` : 'Gib deinen Code ein.'} error={wait > 0 ? '' : error} onComplete={onPin} disabled={wait > 0} resetKey={tick} />
          <Pressable accessibilityRole="button" onPress={forgot} style={{ marginTop: 28, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: c.muted, fontSize: type.subhead, textDecorationLine: 'underline' }}>Code vergessen?</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
