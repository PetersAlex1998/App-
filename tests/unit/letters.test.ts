import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { addressLines, lastName, modelToHtml, nkModel, reminderModel, salutationText, sampleModel, testLetterMissing, testLetterModel } from '../../src/letters';
import { mergePdfs, modelToPdf } from '../../src/pdfgen';
import { defaultSettings } from '../../src/settingsDefaults';
import { emptyDB, Reminder } from '../../src/types';
import { dbWith, property, resetIds, tenant, unit } from '../helpers/builders';
import { pageCount, pdfTexts } from '../helpers/pdf';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T12:00:00Z')); resetIds(); });
afterEach(() => vi.useRealTimers());

const s = { ...defaultSettings, name: 'Max Mustermann Immobilien', street: 'Hauptstraße 1', zip: '50667', city: 'Köln', iban: 'DE11 5001 0517 0000 0000 01', bic: 'COLSDE33', bank: 'Sparkasse', footer: 'Steuernummer 123/456' };
const prop = property({ id: 'p', houseNo: 3, name: 'Haus Lindenstraße', street: 'Lindenstr. 12', zip: '50667', city: 'Köln' });
const einheit = unit('p', { id: 'u', name: 'Wohnung 12', no: 12 });
const ten = (o = {}) => tenant('u', { name: 'Erika Mustermann', salutation: 'Frau', ...o });
const rem = (o: Partial<Reminder> = {}): Reminder => ({ id: 'x', tenantId: 't', date: '2026-11-12', level: 1, amount: 860, fee: 0, deadline: '2026-11-19', items: [{ month: '2026-10', due: 860, paid: 0, open: 860 }], ...o });

describe('Anrede und Adresse', () => {
  it.each([
    ['Herr', 'Max Mustermann', 'Sehr geehrter Herr Mustermann,', 'Herrn Max Mustermann'],
    ['Frau', 'Erika Mustermann', 'Sehr geehrte Frau Mustermann,', 'Frau Erika Mustermann'],
    ['Familie', 'Anna Schmidt', 'Sehr geehrte Familie Schmidt,', 'Familie Schmidt'],
    ['Firma', 'Muster Bäckerei GmbH', 'Sehr geehrte Damen und Herren,', 'Muster Bäckerei GmbH'],
    ['', 'Max Mustermann', 'Sehr geehrte Damen und Herren,', 'Max Mustermann'],
    ['Frau', 'Anna und Max Schmidt', 'Sehr geehrte Damen und Herren,', 'Anna und Max Schmidt'],
    ['Frau', 'Schmidt, Anna', 'Sehr geehrte Frau Schmidt,', 'Frau Anna Schmidt'],
    ['Frau', 'Dr. Anna Schmidt', 'Sehr geehrte Frau Schmidt,', 'Frau Dr. Anna Schmidt'],
  ])('%s / %s', (sal, name, gruss, zeile) => {
    const t = ten({ salutation: sal, name });
    expect(salutationText(t)).toBe(gruss);
    expect(addressLines(t, prop, einheit).lines[0]).toBe(zeile);
  });
  it('Nachname aus verschiedenen Schreibweisen', () => { expect(lastName('Schmidt, Anna')).toBe('Schmidt'); expect(lastName('Anna Maria Schmidt')).toBe('Schmidt'); });
  it('Postanschrift ersetzt die Objektadresse', () => {
    const a = addressLines(ten({ postalAddress: 'Postfach 12 34\n53111 Bonn' }), prop, einheit);
    expect(a.lines.slice(1)).toEqual(['Postfach 12 34', '53111 Bonn']);
    expect(a.unitNote).toBeUndefined();
  });
  it('ohne Postanschrift: Objektadresse und Wohnung als Zusatzzeile', () => {
    const a = addressLines(ten(), prop, einheit);
    expect(a.lines.slice(1)).toEqual(['Lindenstr. 12', '50667 Köln']);
    expect(a.unitNote).toBe('Wohnung 12');
  });
});

