import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export { defaultSettings } from './settingsDefaults';
export type { Settings } from './settingsDefaults';
import { defaultSettings, type Settings } from './settingsDefaults';

const KEY = 'immo-settings-v1';
const Ctx = createContext<{ s: Settings; update: (p: Partial<Settings>) => void; replace: (s: Settings) => void }>({ s: defaultSettings, update: () => {}, replace: () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(defaultSettings);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => raw && setS({ ...defaultSettings, ...JSON.parse(raw) })).catch(() => {});
  }, []);
  const update = useCallback((p: Partial<Settings>) => {
    setS((cur) => {
      const next = { ...cur, ...p, updatedAt: new Date().toISOString() };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  /** Stand aus der Cloud übernehmen (ohne neue Änderungszeit). */
  const replace = useCallback((next: Settings) => {
    const merged = { ...defaultSettings, ...next };
    setS(merged);
    AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
  }, []);
  return <Ctx.Provider value={{ s, update, replace }}>{children}</Ctx.Provider>;
}
