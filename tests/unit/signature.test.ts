import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { FORM_HINT, auditLines, bboxOfAlpha, sigPlaceDate, signFields, stamp, stripForStorage, withSignatures } from '../../src/signature';
import { modelToPdf } from '../../src/pdfgen';
import { renderTemplate, templateById } from '../../src/templates';
import { defaultSettings } from '../../src/settingsDefaults';
import { rentIncreaseModel } from '../../src/letters';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function setup(s = {}) {
  const p = property({ name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe' });
  const u = unit(p.id, { name: 'Wohnung 2', area: 55, rooms: 2, coldRent: 650, advance: 160 });
  const t = tenant(u.id, { name: 'Anna Schmidt', moveIn: '2026-12-01' });
  const settings = { ...defaultSettings, name: 'Mustermann', street: 'Hauptstr. 1', zip: '33100', city: 'Paderborn', ...s };
  return { p, u, t, settings, db: dbWith({ properties: [p], units: [u], tenants: [t] }) };
}
async function imageCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') && obj.dict.has(PDFName.of('SMask'))) n++; // Hauptbild mit Transparenzmaske
  }
  return n;
}
const render = (id: string, s: object = {}, f: Record<string, string> = {}) => {
  const { p, u, t, settings, db } = setup(s);
  const tpl = templateById(id)!;
  return renderTemplate(tpl, { s: settings, db, tenant: t, unit: u, prop: p, date: '2026-11-15', f }).model;
};

