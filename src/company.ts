import type { Settings } from './settingsDefaults';

/**
 * Unternehmensstammdaten: die zentrale Quelle für alles, was in Briefen und späteren Dokumenten
 * (Mietvertrag, Kündigung, Abrechnung …) vom Absender erscheint. Reine Funktionen, damit jedes Dokument dasselbe verwendet.
 */
const filled = (x?: string) => !!x && x.trim().length > 0;
const clean = (a: (string | undefined)[]) => a.filter((x): x is string => filled(x)).map((x) => x.trim());

export const LEGAL_FORMS = ['Privatperson', 'Einzelunternehmen', 'GbR', 'UG', 'GmbH', 'GmbH & Co. KG', 'KG', 'AG', 'Erbengemeinschaft', 'Sonstige'] as const;

/* ───────── IBAN ───────── */

export const normIban = (s: string) => (s ?? '').replace(/\s+/g, '').toUpperCase();
export const formatIban = (s: string) => normIban(s).replace(/(.{4})/g, '$1 ').trim();

/** Prüft Aufbau und Prüfziffer (ISO 7064, mod 97). Deutsche IBAN haben 22 Stellen. */
export function validIban(s: string): boolean {
  const i = normIban(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return false;
  if (i.startsWith('DE') && i.length !== 22) return false;
  const rearranged = i.slice(4) + i.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/* ───────── Bausteine für Briefe ───────── */

export const companyName = (s: Settings) => s.name.trim() || 'Hausverwaltung';
export const fullName = (s: Settings) => [s.name.trim(), s.legalForm && !['Privatperson', 'Einzelunternehmen', 'Sonstige', 'Erbengemeinschaft'].includes(s.legalForm) && !new RegExp(`\\b${s.legalForm.replace(/[.&]/g, '\\$&')}\\b`, 'i').test(s.name) ? s.legalForm : ''].filter(Boolean).join(' ') || 'Hausverwaltung';
export const cityLine = (s: Settings) => `${s.zip} ${s.city}`.trim();

/** Absenderblock oben rechts im Briefkopf. */
export const senderLines = (s: Settings) => clean([fullName(s), s.street, cityLine(s), s.phone, s.email, s.web]);
/** Rücksendezeile über dem Anschriftfeld. */
export const returnLine = (s: Settings) => clean([fullName(s) === 'Hausverwaltung' && !filled(s.name) ? '' : fullName(s), s.street, cityLine(s)]).join(' · ');

export const bankHolder = (s: Settings) => s.accountHolder.trim() || fullName(s);
/** Bankverbindung als Zeilenpaare (Überweisungsblock im Brief). */
export function bankRows(s: Settings): [string, string][] {
  if (!filled(s.iban)) return [];
  const rows: [string, string][] = [['Empfänger', bankHolder(s)], ['IBAN', formatIban(s.iban)]];
  if (filled(s.bic)) rows.push(['BIC', s.bic.trim()]);
  if (filled(s.bank)) rows.push(['Bank', s.bank.trim()]);
  return rows;
}

/** Fußzeile: Steuer und Register aus den Stammdaten (falls automatisch), dein Zusatztext und die Bankverbindung. */
export function footerLines(s: Settings, opts: { bank?: boolean } = {}): string[] {
  const out: string[] = [];
  if (s.footerAuto) {
    const tax = clean([filled(s.taxNo) ? `Steuernummer ${s.taxNo.trim()}` : '', filled(s.vatId) ? `USt-IdNr. ${s.vatId.trim()}` : '', filled(s.taxOffice) ? `Finanzamt ${s.taxOffice.trim()}` : '']);
    if (tax.length) out.push(tax.join(' · '));
    const reg = clean([filled(s.register) ? s.register.trim() : '', filled(s.owner) ? `${/(gmbh|ug|ag|kg)/i.test(s.legalForm) ? 'Geschäftsführung' : 'Inhaber'}: ${s.owner.trim()}` : '']);
    if (reg.length) out.push(reg.join(' · '));
  }
  out.push(...(s.footer ?? '').split('\n').map((x) => x.trim()).filter(Boolean));
  if (opts.bank !== false && filled(s.iban)) out.push(`IBAN ${formatIban(s.iban)}${filled(s.bic) ? ' · BIC ' + s.bic.trim() : ''}${filled(s.bank) ? ' · ' + s.bank.trim() : ''}`);
  return out;
}

/** Grußformel und Unterschrift am Briefende. */
export function signatureLines(s: Settings): string[] {
  const who = s.signerName.trim() || (s.name.trim() ? fullName(s) : 'Ihre Hausverwaltung');
  return clean([s.closing || 'Mit freundlichen Grüßen', who, s.signerRole]);
}

/* ───────── Vollständigkeit ───────── */

export interface Check { key: string; label: string; ok: boolean; needed: 'brief' | 'steuer' | 'zahlung' }

/** Welche Angaben fehlen noch, und wofür werden sie gebraucht? */
export function checks(s: Settings): Check[] {
  return [
    { key: 'name', label: 'Name oder Firma', ok: filled(s.name), needed: 'brief' },
    { key: 'street', label: 'Straße und Hausnummer', ok: filled(s.street), needed: 'brief' },
    { key: 'city', label: 'PLZ und Ort', ok: filled(s.zip) && filled(s.city), needed: 'brief' },
    { key: 'contact', label: 'Telefon oder E-Mail', ok: filled(s.phone) || filled(s.email), needed: 'brief' },
    { key: 'iban', label: 'Gültige IBAN des Firmenkontos', ok: validIban(s.iban), needed: 'zahlung' },
    { key: 'tax', label: 'Steuernummer oder USt-IdNr.', ok: filled(s.taxNo) || filled(s.vatId), needed: 'steuer' },
    { key: 'signer', label: 'Unterzeichner', ok: filled(s.signerName) || filled(s.owner) || filled(s.name), needed: 'brief' },
  ];
}
export const completeness = (s: Settings) => { const c = checks(s); return { done: c.filter((x) => x.ok).length, total: c.length, missing: c.filter((x) => !x.ok) }; };

/* ───────── Platzhalter für Dokumentvorlagen ───────── */

/** Werte für Vorlagen, z. B. {{Firma}} oder {{IBAN}}. Leere Angaben bleiben leer, damit Vorlagen sie weglassen können. */
export function placeholders(s: Settings): Record<string, string> {
  return {
    Firma: fullName(s), Name: s.name.trim(), Rechtsform: s.legalForm, Inhaber: s.owner.trim(),
    Straße: s.street.trim(), PLZ: s.zip.trim(), Ort: s.city.trim(), Anschrift: clean([s.street, cityLine(s)]).join(', '),
    Telefon: s.phone.trim(), 'E-Mail': s.email.trim(), Web: s.web.trim(),
    Steuernummer: s.taxNo.trim(), 'USt-IdNr': s.vatId.trim(), Finanzamt: s.taxOffice.trim(), Handelsregister: s.register.trim(),
    Kontoinhaber: bankHolder(s), IBAN: formatIban(s.iban), BIC: s.bic.trim(), Bank: s.bank.trim(),
    Grußformel: s.closing || 'Mit freundlichen Grüßen', Unterzeichner: s.signerName.trim() || s.owner.trim() || fullName(s), Funktion: s.signerRole.trim(),
  };
}

/** Setzt {{Platzhalter}} in einem Text ein. Unbekannte Platzhalter bleiben stehen, damit Fehler auffallen. */
export function fillTemplate(text: string, s: Settings): string {
  const p = placeholders(s);
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => (k in p ? p[k] : m));
}
