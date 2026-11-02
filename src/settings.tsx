import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  name: string; street: string; zip: string; city: string; phone: string; email: string;
  bank: string; iban: string; bic: string;
  fee2: number; fee3: number; deadlineDays: number; rentDueDay: number; graceDays: number;
}
export const defaultSettings: Settings = {
  name: '', street: '', zip: '', city: '', phone: '', email: '', bank: '', iban: '', bic: '',
  fee2: 5, fee3: 10, deadlineDays: 7, rentDueDay: 3, graceDays: 5,
};
const KEY = 'immo-settings-v1';
const Ctx = createContext<{ s: Settings; update: (p: Partial<Settings>) => void }>({ s: defaultSettings, update: () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(defaultSettings);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => raw && setS({ ...defaultSettings, ...JSON.parse(raw) })).catch(() => {});
  }, []);
  const update = useCallback((p: Partial<Settings>) => {
    setS((cur) => {
      const next = { ...cur, ...p };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ s, update }}>{children}</Ctx.Provider>;
}
