import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../store';
import { SettingsProvider } from '../settings';
import { SyncProvider } from '../syncProvider';
import { UndoProvider } from '../undo';
import { ThemeProvider, useColors, useIsDark } from '../theme';
import { filesSupported, requestPersistence } from '../files';
import { LockOverlay, LockProvider, useLock } from '../lock';
import { KEY_DEFEKT } from '../repo';
import { downloadBlob } from '../dispatch';
import { Button, Gap, Screen, useColors as useUiColors } from '../ui';
import { useUpdateAvailable } from '../pwa';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const edit = (neu: string, bearbeiten: string) => ({ route }: any) => ({ title: route.params?.id ? bearbeiten : neu });

/** Verbirgt die App komplett, solange sie gesperrt ist (Zustand bleibt erhalten, nichts ist sichtbar oder auslesbar). */
function Guarded({ children }: { children: React.ReactNode }) {
  const { locked } = useLock();
  return <View style={{ flex: 1, display: locked ? 'none' : 'flex' }}>{children}</View>;
}

function DataProblem() {
  const { loadError, loadKind, startEmpty } = useStore();
  const col = useUiColors();
  const saveCopy = async () => {
    const raw = await AsyncStorage.getItem(KEY_DEFEKT);
    if (raw) downloadBlob(new Blob([raw], { type: 'application/json' }), 'immo-defekte-daten.json');
  };
  return (
    <Screen>
      <Gap h={40} />
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', marginBottom: 10, color: col.text }}>Daten konnten nicht geladen werden</Text>
      <Text style={{ fontSize: 16, marginBottom: 20, color: col.text }}>{loadError}</Text>
      <Button title="Erneut versuchen" icon="refresh" onPress={() => window.location.reload()} />
      {loadKind === 'corrupt' && (
        <>
          <Gap h={10} />
          <Button kind="secondary" title="Defekte Daten als Datei sichern" icon="download-outline" onPress={saveCopy} />
          <Gap h={10} />
          <Button kind="destructive" title="Mit leeren Daten starten" onPress={() => { if (window.confirm('Mit leeren Daten starten? Die defekte Kopie bleibt im Browser gespeichert. Spiele danach am besten deine Sicherung ein.')) startEmpty(); }} />
        </>
      )}
    </Screen>
  );
}

/** Hinweis, wenn eine neue App-Version bereitliegt. Aktualisiert wird erst auf Tipp, nie mitten in der Arbeit. */
function UpdateBanner() {
  const { available, apply } = useUpdateAvailable();
  const insets = useSafeAreaInsets();
  const col = useUiColors();
  if (!available) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Neue Version verfügbar. Jetzt aktualisieren" onPress={apply}
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 100, backgroundColor: col.ink, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: col.onInk, fontWeight: '600', fontSize: 15, flex: 1 }}>Neue Version verfügbar</Text>
      <Text style={{ color: col.onInk, fontWeight: '800', fontSize: 15 }}>Aktualisieren</Text>
    </Pressable>
  );
}

