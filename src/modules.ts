/**
 * Verzeichnis aller Module (Funktionen) der App. Neue Funktionen tragen sich hier mit einer Zeile ein
 * und erscheinen automatisch im Bereich „Alle Module“.
 */
export interface AppModule {
  id: string;
  group: string;
  icon: string;
  title: string;
  subtitle: string;
  screen: string; // Name für navigation.navigate
  badge?: 'aufgaben'; // dynamische Zahl, z. B. offene Aufgaben
}

export const MODULE_GROUPS = ['Verwalten', 'Abläufe', 'Finanzen', 'Importieren', 'Einstellungen'] as const;

export const MODULES: AppModule[] = [
  { id: 'mieter', group: 'Verwalten', icon: 'people', title: 'Mieter', subtitle: 'Aktuelle und ehemalige Mieter', screen: 'Mieter' },
  { id: 'aufgaben', group: 'Verwalten', icon: 'checkmark-done-circle-outline', title: 'Aufgaben', subtitle: 'Was die Datenprüfung bemerkt hat', screen: 'Aufgaben', badge: 'aufgaben' },
  { id: 'suche', group: 'Verwalten', icon: 'search', title: 'Suche', subtitle: 'Häuser, Wohnungen, Mieter und IDs', screen: 'Search' },

  { id: 'vorlagen', group: 'Abläufe', icon: 'documents-outline', title: 'Dokumente erstellen', subtitle: 'Mietvertrag, Kündigung, Übergabeprotokoll, Bescheinigungen', screen: 'Vorlagen' },
  { id: 'mahnlauf', group: 'Abläufe', icon: 'mail-unread-outline', title: 'Mahnlauf', subtitle: 'Offene Mieten mahnen', screen: 'Mahnlauf' },
  { id: 'nk', group: 'Abläufe', icon: 'calculator-outline', title: 'Nebenkosten-Lauf', subtitle: 'Abrechnungen für alle Mieter', screen: 'NkLauf' },
  { id: 'briefe', group: 'Abläufe', icon: 'mail-open-outline', title: 'Briefausgang', subtitle: 'Erstellte Briefe teilen und versenden', screen: 'Outbox' },

  { id: 'ausgaben', group: 'Finanzen', icon: 'receipt-outline', title: 'Ausgaben und Belege', subtitle: 'Rechnungen erfassen, Beleg fotografieren', screen: 'Ausgaben' },
  { id: 'anlagev', group: 'Finanzen', icon: 'document-text-outline', title: 'Auswertung für die Steuer', subtitle: 'Anlage V und CSV für den Steuerberater', screen: 'AnlageV' },
  { id: 'kalkulator', group: 'Finanzen', icon: 'calculator', title: 'Immokalkulator', subtitle: 'Kaufobjekte durchrechnen, Höchstpreis ermitteln', screen: 'Kalkulator' },
  { id: 'kontoauszug', group: 'Finanzen', icon: 'swap-vertical-outline', title: 'Kontoauszug importieren', subtitle: 'Zahlungseingänge automatisch zuordnen', screen: 'StatementImport' },

  { id: 'bestandimport', group: 'Importieren', icon: 'albums-outline', title: 'Bestand importieren', subtitle: 'Häuser, Einheiten und Mieter aus CSV', screen: 'BestandImport' },
  { id: 'zaehlerimport', group: 'Importieren', icon: 'speedometer-outline', title: 'Zähler und Stände importieren', subtitle: 'Heizung, Wasser und Strom aus einer Tabelle', screen: 'ZaehlerImport' },

  { id: 'unternehmen', group: 'Einstellungen', icon: 'business-outline', title: 'Unternehmensdaten', subtitle: 'Firma, Anschrift, Steuer, Bank, Briefkopf und Unterschrift', screen: 'Unternehmen' },
  { id: 'cloud', group: 'Einstellungen', icon: 'cloud-outline', title: 'Cloud', subtitle: 'Anmeldung und Abgleich', screen: 'Cloud' },
  { id: 'daten', group: 'Einstellungen', icon: 'shield-checkmark-outline', title: 'Daten, Sicherung und Darstellung', subtitle: 'Sicherung, Speicher, Hell/Dunkel', screen: 'Daten' },
  { id: 'absender', group: 'Einstellungen', icon: 'mail-outline', title: 'Briefe und Mahnregeln', subtitle: 'Fälligkeit, Fristen, Gebühren, Testbrief', screen: 'Briefe' },
  { id: 'sperre', group: 'Einstellungen', icon: 'lock-closed-outline', title: 'App-Sperre', subtitle: 'Code beim Öffnen verlangen', screen: 'Sperre' },
];
