import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Look nach Apple-Store-App (iOS 26): helles Grau, weiße Karten, schwarze Symbole, Blau nur für Auswahl und Aktionen.
// Status hat eigene, feste Bedeutung. Kontrast Text auf Karte: text 16:1, muted 5:1, primary 5.6:1, danger 6:1, ok 5.4:1.
const light = {
  bg: '#F2F2F7', card: '#FFFFFF', text: '#1D1D1F', muted: '#6E6E73',
  primary: '#0066CC', onPrimary: '#FFFFFF', primarySoft: '#E6F0FA',
  danger: '#C4001A', dangerSoft: '#FDECEE',
  ok: '#1F7A36', okSoft: '#E7F5EA',
  warn: '#9A5B00', warnSoft: '#FEF1DC',
  line: '#E5E5EA', fill: '#EDEDF2', glass: 'rgba(255,255,255,0.86)',
};
const dark = {
  bg: '#000000', card: '#1C1C1E', text: '#F5F5F7', muted: '#A1A1A6',
  primary: '#4DA3FF', onPrimary: '#001B38', primarySoft: '#0F2740',
  danger: '#FF8A80', dangerSoft: '#3A1816',
  ok: '#5FD38A', okSoft: '#12301F',
  warn: '#F5B95C', warnSoft: '#352508',
  line: '#2C2C2E', fill: '#2C2C2E', glass: 'rgba(28,28,30,0.86)',
};
export type Colors = typeof light;

// Darstellung: Standard ist HELL, unabhängig vom Systemmodus. Wählbar unter „Daten“.
export type ThemePref = 'hell' | 'dunkel' | 'auto';
const THEME_KEY = 'immo-theme-v1';
const ThemeCtx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void }>({ pref: 'hell', setPref: () => {} });
export const useThemePref = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('hell');
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => (v === 'hell' || v === 'dunkel' || v === 'auto') && setPrefState(v)).catch(() => {});
  }, []);
  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(THEME_KEY, p).catch(() => {});
  };
  return <ThemeCtx.Provider value={{ pref, setPref }}>{children}</ThemeCtx.Provider>;
}

export const useIsDark = () => {
  const { pref } = useThemePref();
  const system = useColorScheme();
  return pref === 'dunkel' || (pref === 'auto' && system === 'dark');
};
export const useColors = (): Colors => (useIsDark() ? dark : light);

// Typografie: Standard 17 pt, Minimum 11 pt, alles skaliert mit der Systemeinstellung.
export const type = { display: 32, title: 22, headline: 17, body: 17, subhead: 15, footnote: 13, caption: 12 };
export const MIN_TARGET = 44;
export const MAX_WIDTH = 680;