describe('Zuschnitt der Zeichnung', () => {
  it('findet die Umrandung der gezeichneten Pixel', () => {
    const w = 6, h = 4; const d = new Uint8ClampedArray(w * h * 4);
    d[(1 * w + 2) * 4 + 3] = 255; d[(2 * w + 4) * 4 + 3] = 200;
    expect(bboxOfAlpha(d, w, h)).toEqual({ x: 2, y: 1, w: 3, h: 2 });
  });
  it('leere Fläche und Rauschen unter der Schwelle ergeben nichts', () => {
    const d = new Uint8ClampedArray(5 * 5 * 4); d[3] = 5;
    expect(bboxOfAlpha(d, 5, 5)).toBeNull();
    expect(bboxOfAlpha(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe('Unterschriftsfelder in den Dokumenten', () => {
  it('Mietvertrag und Übergabeprotokoll: Vermieter und Mieter mit Namen', () => {
    for (const id of ['mietvertrag', 'uebergabeprotokoll']) {
      const f = signFields(render(id, {}, { Art: 'Einzug', Mietbeginn: '2026-12-01' }));
      expect(f.map((x) => x.key), id).toEqual(['vermieter', 'mieter']);
      expect(f[1].name).toBe('Anna Schmidt');
      expect(f[0].name).toBe('Mustermann');
    }
  });
  it('Wohnungsgeberbestätigung: ein Feld für den Wohnungsgeber', () => {
    expect(signFields(render('wohnungsgeber')).map((x) => x.label)).toEqual(['Unterschrift Wohnungsgeber']);
  });
  it('Mieterhöhung: Zustimmung des Mieters als Feld', () => {
    const { p, u, t, settings } = setup();
    const m = rentIncreaseModel('vergleich', t, u, p, settings, { currentRent: 650, newRent: 700, effective: '2027-03-01', consentUntil: '2027-01-31', comparePerSqm: 13, advance: 160 } as never, '2026-11-15');
    expect(signFields(m).map((x) => x.key)).toEqual(['mieter']);
  });
  it('Schreiben ohne Felder (z. B. Mahnung-Vorlagen, Kautionsquittung) haben keine Unterschriftsfelder', () => {
    expect(signFields(render('kautionsquittung', {}, { Betrag: '1000', Eingangsdatum: '2026-11-01' }))).toEqual([]);
  });
});

describe('Gespeicherte Unterschrift und Schriftform', () => {
  it('wird eingesetzt, außer bei Mietvertrag und Kündigung', () => {
    const s = { signature: PNG, autoSign: true };
    expect(render('uebergabeprotokoll', s, { Art: 'Einzug' }).signatures).toEqual({ vermieter: PNG });
    for (const id of ['mietvertrag', 'kuendigung-zahlungsverzug']) {
      const m = render(id, s, { Mietbeginn: '2026-12-01' });
      expect(m.signatures, id).toBeUndefined();
      expect(m.noAutoSign, id).toBe(true);
    }
  });
  it('Mietvertrag und Kündigung: nur mit der Einstellung „auch bei Mietvertrag und Kündigung“', () => {
    const s = { signature: PNG, autoSign: true, autoSignFormal: true };
    for (const id of ['mietvertrag', 'kuendigung-zahlungsverzug']) {
      const m = render(id, s, { Mietbeginn: '2026-12-01' });
      expect(m.signatures, id).toEqual({ vermieter: PNG });
      expect(m.noAutoSign, id).toBeUndefined();
    }
  });
  it('abgeschaltet: nie automatisch', () => {
    expect(render('uebergabeprotokoll', { signature: PNG, autoSign: false }, { Art: 'Einzug' }).signatures).toBeUndefined();
    expect(render('uebergabeprotokoll', { signature: '', autoSign: true }, { Art: 'Einzug' }).signatures).toBeUndefined();
  });
  it('Hinweistext nennt Schriftform und Papier', () => {
    expect(FORM_HINT).toMatch(/Schriftform/);
    expect(FORM_HINT).toMatch(/auf Papier/);
  });
});

describe('Nachweis und Ablage', () => {
  it('Nachweis nennt Felder, Namen und Zeitpunkt', () => {
    const t = auditLines([{ label: 'Vermieter', name: 'Mustermann' }, { label: 'Mieter', name: 'Anna Schmidt' }], new Date(2026, 10, 7, 14, 5));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('Vermieter Mustermann, Mieter Anna Schmidt');
    expect(t[0]).toContain('07.11.2026 um 14:05 Uhr');
    expect(t[0]).toMatch(/keine qualifizierte elektronische Signatur/);
    expect(auditLines([])).toEqual([]);
    expect(stamp(new Date(2026, 0, 2, 3, 4))).toBe('02.01.2026 um 03:04 Uhr');
  });
  it('Ablage ohne Logo und Unterschriften, Unterschreiben setzt sie wieder ein', () => {
    const m = { ...render('uebergabeprotokoll', { signature: PNG, logo: PNG }, { Art: 'Einzug' }), audit: ['x'] };
    const stored = stripForStorage(m);
    expect(stored.logo).toBeUndefined(); expect(stored.signatures).toBeUndefined(); expect(stored.audit).toBeUndefined();
    expect(signFields(stored)).toHaveLength(2);
    const back = withSignatures(stored, { logo: 'L' }, { mieter: PNG }, ['y']);
    expect(back).toMatchObject({ logo: 'L', signatures: { mieter: PNG }, audit: ['y'] });
  });
});

describe('PDF mit Unterschriften', () => {
  it('ohne Unterschrift kein Bild, mit zwei Unterschriften zwei Bilder', async () => {
    const m = render('uebergabeprotokoll', {}, { Art: 'Einzug' });
    expect(await imageCount(await modelToPdf(m))).toBe(0);
    const signed = await modelToPdf({ ...m, signatures: { vermieter: PNG, mieter: PNG }, audit: ['Am Gerät unterschrieben.'] });
    expect(await imageCount(signed)).toBe(2);
    expect((await PDFDocument.load(signed)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
  it('gespeicherte Unterschrift steht auch im Briefschluss; kaputte Unterschrift bricht nichts ab', async () => {
    const m = render('kautionsquittung', { signature: PNG }, { Betrag: '1000', Eingangsdatum: '2026-11-01' });
    expect(m.signatures?.vermieter).toBe(PNG);
    expect(await imageCount(await modelToPdf(m))).toBe(1);
    const bad = await modelToPdf({ ...m, signatures: { vermieter: 'data:image/png;base64,AAAA' } });
    expect((await PDFDocument.load(bad)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('Ort und Datum bei der Unterschrift', () => {
  it('Vorbelegung: Ort des Hauses und das Datum des Dokuments, kein Strich-Absatz mehr', () => {
    for (const id of ['mietvertrag', 'uebergabeprotokoll', 'wohnungsgeber']) {
      const m = render(id, {}, { Art: 'Einzug', Mietbeginn: '2026-12-01' });
      expect(sigPlaceDate(m), id).toEqual({ place: 'Bad Lippspringe', date: '2026-11-15' });
      expect(JSON.stringify(m.blocks), id).not.toContain('Ort, Datum: ____');
    }
  });
  it('Zustimmung zur Mieterhöhung: Ort vorbelegt, Datum bleibt für den Unterschriftstag offen', () => {
    const { p, u, t, settings } = setup();
    const m = rentIncreaseModel('vergleich', t, u, p, settings, { currentRent: 650, newRent: 700, effective: '2027-03-01', consentUntil: '2027-01-31', comparePerSqm: 13, advance: 160 } as never, '2026-11-15');
    expect(sigPlaceDate(m)).toEqual({ place: 'Bad Lippspringe', date: '' });
  });
  it('Beim Unterschreiben lassen sich Ort und Datum setzen; der Nachweis nennt den Ort', () => {
    const m = render('uebergabeprotokoll', {}, { Art: 'Einzug' });
    const w = withSignatures(m, { logo: '' }, { mieter: PNG }, ['x'], 'Paderborn', '2026-12-01');
    expect(sigPlaceDate(w)).toEqual({ place: 'Paderborn', date: '2026-12-01' });
    expect(sigPlaceDate(m).place).toBe('Bad Lippspringe'); // Original unverändert
    expect(withSignatures(m, { logo: '' }, {}, []).blocks).toBe(m.blocks); // ohne Angabe: nichts ändern
    expect(auditLines([{ label: 'Mieter', name: 'Anna' }], new Date(2026, 11, 1, 9, 0), 'Paderborn')[0]).toContain('Mieter Anna in Paderborn am 01.12.2026 um 09:00 Uhr');
  });
  it('PDF mit Ort und Datum wird erzeugt, auch ohne beides', async () => {
    const m = render('uebergabeprotokoll', {}, { Art: 'Einzug' });
    expect((await PDFDocument.load(await modelToPdf(m))).getPageCount()).toBeGreaterThanOrEqual(1);
    const blank = { ...m, blocks: m.blocks.map((b) => (b.t === 'sigs' ? { ...b, place: '', date: '' } : b)) };
    expect((await PDFDocument.load(await modelToPdf(blank))).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
