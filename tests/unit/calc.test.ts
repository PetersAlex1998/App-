import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, dateDE, dueMonths, eur, initials, kindOf, monthLabel, monthLong, nkStatement, num, oldestOpenMonth, openItems, suggestPayment, totalOpen, unitDue, vatFactor } from '../../src/calc';
import { dbWith, payment, simple, tenant, unit, property, resetIds } from '../helpers/builders';

const at = (iso: string) => vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
beforeEach(() => { vi.useFakeTimers(); at('2026-11-12'); resetIds(); });
afterEach(() => vi.useRealTimers());

describe('Zahlenformate', () => {
  it('eur im deutschen Format', () => { expect(eur(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €'); });
  it('num liest deutsche Zahlen und ist bei Unsinn 0', () => {
    expect(num('1.250,5')).toBe(1250.5);
    expect(num('640,00')).toBe(640);
    expect(num('abc')).toBe(0);
  });
  it('Datum und Monat', () => {
    expect(dateDE('2026-11-03')).toBe('03.11.2026');
    expect(dateDE('')).toBe('–');
    expect(monthLabel('2026-10')).toBe('Okt 2026');
    expect(monthLong('2026-03')).toBe('März 2026');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('Initialen', () => { expect(initials('Anna Schmidt')).toBe('AS'); expect(initials('  ')).toBe('?'); });
});

describe('Miete je Einheit', () => {
  it('Wohnung: Kaltmiete + Nebenkosten', () => { expect(unitDue(unit('p', { coldRent: 640, advance: 160 }))).toBe(800); });
  it('Gewerbe mit 19 % USt wird brutto berechnet', () => {
    const u = unit('p', { kind: 'gewerbe', vat: 19, coldRent: 1200, advance: 250 });
    expect(vatFactor(u)).toBeCloseTo(1.19);
    expect(unitDue(u)).toBe(1725.5);
  });
  it('USt zählt nur bei Gewerbe', () => { expect(vatFactor(unit('p', { kind: 'wohnung', vat: 19 }))).toBe(1); });
  it('Art fehlt = Wohnung', () => { expect(kindOf(unit('p'))).toBe('wohnung'); });
});

describe('Mietmonate (dueMonths)', () => {
  it('vom Einzug bis zum laufenden Monat', () => {
    const t = tenant('u', { moveIn: '2026-08-15' });
    expect(dueMonths(t)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
  });
  it('„Offene Posten ab“ verkürzt, ältere Monate zählen nicht', () => {
    expect(dueMonths(tenant('u', { moveIn: '2022-03-01', trackFrom: '2026-10' }))).toEqual(['2026-10', '2026-11']);
  });
  it('trackFrom vor dem Einzug ändert nichts', () => {
    expect(dueMonths(tenant('u', { moveIn: '2026-10-01', trackFrom: '2020-01' }))).toEqual(['2026-10', '2026-11']);
  });
  it('Ausgezogene: bis zum Auszugsmonat', () => {
    expect(dueMonths(tenant('u', { moveIn: '2026-06-01', moveOut: '2026-08-31' }))).toEqual(['2026-06', '2026-07', '2026-08']);
  });
  it('Einzug in der Zukunft: nichts fällig', () => { expect(dueMonths(tenant('u', { moveIn: '2027-01-01' }))).toEqual([]); });
});

describe('Offene Posten', () => {
  it('ohne Zahlungen ist jeder Monat offen', () => {
    const { db, t } = simple({ moveIn: '2026-09-01' });
    const items = openItems(db, t);
    expect(items.map((i) => i.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(totalOpen(db, t)).toBe(2400);
  });
  it('Teilzahlung: Rest bleibt offen', () => {
    const { db, t, p, u } = simple({ moveIn: '2026-10-01' });
    const d = dbWith({ properties: [p], units: [u], tenants: [t], payments: [payment(t.id, '2026-10', 790)] });
    const [i] = openItems(d, t);
    expect(i).toMatchObject({ month: '2026-10', paid: 790, open: 10 });
  });
  it('voll bezahlte Monate fallen heraus', () => {
    const { t, p, u } = simple({ moveIn: '2026-10-01' });
    const d = dbWith({ properties: [p], units: [u], tenants: [t], payments: [payment(t.id, '2026-10', 800), payment(t.id, '2026-11', 800)] });
    expect(openItems(d, t)).toEqual([]);
  });
  it('Kaution und Nachzahlung tilgen keine Miete', () => {
    const { t, p, u } = simple({ moveIn: '2026-11-01' });
    const d = dbWith({ properties: [p], units: [u], tenants: [t], payments: [payment(t.id, '2026-11', 800, { kind: 'kaution' }), payment(t.id, '2026-11', 800, { kind: 'nachzahlung' })] });
    expect(totalOpen(d, t)).toBe(800);
  });
  it('mehrere Zahlungen im Monat werden summiert', () => {
    const { t, p, u } = simple({ moveIn: '2026-11-01' });
    const d = dbWith({ properties: [p], units: [u], tenants: [t], payments: [payment(t.id, '2026-11', 500), payment(t.id, '2026-11', 300)] });
    expect(totalOpen(d, t)).toBe(0);
  });
  it('Gewerbe: Soll ist brutto', () => {
    const { db, t } = simple({ moveIn: '2026-11-01' }, { kind: 'gewerbe', vat: 19, coldRent: 1000, advance: 0 });
    expect(totalOpen(db, t)).toBe(1190);
  });
  it('oldestOpenMonth berücksichtigt zusätzliche Zahlungen', () => {
    const { db, t } = simple({ moveIn: '2026-09-01' });
    expect(oldestOpenMonth(db, t)).toBe('2026-09');
    expect(oldestOpenMonth(db, t, new Map([[`${t.id}|2026-09`, 800]]))).toBe('2026-10');
  });
  it('Vorschlag für „Zahlung erfassen“: ältester offener Monat und dessen Betrag', () => {
    const { db, t } = simple({ moveIn: '2026-10-01' });
    expect(suggestPayment(db, t)).toEqual({ month: '2026-10', amount: 800 });
  });
});

/* ───────── Nebenkostenabrechnung ───────── */
function haus() {
  const p = property({ houseNo: 1 });
  const u1 = unit(p.id, { name: 'WE1', area: 60, no: 1, coldRent: 500, advance: 100 });
  const u2 = unit(p.id, { name: 'WE2', area: 100, no: 2, coldRent: 900, advance: 200 });
  const u3 = unit(p.id, { name: 'WE3', area: 40, no: 3 }); // Leerstand, kein Zähler
  const u4 = unit(p.id, { name: 'Laden', area: 100, kind: 'gewerbe', vat: 19, no: 1, coldRent: 1000, advance: 200 });
  const a = tenant(u1.id, { name: 'Anna', moveIn: '2020-01-01' });
  const b = tenant(u2.id, { name: 'Alt', moveIn: '2020-01-01', moveOut: '2025-06-30' });
  const c = tenant(u2.id, { name: 'Neu', moveIn: '2025-07-01' });
  const d = tenant(u4.id, { name: 'Bäcker', moveIn: '2020-01-01' });
  const meters = [u1, u2, u4].map((u, i) => ({ id: `m${i}`, propertyId: p.id, unitId: u.id, type: 'wasser_kalt' as const, number: String(i) }));
  const rd = (meterId: string, date: string, value: number) => ({ id: `${meterId}${date}`, meterId, date, value });
  const readings = [rd('m0', '2024-12-31', 100), rd('m0', '2025-12-31', 130), rd('m1', '2024-12-31', 500), rd('m1', '2025-06-30', 530), rd('m1', '2025-12-31', 560), rd('m2', '2024-12-31', 10), rd('m2', '2025-12-31', 40)];
  const costs = [
    { id: 'c1', propertyId: p.id, year: 2025, category: 'Grundsteuer', amount: 1000, key: 'area' as const },
    { id: 'c2', propertyId: p.id, year: 2025, category: 'Müll', amount: 400, key: 'units' as const },
    { id: 'c3', propertyId: p.id, year: 2025, category: 'Wasser', amount: 600, key: 'consumption' as const, meterType: 'wasser_kalt' as const },
  ];
  return { p, units: { u1, u2, u3, u4 }, tenants: { a, b, c, d }, db: dbWith({ properties: [p], units: [u1, u2, u3, u4], tenants: [a, b, c, d], meters, readings, costs }) };
}

describe('Nebenkostenabrechnung', () => {
  const stmt = (who: 'a' | 'b' | 'c' | 'd', unitKey: 'u1' | 'u2' | 'u4', db = haus()) => nkStatement(db.db, db.tenants[who], db.units[unitKey], 2025);

  it('Ganzjahres-Mieter: Fläche + je Einheit + Verbrauch', () => {
    const h = haus();
    const r = nkStatement(h.db, h.tenants.a, h.units.u1, 2025);
    // Grundsteuer 1000 * 60/300 = 200, Müll 400/4 = 100, Wasser 600 * 30/120 = 150
    expect(r.months).toBe(12);
    expect(r.lines.map((l) => l.share)).toEqual([200, 100, 150]);
    expect(r.costs).toBe(450);
    expect(r.advances).toBe(1200);
    expect(r.balance).toBe(-750); // Guthaben
  });
  it('Mieterwechsel im Jahr: anteilig nach Monaten, Verbrauch nach Zeitraum (Zwischenablesung)', () => {
    const h = haus();
    const alt = nkStatement(h.db, h.tenants.b, h.units.u2, 2025);
    const neu = nkStatement(h.db, h.tenants.c, h.units.u2, 2025);
    expect(alt.months).toBe(6); expect(neu.months).toBe(6);
    // Grundsteuer 1000*100/300*6/12 = 166,67; Müll 100*6/12 = 50; Wasser 30 m³ -> 150
    expect(alt.costs).toBeCloseTo(366.67, 2);
    expect(neu.costs).toBeCloseTo(366.67, 2);
    expect(alt.lines[2].share).toBe(150);
    expect(neu.lines[2].share).toBe(150);
  });
  it('Gewerbe mit USt: Anteile und Vorauszahlung brutto', () => {
    const h = haus();
    const r = nkStatement(h.db, h.tenants.d, h.units.u4, 2025);
    expect(r.costs).toBeCloseTo(694.17, 2); // (333,33 + 100 + 150) * 1,19
    expect(r.advances).toBeCloseTo(200 * 1.19 * 12, 2);
  });
  it('Warnung, wenn für eine Einheit kein Verbrauch erfasst ist', () => {
    const h = haus();
    const r = nkStatement(h.db, h.tenants.a, h.units.u1, 2025);
    expect(r.warnings.some((w) => w.includes('Kein Verbrauch erfasst') && w.includes('WE3'))).toBe(true);
  });
  it('Verbrauchs- und Grundkostenanteil (70/30)', () => {
    const h = haus();
    const db = { ...h.db, costs: [{ id: 'h', propertyId: h.p.id, year: 2025, category: 'Heizung', amount: 2000, key: 'consumption' as const, meterType: 'wasser_kalt' as const, consumptionShare: 70 }] };
    const a = nkStatement(db, h.tenants.a, h.units.u1, 2025);
    const b = nkStatement(db, h.tenants.b, h.units.u2, 2025);
    // Gesamtverbrauch 120 m³ (WE1 30, WE2 60, Laden 30). Verbrauchsteil 1400 €, Grundkosten 600 € nach Fläche (300 m²).
    expect(a.lines[0].share).toBeCloseTo(350 + 120, 2); // 1400*30/120 + 600*60/300
    expect(b.lines[0].share).toBeCloseTo(350 + 100, 2); // Wechsel zum 30.06.: Verbrauch 30 m³, Grundkosten 6/12 von 200
    expect(a.lines[0].key).toContain('70 %');
  });
  it('Heizkostenverordnung: Anteil außerhalb 50–70 % wird gemeldet', () => {
    const h = haus();
    const m = [{ id: 'hm', propertyId: h.p.id, unitId: h.units.u1.id, type: 'heizung' as const, number: '1' }];
    const rds = [{ id: 'x1', meterId: 'hm', date: '2024-12-31', value: 0 }, { id: 'x2', meterId: 'hm', date: '2025-12-31', value: 100 }];
    const db = { ...h.db, meters: [...h.db.meters, ...m], readings: [...h.db.readings, ...rds], costs: [{ id: 'h', propertyId: h.p.id, year: 2025, category: 'Heizung', amount: 1000, key: 'consumption' as const, meterType: 'heizung' as const, consumptionShare: 90 }] };
    const r = nkStatement(db, h.tenants.a, h.units.u1, 2025);
    expect(r.warnings.some((w) => w.includes('Heizkostenverordnung'))).toBe(true);
  });
  it('ohne Kosten: keine Zeilen', () => {
    const h = haus();
    expect(nkStatement({ ...h.db, costs: [] }, h.tenants.a, h.units.u1, 2025).lines).toEqual([]);
  });
  it('Einzug nach dem Abrechnungsjahr: 0 Monate', () => {
    const h = haus();
    const spaet = { ...h.tenants.a, moveIn: '2026-03-01' };
    expect(nkStatement(h.db, spaet, h.units.u1, 2025).months).toBe(0);
  });
  it('Hilfsfunktion stmt liefert Ergebnisse', () => { expect(stmt('a', 'u1').lines).toHaveLength(3); });
});
