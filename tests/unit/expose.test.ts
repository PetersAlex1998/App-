import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExpose, describeUnit, energyMissing, exposeAddress, exposeDefaults, exposeWarnings, featuresOf, streetOnly } from '../../src/expose';
import { exposeToPdf } from '../../src/pdfgen';
import { defaultSettings } from '../../src/settingsDefaults';
import { dbWith, property, tenant, unit } from '../helpers/builders';
import { PDFDocument } from 'pdf-lib';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function setup(over = {}) {
  const p = property({ name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', yearBuilt: '1975', heatingType: 'Gas-Zentralheizung', eaType: 'Verbrauchsausweis', eaValue: '120', eaClass: 'D', energySource: 'Erdgas', eaValidUntil: '2030-01-01', ...over });
  const u = unit(p.id, { name: 'Wohnung 2', area: 55, rooms: 2, coldRent: 650, advance: 160, floor: '1. OG', balcony: 'Südbalkon', kitchen: 'Einbauküche', cellar: 'ja' });
  const t = tenant(u.id, { name: 'Anna Geheim', moveOut: '2026-10-31' });
  return { p, u, t, db: dbWith({ properties: [p], units: [u], tenants: [t] }) };
}
const settings = { ...defaultSettings, name: 'Mustermann', email: 'info@example.de', phone: '0123 456' };

describe('Exposé-Inhalt', () => {
  it('Straße ohne Hausnummer', () => {
    expect(streetOnly('Langestr. 13')).toBe('Langestr.');
    expect(streetOnly('Detmolder Str. 138a')).toBe('Detmolder Str.');
    expect(streetOnly('Westernstr. 43-45')).toBe('Westernstr.');
    const { p } = setup();
    expect(exposeAddress(p, true)).toBe('Langestr., 33175 Bad Lippspringe');
    expect(exposeAddress(p, false)).toBe('Langestr. 13, 33175 Bad Lippspringe');
  });
  it('Vorbelegung: Miete der Wohnung, Kaution drei Kaltmieten, Beschreibung und Ausstattung aus den Stammdaten', () => {
    const { u, p, db } = setup();
    const d = exposeDefaults(db, u, p);
    expect(d).toMatchObject({ rent: 650, advance: 160, deposit: 1950, hideHouseNo: true });
    expect(d.title).toBe('2-Zimmer-Wohnung, 55 m², Bad Lippspringe');
    expect(d.description).toContain('2-Zimmer-Wohnung mit ca. 55 m²');
    expect(d.description).toContain('1. OG');
    expect(d.description).toContain('1975');
    expect(featuresOf(u, p)).toEqual(['Balkon/Terrasse: Südbalkon', 'Küche: Einbauküche', 'Keller: ja', 'Heizung: Gas-Zentralheizung']);
    expect(describeUnit(u, p)).toContain('Bad Lippspringe');
  });
  it('Eckdaten und Energieblock', () => {
    const { u, p, db } = setup();
    const m = buildExpose(db, u, p, settings, { ...exposeDefaults(db, u, p), availableFrom: '2027-01-01' });
    const f = Object.fromEntries(m.facts);
    expect(f['Warmmiete']).toMatch(/810,00/);
    expect(f['Kaltmiete']).toMatch(/650,00.*11,82.*pro m²/);
    expect(f['Verfügbar ab']).toBe('01.01.2027');
    expect(Object.fromEntries(m.energy)['Energiekennwert']).toBe('120 kWh/(m²·a)');
    expect(m.contact).toContain('info@example.de');
  });
  it('enthält keine Mieterdaten', () => {
    const { u, p, db } = setup();
    expect(JSON.stringify(buildExpose(db, u, p, settings, exposeDefaults(db, u, p)))).not.toContain('Geheim');
  });
});

describe('Hinweise', () => {
  it('fehlende Energieangaben, abgelaufener Ausweis, zu hohe Kaution, keine Fotos, kein Kontakt', () => {
    const { u, p, db } = setup({ eaType: '', eaClass: '', eaValidUntil: '2020-01-01' });
    expect(energyMissing(p)).toEqual(['Art des Energieausweises', 'Effizienzklasse']);
    const d = { ...exposeDefaults(db, u, p), deposit: 2500 };
    const w = exposeWarnings(db, u, p, d, defaultSettings, 0, NOW).join(' | ');
    expect(w).toMatch(/Energieangaben fehlen: Art des Energieausweises, Effizienzklasse/);
    expect(w).toMatch(/abgelaufen/);
    expect(w).toMatch(/über drei Nettokaltmieten/);
    expect(w).toMatch(/Foto/);
    expect(w).toMatch(/Telefon oder E-Mail/);
  });
  it('vollständig: keine Hinweise', () => {
    const { u, p, db } = setup();
    expect(exposeWarnings(db, u, p, exposeDefaults(db, u, p), settings, 2, NOW)).toEqual([]);
  });
});

describe('Exposé-PDF', () => {
  it('erzeugt ein gültiges PDF, mit und ohne Fotos', async () => {
    const { u, p, db } = setup();
    const base = buildExpose(db, u, p, settings, { ...exposeDefaults(db, u, p), location: 'Ruhige Lage.\n\nBus 200 m.' });
    const plain = await PDFDocument.load(await exposeToPdf({ ...base, gallery: [] }));
    expect(plain.getPageCount()).toBeGreaterThanOrEqual(1);
    const withPhotos = await PDFDocument.load(await exposeToPdf({ ...base, hero: PNG, gallery: [PNG, PNG, PNG] }));
    expect(withPhotos.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(withPhotos.getTitle()).toBe(base.title);
  });
  it('kaputtes Foto bricht das PDF nicht ab', async () => {
    const { u, p, db } = setup();
    const base = buildExpose(db, u, p, settings, exposeDefaults(db, u, p));
    const doc = await PDFDocument.load(await exposeToPdf({ ...base, hero: new Uint8Array([1, 2, 3]), gallery: [new Uint8Array([9, 9])] }));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
