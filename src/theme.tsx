import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Luxus-Palette: Silber und Perlgrau, Graphit-Schwarz für Hauptaktionen, Champagner-Gold als Akzent.
// Status hat eigene, feste Bedeutung. Kontrast Text auf Karte: text 16:1, muted 5.6:1, primary(Gold) 5.9:1, danger 7:1, ok 6:1, warn 5.4:1.
const light = {
  bg: '#E9EAEE', card: '#FBFBFC', text: '#15171A', muted: '#5B6068',
  ink: '#15171A', onInk: '#F6F1E4',
  primary: '#7A5C1E', onPrimary: '#FFFFFF', primarySoft: '#F1EAD8',
  danger: '#9B2C2C', dangerSoft: '#F6E5E5',
  ok: '#2B6A4C', okSoft: '#E3EFE8',
  warn: '#8A5A00', warnSoft: '#F4EBD3',
  line: '#DCDEE3', fill: '#E1E3E8',
  glass: 'rgba(238,240,244,0.60)', glassBorder: 'rgba(255,255,255,0.85)',
};
const dark = {
  bg: '#0C0D10', card: '#17191D', text: '#F3F0E8', muted: '#A7A49C',
  ink: '#E6D3A0', onInk: '#1A1405',
  primary: '#DCC080', onPrimary: '#1A1405', primarySoft: '#2A2416',
  danger: '#F09A92', dangerSoft: '#3A1B1A',
  ok: '#6FD3A0', okSoft: '#14302A',
  warn: '#F0BE63', warnSoft: '#352608',
  line: '#272A30', fill: '#23262C',
  glass: 'rgba(44,47,54,0.58)', glassBorder: 'rgba(255,255,255,0.14)',
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
