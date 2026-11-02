import { useColorScheme } from 'react-native';

// Eigene Handschrift: ruhiges Schiefer-Grau mit einem einzigen Akzent (tiefes Petrol).
// Akzentfarbe nur für primäre Aktionen und Auswahl; Status hat eigene, feste Bedeutung.
// Kontrast (berechnet, Text auf Karte): text 16:1, muted 7:1, primary 6:1, danger 6:1, ok 5.6:1, warn 5.4:1.
const light = {
  bg: '#F3F4F6', card: '#FFFFFF', text: '#0F172A', muted: '#475569',
  primary: '#0E6B63', onPrimary: '#FFFFFF', primarySoft: '#E3F2F0',
  danger: '#B42318', dangerSoft: '#FDECEA',
  ok: '#067647', okSoft: '#E6F5EC',
  warn: '#9A5B00', warnSoft: '#FEF1DC',
  line: '#E2E5EA', fill: '#E9ECF0',
};
const dark = {
  bg: '#0B0F14', card: '#151A21', text: '#F1F5F9', muted: '#A3AEBD',
  primary: '#4FD1C5', onPrimary: '#04201D', primarySoft: '#12302D',
  danger: '#FF8A80', dangerSoft: '#3A1816',
  ok: '#5FD38A', okSoft: '#12301F',
  warn: '#F5B95C', warnSoft: '#352508',
  line: '#262D37', fill: '#202733',
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === 'dark' ? dark : light);
export const useIsDark = () => useColorScheme() === 'dark';

// Typografie: Standard 17 pt, Minimum 11 pt, alles skaliert mit der Systemeinstellung.
export const type = { display: 32, title: 22, headline: 17, body: 17, subhead: 15, footnote: 13, caption: 12 };
export const MIN_TARGET = 44;
export const MAX_WIDTH = 680;
