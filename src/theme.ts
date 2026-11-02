import { useColorScheme } from 'react-native';

// Semantische Farben (HIG color.md: Rollen statt fester Werte, Light/Dark/Kontrast).
// Kontrast (Text, berechnet): text/bg ≥ 12:1, muted ≥ 4.5:1, danger/ok ≥ 4.5:1 auf card und bg.
const light = {
  bg: '#f2f2f7', card: '#ffffff', text: '#111111', muted: '#545458',
  primary: '#0062cc', onPrimary: '#ffffff', danger: '#b3261e', ok: '#1b6e2f',
  line: '#d1d1d6', fill: '#e5e5ea',
};
const dark = {
  bg: '#000000', card: '#1c1c1e', text: '#ffffff', muted: '#aeaeb2',
  primary: '#4da3ff', onPrimary: '#001a33', danger: '#ff8a80', ok: '#5fd37a',
  line: '#38383a', fill: '#2c2c2e',
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === 'dark' ? dark : light);

// Typografie (typography.md: Standard 17 pt, Minimum 11 pt; skaliert mit Systemeinstellung).
export const type = {
  largeTitle: 28, title: 22, headline: 17, body: 17, subhead: 15, footnote: 13,
};
export const MIN_TARGET = 44; // Mindestgröße Touch-Ziel (accessibility.md)