function Shell() {
  const { ready, loadError } = useStore();
  const c = useColors();
  const dark = useIsDark();
  React.useEffect(() => { if (filesSupported()) requestPersistence(); }, []);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (loadError) return <DataProblem />;
  const theme = { ...DefaultTheme, dark, colors: { primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.line, notification: c.danger } };
  return (
    <NavThemeProvider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <UpdateBanner />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.primary, headerTitleStyle: { color: c.text, fontWeight: '700' }, headerBackTitle: 'Zurück', headerTitleAlign: 'center', contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="suche" options={{ title: 'Suche' }} />
        <Stack.Screen name="daten" options={{ title: 'Daten' }} />
        <Stack.Screen name="kalkulator/index" options={{ title: 'Immokalkulator' }} />
        <Stack.Screen name="kalkulator/formular" options={{ title: 'Kalkulation' }} />
        <Stack.Screen name="aufgaben" options={{ title: 'Aufgaben' }} />
        <Stack.Screen name="cloud" options={{ title: 'Cloud' }} />
        <Stack.Screen name="sperre" options={{ title: 'App-Sperre' }} />
        <Stack.Screen name="vorlagen/index" options={{ title: 'Dokumente erstellen' }} />
        <Stack.Screen name="vorlagen/formular" options={{ title: 'Dokument' }} />
        <Stack.Screen name="mieterhoehung" options={{ title: 'Miete erhöhen' }} />
        <Stack.Screen name="schaeden/index" options={{ title: 'Schäden' }} />
        <Stack.Screen name="schaeden/[id]" options={{ title: 'Schaden' }} />
        <Stack.Screen name="schaeden/formular" options={edit('Schaden melden', 'Schaden bearbeiten')} />
        <Stack.Screen name="handwerker/index" options={{ title: 'Handwerker' }} />
        <Stack.Screen name="handwerker/formular" options={edit('Neuer Handwerker', 'Handwerker bearbeiten')} />
        <Stack.Screen name="darlehen/index" options={{ title: 'Darlehen' }} />
        <Stack.Screen name="darlehen/[id]" options={{ title: 'Darlehen' }} />
        <Stack.Screen name="darlehen/formular" options={edit('Neues Darlehen', 'Darlehen bearbeiten')} />
        <Stack.Screen name="kaution" options={{ title: 'Kaution' }} />
        <Stack.Screen name="kautionen" options={{ title: 'Kautionen' }} />
        <Stack.Screen name="mieterwechsel" options={{ title: 'Mieterwechsel' }} />
        <Stack.Screen name="mietspiegel" options={{ title: 'Mietspiegel' }} />
        <Stack.Screen name="mieterhoehung-potenzial" options={{ title: 'Mieterhöhungs-Potenzial' }} />
        <Stack.Screen name="unternehmen" options={{ title: 'Unternehmensdaten' }} />
        <Stack.Screen name="briefe" options={{ title: 'Briefe und Regeln' }} />
        <Stack.Screen name="briefausgang" options={{ title: 'Briefausgang' }} />
        <Stack.Screen name="mahnlauf" options={{ title: 'Mahnlauf' }} />
        <Stack.Screen name="nk-kosten" options={{ title: 'Kosten aus Ausgaben' }} />
        <Stack.Screen name="nk-lauf" options={{ title: 'Nebenkosten-Lauf' }} />
        <Stack.Screen name="kontoauszug" options={{ title: 'Kontoauszug' }} />
        <Stack.Screen name="zaehler-import" options={{ title: 'Zähler importieren' }} />
        <Stack.Screen name="bestand-import" options={{ title: 'Bestand importieren' }} />
        <Stack.Screen name="objekt/[id]" options={{ title: 'Objekt' }} />
        <Stack.Screen name="objekt/formular" options={edit('Neues Objekt', 'Objekt bearbeiten')} />
        <Stack.Screen name="wohnung/[id]" options={{ title: 'Wohnung' }} />
        <Stack.Screen name="wohnung/serie" options={{ title: 'Mehrere Einheiten anlegen' }} />
        <Stack.Screen name="wohnung/formular" options={edit('Neue Wohnung', 'Wohnung bearbeiten')} />
        <Stack.Screen name="person/[id]" options={{ title: 'Mieter' }} />
        <Stack.Screen name="person/formular" options={edit('Neuer Mieter', 'Mieter bearbeiten')} />
        <Stack.Screen name="zahlung/formular" options={edit('Zahlung erfassen', 'Zahlung bearbeiten')} />
        <Stack.Screen name="ausgaben" options={{ title: 'Ausgaben' }} />
        <Stack.Screen name="anlage-v" options={{ title: 'Anlage V' }} />
        <Stack.Screen name="ausgabe/formular" options={edit('Ausgabe erfassen', 'Ausgabe bearbeiten')} />
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
        <LockProvider>
          <View style={{ flex: 1 }}>
            <Guarded>
              <SettingsProvider>
                <StoreProvider>
                  <SyncProvider>
                    <UndoProvider>
                      <Shell />
                    </UndoProvider>
                  </SyncProvider>
                </StoreProvider>
              </SettingsProvider>
            </Guarded>
            <LockOverlay />
          </View>
        </LockProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
