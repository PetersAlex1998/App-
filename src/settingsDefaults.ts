/** Einstellungen (Absender, Mahnregeln, Sicherung) und ihre Standardwerte. */
export interface Settings {
  updatedAt?: string; // letzte Änderung (für den Cloud-Abgleich)
  name: string; street: string; zip: string; city: string; phone: string; email: string;
  bank: string; iban: string; bic: string;
  fee2: number; fee3: number; deadlineDays: number; rentDueDay: number; graceDays: number;
  // Unternehmensstammdaten (zentrale Quelle für Briefe und spätere Dokumente)
  legalForm: string; owner: string; web: string;
  taxNo: string; vatId: string; taxOffice: string; register: string; // Steuernummer, USt-IdNr., Finanzamt, Handelsregister
  accountHolder: string; // Kontoinhaber (leer = Firmenname)
  closing: string; signerName: string; signerRole: string; // Grußformel, Unterzeichner, Funktion
  footerAuto: boolean; // Fußzeile automatisch aus den Stammdaten bilden
  logo: string; // Data-URL (PNG/JPEG), '' = kein Logo
  mgmtFee: number; // Verwaltungsgebühr pro Einheit und Monat, netto (Standard)
  vatRate: number; // Umsatzsteuer der Firma in %
  invoiceDays: number; // Zahlungsziel der Rechnungen an die Häuser in Tagen
  signature: string; // eigene Unterschrift als PNG (Data-URL), '' = keine
  autoSignFormal: boolean; // auch bei Mietvertrag und Kündigung automatisch einsetzen
  autoSign: boolean; // gespeicherte Unterschrift automatisch in Schreiben einsetzen (nicht bei Kündigungen)
  footer: string; // Fußzeile, z. B. Steuernummer, Registergericht
  lastBackupAt: string; // ISO-Zeitpunkt der letzten Sicherung ('' = nie)
  backupRemindDays: number; // Erinnerung nach N Tagen ohne Sicherung, 0 = aus
  dismissedTasks: string[]; // als erledigt markierte Aufgaben (IDs)
  calcDefaults: Partial<import('./calculator').CalcInput>; // zuletzt benutzte Annahmen des Immokalkulators
}
export const defaultSettings: Settings = {
  name: '', street: '', zip: '', city: '', phone: '', email: '', bank: '', iban: '', bic: '',
  fee2: 5, fee3: 10, deadlineDays: 7, rentDueDay: 3, graceDays: 5, legalForm: '', owner: '', web: '', taxNo: '', vatId: '', taxOffice: '', register: '', accountHolder: '', closing: 'Mit freundlichen Grüßen', signerName: '', signerRole: '', footerAuto: true, logo: '', mgmtFee: 25, vatRate: 19, invoiceDays: 14, signature: '', autoSign: true, autoSignFormal: false, footer: '', lastBackupAt: '', backupRemindDays: 30, dismissedTasks: [], calcDefaults: {},
};