describe('Mahnung (Inhalt)', () => {
  it('Stufen mit passendem Titel', () => {
    const t = (l: 1 | 2 | 3) => reminderModel(emptyDB, rem({ level: l }), ten(), einheit, prop, s).blocks[0];
    expect(t(1)).toMatchObject({ t: 'h1', text: 'Zahlungserinnerung' });
    expect(t(2)).toMatchObject({ text: '1. Mahnung' });
    expect(t(3)).toMatchObject({ text: expect.stringContaining('2. Mahnung') });
  });
  it('Verwendungszweck enthält die Wohnungs-ID, dazu Hinweis und Kennung im Infoblock', () => {
    const m = reminderModel(emptyDB, rem(), ten(), einheit, prop, s);
    const kv = m.blocks.find((b) => b.t === 'kv') as any;
    expect(kv.rows).toContainEqual(['Verwendungszweck', 'Miete H03-W12']);
    expect(kv.rows).toContainEqual(['IBAN', s.iban]);
    expect(m.info).toContainEqual(['Kennung', 'H03-W12']);
    expect(JSON.stringify(m.blocks)).toContain('Bitte geben Sie bei jeder Zahlung die Kennung H03-W12');
  });
  it('ohne ID (Altbestand): Wohnung und Name als Verwendungszweck', () => {
    const m = reminderModel(emptyDB, rem(), ten(), { ...einheit, no: undefined }, { ...prop, houseNo: undefined }, s);
    const kv = m.blocks.find((b) => b.t === 'kv') as any;
    expect(kv.rows).toContainEqual(['Verwendungszweck', 'Miete Wohnung 12 – Erika Mustermann']);
    expect(m.info.some(([k]) => k === 'Kennung')).toBe(false);
  });
  it('Gebühr und Gesamtbetrag', () => {
    const m = reminderModel(emptyDB, rem({ level: 2, fee: 5, amount: 1720 }), ten(), einheit, prop, s);
    const tab = m.blocks.find((b) => b.t === 'table') as any;
    expect(tab.rows.at(-2).cells).toContain('Mahngebühr');
    expect(tab.rows.at(-1)).toMatchObject({ bold: true });
    expect(tab.rows.at(-1).cells[3]).toMatch(/1\.725,00/);
  });
  it('ohne IBAN: neutraler Hinweis statt Bankdaten', () => {
    const m = reminderModel(emptyDB, rem(), ten(), einheit, prop, { ...s, iban: '' });
    expect(m.blocks.some((b) => b.t === 'kv')).toBe(false);
  });
  it('Fußzeile mit IBAN und freiem Text', () => {
    const m = reminderModel(emptyDB, rem(), ten(), einheit, prop, s);
    expect(m.footer.join(' ')).toContain('Steuernummer 123/456');
    expect(m.footer.join(' ')).toContain('IBAN DE11');
  });
  it('HTML maskiert Sonderzeichen', () => {
    const html = modelToHtml(reminderModel(emptyDB, rem(), ten({ name: 'Jürgen <b>Müller</b> & Co', salutation: 'Herr' }), einheit, prop, s));
    expect(html).not.toContain('<b>Müller</b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
  });
});

describe('Nebenkostenabrechnung (Brief)', () => {
  const res = (balance: number) => ({ lines: [{ category: 'Müll', total: 100, key: 'nach m²', share: 20 }], costs: 20, advances: 0, balance, months: 12, warnings: [] });
  it('Nachzahlung: Bankdaten, Frist und Verwendungszweck mit Jahr und ID', () => {
    const m = nkModel(res(250), ten(), einheit, prop, 2025, s, '2026-11-12');
    const kv = m.blocks.find((b) => b.t === 'kv') as any;
    expect(kv.rows).toContainEqual(['Verwendungszweck', 'Nebenkosten 2025 H03-W12']);
    expect(JSON.stringify(m.blocks)).toContain('Nachzahlung');
    expect(m.title).toBe('Nebenkostenabrechnung 2025 – Erika Mustermann');
  });
  it('Guthaben: keine Bankdaten, Hinweis auf Erstattung', () => {
    const m = nkModel(res(-180), ten(), einheit, prop, 2025, s);
    expect(m.blocks.some((b) => b.t === 'kv')).toBe(false);
    expect(JSON.stringify(m.blocks)).toContain('Guthaben');
  });
  it('ausgeglichen', () => { expect(JSON.stringify(nkModel(res(0), ten(), einheit, prop, 2025, s).blocks)).toContain('ausgeglichen'); });
});

describe('Testbrief an sich selbst', () => {
  it('meldet fehlende Absenderangaben', () => {
    expect(testLetterMissing({ ...s, name: '', zip: ' ' })).toEqual(['Name oder Firma', 'PLZ']);
    expect(testLetterMissing(s)).toEqual([]);
  });
  it('Empfänger ist der Absender, mit Fensterrahmen und Prüfliste', () => {
    const m = testLetterModel(s, '2026-11-12');
    expect(m.address).toEqual(['Max Mustermann Immobilien', 'Hauptstraße 1', '50667 Köln']);
    expect(m.guides).toBe(true);
    expect(JSON.stringify(m.blocks)).toContain('Sonderzeichen');
  });
});

describe('PDF-Erzeugung', () => {
  it('ein Brief = eine A4-Seite, gültiges PDF mit Titel', async () => {
    const bytes = await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, s));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1); expect(height).toBeCloseTo(841.89, 1);
    expect(doc.getTitle()).toBe('Zahlungserinnerung – Erika Mustermann');
  });
  it('Text im PDF: Anschrift, Anrede, Kennung, Beträge, Fußzeile', async () => {
    const t = await pdfTexts(await modelToPdf(reminderModel(emptyDB, rem({ level: 2, fee: 5, amount: 1720 }), ten(), einheit, prop, s)));
    const alles = t.join(' ');
    for (const erwartet of ['Frau Erika Mustermann', 'Lindenstr. 12', '50667 Köln', 'Sehr', 'Mustermann,', 'H03-W12', 'Mahngebühr', 'Steuernummer 123/456', 'DE11 5001 0517 0000 0000 01'])
      expect(alles).toContain(erwartet);
    expect(alles).toMatch(/1\.725,00\s*€/);
  });
  it('Umlaute, ß und Euro-Zeichen kommen richtig an', async () => {
    const t = (await pdfTexts(await modelToPdf(testLetterModel(s)))).join(' ');
    expect(t).toContain('ä ö ü Ä Ö Ü ß €');
  });
  it('Zeichen außerhalb der Standardschrift führen nicht zum Absturz', async () => {
    const m = reminderModel(emptyDB, rem(), ten({ name: 'Zoë 😀 Ωmega 漢字', salutation: '' }), einheit, prop, s);
    const bytes = await modelToPdf(m);
    expect(await pageCount(bytes)).toBe(1);
  });
  it('lange Abrechnung läuft über mehrere Seiten, nichts geht verloren', async () => {
    const lines = Array.from({ length: 55 }, (_, i) => ({ category: `Kostenart Nr. ${i + 1}`, total: 1000 + i, key: i % 7 === 0 ? '70 % nach Verbrauch: 30 von 90 m³; 30 % nach m²' : 'nach m²', share: 50 + i }));
    const bytes = await modelToPdf(nkModel({ lines, costs: 4000, advances: 1920, balance: 2080, months: 12, warnings: [] }, ten(), einheit, prop, 2025, s));
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(3);
    const alles = (await pdfTexts(bytes)).join(' ');
    expect(alles).toContain('Kostenart Nr. 1'); // erste Zeile
    expect(alles).toContain('Kostenart Nr. 55'); // letzte Zeile
    expect(alles).toContain('Nachzahlung');
  });
  it('mehrere Briefe zu einer Datei zusammenfügen', async () => {
    const a = await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, s));
    const b = await modelToPdf(sampleModel(s));
    expect(await pageCount(await mergePdfs([a, b, a]))).toBe(3);
  });
  it('Logo wird eingebettet; ungültiges Logo wird ignoriert', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const mit = await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, { ...s, logo: png }));
    const ohne = await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, s));
    expect(mit.length).toBeGreaterThan(ohne.length);
    expect(await pageCount(await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, { ...s, logo: 'data:image/png;base64,KEIN-BILD' })))).toBe(1);
  });
  it('Seite hat A4-Format', async () => {
    const bytes = await modelToPdf(reminderModel(emptyDB, rem(), ten(), einheit, prop, s));
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});
