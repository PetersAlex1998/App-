import { describe, expect, it } from 'vitest';
import { bankRows, checks, completeness, fillTemplate, footerLines, formatIban, fullName, placeholders, returnLine, senderLines, signatureLines, validIban } from '../../src/company';
import { defaultSettings, Settings } from '../../src/settingsDefaults';
import { reminderModel } from '../../src/letters';
import { simple } from '../helpers/builders';
import { emptyDB } from '../../src/types';

const s = (o: Partial<Settings> = {}): Settings => ({ ...defaultSettings, ...o });
const firm = s({ name: 'Mustermann Immobilien', legalForm: 'GmbH', owner: 'Max Mustermann', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', phone: '05251 1234', email: 'info@muster.de', web: 'www.muster.de',
  taxNo: '339/5800/1234', vatId: 'DE123456789', taxOffice: 'Paderborn', register: 'Amtsgericht Paderborn, HRB 1234', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bank: 'Commerzbank' });

describe('IBAN', () => {
  it('gültige IBAN, mit und ohne Leerzeichen und in Kleinschreibung', () => {
    expect(validIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(validIban('de89370400440532013000')).toBe(true);
    expect(validIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
  });
  it('falsche Prüfziffer, falsche Länge, Müll', () => {
    expect(validIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(validIban('DE89 3704 0044 0532 0130')).toBe(false);
    expect(validIban('')).toBe(false);
    expect(validIban('12345')).toBe(false);
  });
  it('Formatierung in Vierergruppen', () => {
    expect(formatIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});

describe('Briefbausteine aus den Stammdaten', () => {
  it('Firmenname mit Rechtsform, ohne Verdopplung', () => {
    expect(fullName(firm)).toBe('Mustermann Immobilien GmbH');
    expect(fullName(s({ name: 'Muster GmbH', legalForm: 'GmbH' }))).toBe('Muster GmbH');
    expect(fullName(s({ name: 'Max Mustermann', legalForm: 'Privatperson' }))).toBe('Max Mustermann');
    expect(fullName(s({ name: 'X & Y', legalForm: 'GmbH & Co. KG' }))).toBe('X & Y GmbH & Co. KG');
    expect(fullName(s())).toBe('Hausverwaltung');
  });
  it('Absender, Rücksendezeile', () => {
    expect(senderLines(firm)).toEqual(['Mustermann Immobilien GmbH', 'Hauptstraße 1', '33098 Paderborn', '05251 1234', 'info@muster.de', 'www.muster.de']);
    expect(returnLine(firm)).toBe('Mustermann Immobilien GmbH · Hauptstraße 1 · 33098 Paderborn');
    expect(returnLine(s({ street: 'Weg 1' }))).toBe('Weg 1');
  });
  it('Bankblock: Kontoinhaber ersetzt Firmenname, IBAN formatiert', () => {
    expect(bankRows(firm)).toEqual([['Empfänger', 'Mustermann Immobilien GmbH'], ['IBAN', 'DE89 3704 0044 0532 0130 00'], ['BIC', 'COBADEFFXXX'], ['Bank', 'Commerzbank']]);
    expect(bankRows({ ...firm, accountHolder: 'Max Mustermann' })[0]).toEqual(['Empfänger', 'Max Mustermann']);
    expect(bankRows(s())).toEqual([]);
  });
  it('Fußzeile: Steuer, Register, Zusatztext, Bank; abschaltbar', () => {
    const f = footerLines({ ...firm, footer: 'Es gelten unsere AGB.' });
    expect(f).toEqual([
      'Steuernummer 339/5800/1234 · USt-IdNr. DE123456789 · Finanzamt Paderborn',
      'Amtsgericht Paderborn, HRB 1234 · Geschäftsführung: Max Mustermann',
      'Es gelten unsere AGB.',
      'IBAN DE89 3704 0044 0532 0130 00 · BIC COBADEFFXXX · Commerzbank',
    ]);
    expect(footerLines({ ...firm, footerAuto: false })).toEqual(['IBAN DE89 3704 0044 0532 0130 00 · BIC COBADEFFXXX · Commerzbank']);
    expect(footerLines(s({ owner: 'Max', legalForm: 'Privatperson' }))).toEqual(['Inhaber: Max']);
    expect(footerLines(s())).toEqual([]);
  });
  it('Unterschrift', () => {
    expect(signatureLines(s())).toEqual(['Mit freundlichen Grüßen', 'Ihre Hausverwaltung']);
    expect(signatureLines(firm)).toEqual(['Mit freundlichen Grüßen', 'Mustermann Immobilien GmbH']);
    expect(signatureLines({ ...firm, signerName: 'Max Mustermann', signerRole: 'Geschäftsführer', closing: 'Beste Grüße' })).toEqual(['Beste Grüße', 'Max Mustermann', 'Geschäftsführer']);
  });
});

describe('Vollständigkeit und Platzhalter', () => {
  it('zählt, was fehlt', () => {
    expect(completeness(s()).missing.map((m) => m.key)).toEqual(['name', 'street', 'city', 'contact', 'iban', 'tax', 'signer']);
    expect(completeness(firm)).toMatchObject({ done: 7, total: 7, missing: [] });
    expect(checks(s({ iban: 'DE00 0000' })).find((c) => c.key === 'iban')!.ok).toBe(false);
  });
  it('Platzhalter und Vorlagen', () => {
    const p = placeholders(firm);
    expect(p.Anschrift).toBe('Hauptstraße 1, 33098 Paderborn');
    expect(p.Unterzeichner).toBe('Max Mustermann');
    expect(fillTemplate('Sehr geehrte Damen und Herren, {{ Firma }}, IBAN {{IBAN}} {{Unbekannt}}', firm)).toBe('Sehr geehrte Damen und Herren, Mustermann Immobilien GmbH, IBAN DE89 3704 0044 0532 0130 00 {{Unbekannt}}');
    expect(fillTemplate('Tel. {{Telefon}}', s())).toBe('Tel. ');
  });
});

describe('Einmal pflegen, überall verwenden: Brief übernimmt die Stammdaten', () => {
  it('Mahnung enthält Absender, Fußzeile, Bankblock und Unterschrift aus den Stammdaten', () => {
    const { db, p: p0, u, t } = simple({ salutation: 'Frau' });
    const p = { ...p0, bank: { iban: firm.iban } }; // Mieten laufen auf das Hauskonto
    const r = { id: 'r', tenantId: t.id, date: '2026-11-03', level: 1 as const, amount: 800, fee: 0, deadline: '2026-11-10', items: [{ month: '2026-10', due: 800, paid: 0, open: 800 }] };
    const m = reminderModel(db ?? emptyDB, r, t, u, p, { ...firm, signerName: 'Max Mustermann', signerRole: 'Geschäftsführer' });
    expect(m.senderLines).toContain('www.muster.de');
    expect(m.footer.join(' ')).toContain('Steuernummer 339/5800/1234');
    expect(m.footer.join(' ')).toContain('HRB 1234');
    const sign = m.blocks.find((b) => b.t === 'sign') as { lines: string[] };
    expect(sign.lines).toEqual(['Mit freundlichen Grüßen', 'Max Mustermann', 'Geschäftsführer']);
    const kv = m.blocks.find((b) => b.t === 'kv') as { rows: [string, string][] };
    expect(kv.rows.find((x) => x[0] === 'IBAN')![1]).toBe('DE89 3704 0044 0532 0130 00');
  });
});
