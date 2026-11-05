import { useMemo } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';

/**
 * Brücke zwischen den Bildschirmen (src/screens) und Expo Router (src/app).
 * Die Bildschirme rufen weiter navigation.navigate('PropertyDetail', { id }) auf;
 * hier wird der Name in einen Pfad der Dateirouten übersetzt.
 */
const ROUTES: Record<string, string> = {
  // Tabs
  Tabs: '/', 'Übersicht': '/', Objekte: '/objekte', Mieter: '/mieter', Zahlungen: '/zahlungen', Module: '/module',
  // Details und Formulare
  PropertyDetail: '/objekt/[id]', PropertyForm: '/objekt/formular',
  UnitDetail: '/wohnung/[id]', UnitForm: '/wohnung/formular', UnitSeries: '/wohnung/serie',
  TenantDetail: '/person/[id]', TenantForm: '/person/formular',
  PaymentForm: '/zahlung/formular', CostForm: '/kosten/formular',
  MeterDetail: '/zaehler/[id]', MeterForm: '/zaehler/formular', ReadingForm: '/stand/formular', Ablesung: '/ablesung',
  DocumentViewer: '/dokument/[id]', DocumentForm: '/dokument/formular',
  // Abläufe und Einstellungen
  Mahnlauf: '/mahnlauf', Sperre: '/sperre', NkLauf: '/nk-lauf', NkKosten: '/nk-kosten', Outbox: '/briefausgang', Briefe: '/briefe', Daten: '/daten', Search: '/suche',
  Vorlagen: '/vorlagen', VorlageForm: '/vorlagen/formular', Mieterhoehung: '/mieterhoehung', Mietspiegel: '/mietspiegel', Mieterwechsel: '/mieterwechsel', Kaution: '/kaution', Portfolio: '/portfolio', Expose: '/expose', HouseSetup: '/haus-einrichten', Wartung: '/wartung', CheckDetail: '/wartung/[id]', CheckForm: '/wartung/formular', Schaeden: '/schaeden', IssueDetail: '/schaeden/[id]', IssueForm: '/schaeden/formular', Handwerker: '/handwerker', ContractorForm: '/handwerker/formular', Darlehen: '/darlehen', LoanDetail: '/darlehen/[id]', LoanForm: '/darlehen/formular', Kautionen: '/kautionen', Potenzial: '/mieterhoehung-potenzial', Unternehmen: '/unternehmen', Kalkulator: '/kalkulator', CalculatorForm: '/kalkulator/formular', Aufgaben: '/aufgaben', Cloud: '/cloud', Ausgaben: '/ausgaben', ExpenseForm: '/ausgabe/formular', AnlageV: '/anlage-v',
  StatementImport: '/kontoauszug', ZaehlerImport: '/zaehler-import', BestandImport: '/bestand-import',
};
const TABS = new Set(['Tabs', 'Übersicht', 'Objekte', 'Mieter', 'Zahlungen', 'Module']);

const clean = (p?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));

function href(name: string, params?: Record<string, unknown>) {
  const pathname = ROUTES[name];
  if (!pathname) throw new Error(`Unbekannter Bildschirm: ${name}`);
  return { pathname, params: clean(params) } as never;
}

export const go = (name: string, params?: Record<string, unknown>) => (TABS.has(name) ? router.navigate(href(name, params)) : router.push(href(name, params)));
export const replace = (name: string, params?: Record<string, unknown>) => router.replace(href(name, params));
export const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Props wie früher (route.params, navigation.navigate …) für die Bildschirme, auf Basis von Expo Router. */
export function useCompat() {
  const params = useLocalSearchParams() as Record<string, string | undefined>;
  const nav = useNavigation();
  const navigation = useMemo(
    () => ({ navigate: go, push: go, replace, goBack: back, canGoBack: () => router.canGoBack(), setOptions: (o: any) => nav.setOptions(o) }),
    [nav],
  );
  return { route: { params }, navigation };
}
