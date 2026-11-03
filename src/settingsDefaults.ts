/** Einstellungen (Absender, Mahnregeln, Sicherung) und ihre Standardwerte. */
export interface Settings {
  name: string; street: string; zip: string; city: string; phone: string; email: string;
  bank: string; iban: string; bic: string;
  fee2: number; fee3: number; deadlineDays: number; rentDueDay: number; graceDays: number;
  logo: string; // Data-URL (PNG/JPEG), '' = kein Logo
  footer: string; // Fußzeile, z. B. Steuernummer, Registergericht
  lastBackupAt: string; // ISO-Zeitpunkt der letzten Sicherung ('' = nie)
  backupRemindDays: number; // Erinnerung nach N Tagen ohne Sicherung, 0 = aus
}
export const defaultSettings: Settings = {
  name: '', street: '', zip: '', city: '', phone: '', email: '', bank: '', iban: '', bic: '',
  fee2: 5, fee3: 10, deadlineDays: 7, rentDueDay: 3, graceDays: 5, logo: '', footer: '', lastBackupAt: '', backupRemindDays: 30,
};
