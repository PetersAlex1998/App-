import React from 'react';
import { ActivityIndicator } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../store';
import { SettingsProvider } from '../settings';
import { ThemeProvider, useColors, useIsDark } from '../theme';
import { filesSupported, requestPersistence } from '../files';

const edit = (neu: string, bearbeiten: string) => ({ route }: any) => ({ title: route.params?.id ? bearbeiten : neu });

function Shell() {
  const { ready } = useStore();
  const c = useColors();
  const dark = useIsDark();
  React.useEffect(() => { if (filesSupported()) requestPersistence(); }, []);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  const theme = { ...DefaultTheme, dark, colors: { primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.line, notification: c.danger } };
  return (
    <NavThemeProvider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.primary, headerTitleStyle: { color: c.text, fontWeight: '700' }, headerBackTitle: 'Zurück', headerTitleAlign: 'center', contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="suche" options={{ title: 'Suche' }} />
        <Stack.Screen name="daten" options={{ title: 'Daten' }} />
        <Stack.Screen name="briefe" options={{ title: 'Briefe und Regeln' }} />
        <Stack.Screen name="briefausgang" options={{ title: 'Briefausgang' }} />
        <Stack.Screen name="mahnlauf" options={{ title: 'Mahnlauf' }} />
        <Stack.Screen name="nk-lauf" options={{ title: 'Nebenkosten-Lauf' }} />
        <Stack.Screen name="kontoauszug" options={{ title: 'Kontoauszug' }} />
        <Stack.Screen name="bestand-import" options={{ title: 'Bestand importieren' }} />
        <Stack.Screen name="objekt/[id]" options={{ title: 'Objekt' }} />
        <Stack.Screen name="objekt/formular" options={edit('Neues Objekt', 'Objekt bearbeiten')} />
        <Stack.Screen name="wohnung/[id]" options={{ title: 'Wohnung' }} />
        <Stack.Screen name="wohnung/formular" options={edit('Neue Wohnung', 'Wohnung bearbeiten')} />
        <Stack.Screen name="person/[id]" options={{ title: 'Mieter' }} />
        <Stack.Screen name="person/formular" options={edit('Neuer Mieter', 'Mieter bearbeiten')} />
        <Stack.Screen name="zahlung/formular" options={edit('Zahlung erfassen', 'Zahlung bearbeiten')} />
        <Stack.Screen name="kosten/formular" options={edit('Neue Kostenposition', 'Kostenposition bearbeiten')} />
        <Stack.Screen name="zaehler/[id]" options={{ title: 'Zähler' }} />
        <Stack.Screen name="zaehler/formular" options={edit('Neuer Zähler', 'Zähler bearbeiten')} />
        <Stack.Screen name="stand/formular" options={edit('Zählerstand', 'Stand bearbeiten')} />
        <Stack.Screen name="ablesung" options={{ title: 'Ablesung' }} />
        <Stack.Screen name="dokument/[id]" options={{ title: 'Dokument' }} />
        <Stack.Screen name="dokument/formular" options={edit('Dokument hinzufügen', 'Dokument bearbeiten')} />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SettingsProvider>
          <StoreProvider>
            <Shell />
          </StoreProvider>
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
