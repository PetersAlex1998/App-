import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, cockpit, deadlines } from '../../src/cockpit';
import { defaultSettings } from '../../src/settingsDefaults';
import { bigDb, dbWith, payment, property, simple, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

describe('Cockpit: Kennzahlen', () => {
  it('Soll-Miete, Leerstand und Auslastung', () => {
    const p = property({ houseNo: 1 });
    const u1 = unit(p.id, { coldRent: 600, advance: 150 }), u2 = unit(p.id, { coldRent: 500, advance: 100, name: 'Wohnung 2' }), u3 = unit(p.id, { kind: 'gewerbe', vat: 19, coldRent: 1000, advance: 0, name: 'Gewerbe 1' });
    const t1 = tenant(u1.id, { moveIn: '2020-01-01' });
    const db = dbWith({ properties: [p], units: [u1, u2, u3], tenants: [t1] });
    const c = cockpit(db, NOW);
    expect(c.rentRoll).toBe(750);
    expect(c.vacantLoss).toBe(1790); // 600 + 1190 (Gewerbe mit 19 % USt)
    expect(c.occupancy).toBe(33);
    expect(c.vacantUnits).toHaveLength(2);
  });
  it('Mieteingang des Monats: Soll aus Mietverhältnissen, Ist aus gebuchten Mieten', () => {
    const { t, db } = simple({ moveIn: '2026-01-01', trackFrom: '2026-01' }); // 800 €/Monat
    const full = { ...db, payments: [payment(t.id, '2026-11', 800), payment(t.id, '2026-10', 400), payment(t.id, '2026-10', 400, { kind: 'kaution' })] };
    const c = cockpit(full, NOW);
    expect(c.month).toBe('2026-11');
    expect([c.sollMonth, c.istMonth, c.rate]).toEqual([800, 800, 100]);
    expect(c.months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(c.months[4]).toMatchObject({ soll: 800, ist: 400 }); // Kaution zählt nicht
  });
  it('Rückstände nach Höhe sortiert, Auszug wird nicht gezählt', () => {
    const p = property({ houseNo: 1 });
    const u1 = unit(p.id), u2 = unit(p.id, { name: 'Wohnung 2' }), u3 = unit(p.id, { name: 'Wohnung 3' });
    const a = tenant(u1.id, { moveIn: '2026-09-01', trackFrom: '2026-09' }), b = tenant(u2.id, { moveIn: '2026-10-01', trackFrom: '2026-10' }), gone = tenant(u3.id, { moveIn: '2020-01-01', moveOut: '2026-03-31', trackFrom: '2026-04' });
    const c = cockpit(dbWith({ properties: [p], units: [u1, u2, u3], tenants: [a, b, gone] }), NOW);
    expect(c.arrears.map((x) => x.tenant.id)).toEqual([a.id, b.id]);
    expect(c.openTotal).toBe(c.arrears[0].open + c.arrears[1].open);
    expect(c.arrears[0].open).toBeGreaterThan(c.arrears[1].open);
  });
  it('Häuser im Vergleich', () => {
    const p1 = property({ houseNo: 1, name: 'A' }), p2 = property({ houseNo: 2, name: 'B' });
    const u1 = unit(p1.id), u2 = unit(p1.id, { name: 'Wohnung 2' }), u3 = unit(p2.id);
    const t = tenant(u1.id, { moveIn: '2026-10-01', trackFrom: '2026-10' });
    const c = cockpit(dbWith({ properties: [p1, p2], units: [u1, u2, u3], tenants: [t] }), NOW);
    expect(c.houses.find((h) => h.name === 'A')).toMatchObject({ units: 2, vacant: 1, occupancy: 50, soll: 800 });
    expect(c.houses.find((h) => h.name === 'B')).toMatchObject({ units: 1, vacant: 1, occupancy: 0, soll: 0 });
  });
  it('Jahresergebnis nutzt Einnahmen und Ausgaben des laufenden Jahres', () => {
    const { p, t, db } = simple({ moveIn: '2026-01-01' });
    const full = { ...db, payments: [payment(t.id, '2026-02', 800, { date: '2026-02-03' }), payment(t.id, '2025-12', 800, { date: '2025-12-03' })], expenses: [{ id: 'e', propertyId: p.id, date: '2026-05-01', amount: 100, category: 'sonstiges' as const, vendor: '', description: '' }] };
    expect(cockpit(full, NOW).ytd).toMatchObject({ income: 800, expenses: 100, surplus: 700 });
  });
  it('leerer Bestand bricht nicht', () => {
    const c = cockpit(dbWith({}), NOW);
    expect(c).toMatchObject({ rentRoll: 0, occupancy: 0, rate: null, openTotal: 0 });
  });
  it('Großbestand (88 Einheiten) in unter 500 ms', () => {
    const db = bigDb();
    const t0 = performance.now();
    const c = cockpit(db, NOW);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(c.houses).toHaveLength(7);
    expect(c.rentRoll).toBeGreaterThan(0);
  });
});

describe('Cockpit: Handlungsfelder und Fristen', () => {
  it('Sicherung fällig und Datenprüfung erscheinen, gefährliches zuerst', () => {
    const { db } = simple({ moveIn: '' });
    const a = actions(db, { ...defaultSettings }, NOW);
    expect(a.map((x) => x.key)).toEqual(expect.arrayContaining(['aufgaben', 'backup']));
    expect(a[0].tone).toBe('danger');
  });
  it('Mahnlauf nennt die Zahl der fälligen Mieter', () => {
    const { db } = simple({ moveIn: '2026-01-01', trackFrom: '2026-01' });
    const a = actions(db, { ...defaultSettings, lastBackupAt: `${NOW}T00:00:00Z` }, NOW);
    expect(a.find((x) => x.key === 'mahnlauf')).toMatchObject({ count: 1, screen: 'Mahnlauf' });
  });
  it('Fristen: überfällig und bald, nach Datum sortiert, Ferneres ausgeblendet', () => {
    const p = property({ houseNo: 1, eaValidUntil: '2026-11-01' });
    const u = unit(p.id);
    const t1 = tenant(u.id, { name: 'A', moveIn: '2020-01-01', contractEnd: '2027-01-10' }), t2 = tenant(u.id, { name: 'B', moveIn: '2020-01-01', contractEnd: '2028-01-10', nextAdjust: '2026-12-20', rentAdjust: 'Index' });
    const d = deadlines(dbWith({ properties: [p], units: [u], tenants: [t1, t2] }), NOW);
    expect(d.map((x) => x.key)).toEqual(['ea' + p.id, 'na' + t2.id, 'ce' + t1.id]);
    expect(d[0]).toMatchObject({ tone: 'danger', subtitle: 'seit 14 Tagen überfällig' });
    expect(d[1].subtitle).toBe('Index in 35 Tagen');
  });
});
