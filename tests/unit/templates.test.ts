import { describe, expect, it } from 'vitest';
import { TEMPLATES, contextPlaceholders, defaultFields, fillWith, renderTemplate, templateById, tenancyEnd, thirdWorkday } from '../../src/templates';
import { modelToPdf } from '../../src/pdfgen';
import { defaultSettings } from '../../src/settingsDefaults';
import { pageCount, pdfTexts } from '../helpers/pdf';
import { payment, simple } from '../helpers/builders';

const s = { ...defaultSettings, name: 'Mustermann Immobilien', legalForm: 'GmbH', owner: 'Max Mustermann', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', phone: '05251 1234', email: 'info@muster.de', taxNo: '339/5800/1234', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bank: 'Commerzbank', signerName: 'Max Mustermann' };
const DATE = '2026-11-15';

function ctx(over: Partial<ReturnType<typeof simple>['t']> = {}, unitOver = {}) {
  const x = simple({ name: 'Anna Schmidt', salutation: 'Frau', moveIn: '2025-01-01', deposit: 1500, ...over }, { name: 'Wohnung 1', no: 1, area: 60, rooms: 2, coldRent: 640, advance: 160, ...unitOver });
  return { s, db: x.db, tenant: x.t, unit: x.u, prop: x.p, date: DATE };
}

describe('Dokumentvorlagen: Platzhalter', () => {
  it('Mieter, Wohnung, Miete, Firma und Datum', () => {
    const p = contextPlaceholders({ ...ctx(), f: {} });
    expect(p).toMatchObject({ Mieter: 'Anna Schmidt', Anrede: 'Sehr geehrte Frau Schmidt', Wohnung: 'Wohnung 1', 'Wohnungs-ID': 'H01-W01', Fläche: '60', Firma: 'Mustermann Immobilien GmbH', IBAN: 'DE89 3704 0044 0532 0130 00', Heute: '15.11.2026' });
    expect(p.Kaltmiete).toMatch(/640,00/);
    expect(p.Gesamtmiete).toMatch(/800,00/);
    expect(p.Kaution).toMatch(/1\.500,00/);
  });
  it('fillWith meldet unbekannte und leere Werte', () => {
    const missing = new Set<string>();
    expect(fillWith('A {{x}} B {{y}} C', { x: '1', y: '' }, missing)).toBe('A 1 B  C');
    expect([...missing]).toEqual(['y']);
    fillWith('{{nope}}', {}, missing);
    expect(missing.has('nope')).toBe(true);
  });
});

describe('Dokumentvorlagen: Fristen', () => {
  it('dritter Werktag (Mo–Sa) und Mietende bei Kündigung des Mieters', () => {
    expect(thirdWorkday('2026-11-15')).toBe('2026-11-04'); // 01.11. ist ein Sonntag: Mo 2., Di 3., Mi 4.
    expect(tenancyEnd('2026-11-04')).toBe('2027-01-31'); // bis 3. Werktag → übernächster Monat
    expect(tenancyEnd('2026-11-05')).toBe('2027-02-28'); // danach → ein Monat später
  });
});

describe('Dokumentvorlagen: alle Vorlagen rendern und erzeugen ein PDF', () => {
  for (const tpl of TEMPLATES) {
    it(tpl.name, async () => {
      const base = ctx();
      const f = defaultFields(tpl, base);
      if (tpl.id === 'abmahnung') f.Vorfall = 'Lärmbelästigung nach 22 Uhr.';
      if (tpl.id === 'frei') { f.Betreff = 'Hinweis'; f.Text = 'Hallo {{Mieter}},\n\nIhre Wohnungs-ID ist {{Wohnungs-ID}}.'; }
      const r = renderTemplate(tpl, { ...base, f });
      expect(r.missing, `fehlende Werte in ${tpl.name}`).toEqual([]);
      const bytes = await modelToPdf(r.model);
      expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
      const text = (await pdfTexts(bytes)).join(' ');
      expect(text).toContain('Mustermann Immobilien GmbH'); // Absender aus den Unternehmensdaten
      expect(text).toContain('Schmidt');
      expect(text).not.toContain('{{');
    });
  }
});

describe('Dokumentvorlagen: Inhalte und Prüfungen', () => {
  it('Mietvertrag: Miete, Wohnungs-ID, Kaution, Kündigung; warnt bei zu hoher Kaution', () => {
    const tpl = templateById('mietvertrag')!;
    const base = ctx();
    const f = defaultFields(tpl, base);
    const r = renderTemplate(tpl, { ...base, f });
    const text = JSON.stringify(r.model.blocks);
    expect(text).toContain('H01-W01');
    expect(text).toContain('640,00');
    expect(text).toContain('Kaution');
    expect(text).toContain('§ 573c');
    expect(r.warnings).toEqual([]);
    const high = renderTemplate(tpl, { ...base, f: { ...f, Kautionsbetrag: '2.500' } });
    expect(high.warnings.join(' ')).toContain('drei Nettokaltmieten');
    const noDep = renderTemplate(tpl, { ...base, f: { ...f, Kautionsbetrag: '' } });
    expect(JSON.stringify(noDep.model.blocks)).toContain('nicht vereinbart');
  });
  it('Kündigung wegen Zahlungsverzug: prüft zwei Monatsmieten', () => {
    const tpl = templateById('kuendigung-zahlungsverzug')!;
    const base = ctx({ trackFrom: '2026-10' }); // Okt + Nov (+ Dez nicht) offen = 2 Monate
    const f = defaultFields(tpl, base);
    expect(f.Rückstand).not.toBe('');
    const few = renderTemplate(tpl, { ...base, f: { ...f, Rückstand: '300' } });
    expect(few.warnings.join(' ')).toContain('zwei Monatsmieten');
    const ok = renderTemplate(tpl, { ...base, f: { ...f, Rückstand: '1.600' } });
    expect(ok.warnings).toEqual([]);
    expect(JSON.stringify(ok.model.blocks)).toContain('§ 543');
    const without = renderTemplate(tpl, { ...base, f: { ...f, Rückstand: '1.600', Hilfsweise: 'Nein' } });
    expect(JSON.stringify(without.model.blocks)).not.toContain('Hilfsweise');
  });
  it('Kündigungsbestätigung schlägt das Mietende nach § 573c vor', () => {
    const tpl = templateById('kuendigungsbestaetigung')!;
    const f = defaultFields(tpl, ctx());
    expect(f.Eingang).toBe(DATE);
    expect(f.Mietende).toBe('2027-02-28');
  });
  it('Übergabeprotokoll zeigt die Zähler der Wohnung mit letztem Stand', () => {
    const tpl = templateById('uebergabeprotokoll')!;
    const base = ctx();
    const db = { ...base.db, meters: [{ id: 'm1', propertyId: base.prop.id, unitId: base.unit.id, type: 'heizung' as const, number: '4711' }], readings: [{ id: 'r', meterId: 'm1', date: '2025-12-31', value: 1200 }] };
    const r = renderTemplate(tpl, { ...base, db, f: defaultFields(tpl, base) });
    const text = JSON.stringify(r.model.blocks);
    expect(text).toContain('4711');
    expect(text).toContain('1.200');
    expect(text).toContain('Bad / WC');
  });
  it('Kautionsquittung nimmt den gebuchten Betrag', () => {
    const tpl = templateById('kautionsquittung')!;
    const base = ctx();
    const db = { ...base.db, payments: [payment(base.tenant.id, '2025-01', 1500, { kind: 'kaution' })] };
    expect(defaultFields(tpl, { ...base, db }).Betrag).toBe('1500');
  });
  it('Freies Schreiben ersetzt Platzhalter im Text', () => {
    const tpl = templateById('frei')!;
    const base = ctx();
    const r = renderTemplate(tpl, { ...base, f: { Betreff: 'Info', Text: 'Liebe Grüße an {{Mieter}} in {{Wohnung}}.' } });
    expect(JSON.stringify(r.model.blocks)).toContain('Anna Schmidt in Wohnung 1');
  });
  it('Zahlungsinformation nennt Wohnungs-ID, Konto und Fälligkeit; Hinweis ohne Nummer', () => {
    const tpl = templateById('zahlungsinfo')!;
    const base = ctx();
    const r = renderTemplate(tpl, { ...base, f: {} });
    expect(JSON.stringify(r.model.blocks)).toContain('H01-W01');
    expect(r.model.blocks.some((b) => b.t === 'kv' && b.rows.some((x) => x[0] === 'IBAN'))).toBe(true);
    const noNo = ctx({}, { no: undefined });
    expect(renderTemplate(tpl, { ...noNo, f: {} }).warnings.join(' ')).toContain('Wohnungs-ID');
  });
  it('fehlende Pflichtangaben werden gemeldet', () => {
    const tpl = templateById('mietvertrag')!;
    const base = ctx();
    const r = renderTemplate(tpl, { ...base, f: { ...defaultFields(tpl, base), Mietbeginn: '' } });
    expect(r.missing).toContain('Mietbeginn');
  });
});
