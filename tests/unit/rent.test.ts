import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTerm, checkIncrease, indexRent, lastChange, monthEnd, monthStart } from '../../src/rent';
import { nkStatement, openItems, rentNow, termsOn, unitDue, unitDueAt } from '../../src/calc';
import { rentIncreaseModel } from '../../src/letters';
import { cockpit } from '../../src/cockpit';
import { defaultSettings } from '../../src/settingsDefaults';
import { dbWith, payment, simple } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

describe('Mietverlauf', () => {
  it('Stand je Datum: vor dem ersten Eintrag gilt die Basis', () => {
    const { u } = simple({}, { coldRent: 640, advance: 160 });
    const v = addTerm(addTerm(u, '2025-01-01', { coldRent: 700 }), '2026-01-01', { advance: 200 });
    expect(termsOn(v, '2024-12-31')).toEqual({ coldRent: 640, advance: 160 });
    expect(termsOn(v, '2025-06-01')).toEqual({ coldRent: 700, advance: 160 });
    expect(termsOn(v, '2026-01-01')).toEqual({ coldRent: 700, advance: 200 });
    expect(rentNow(v)).toEqual({ coldRent: 700, advance: 200 });
    expect(unitDue(v)).toBe(900);
    expect(unitDueAt(v, '2025-05')).toBe(860);
    expect(v.terms!.map((t) => t.from)).toEqual(['2025-01-01', '2026-01-01']);
  });
  it('gleiches Datum ersetzt, Reihenfolge bleibt, Gewerbe mit USt', () => {
    const { u } = simple({}, { kind: 'gewerbe', vat: 19, coldRent: 1000, advance: 0 });
    const v = addTerm(addTerm(addTerm(u, '2026-03-01', { coldRent: 1100 }), '2025-03-01', { coldRent: 1050 }), '2026-03-01', { coldRent: 1200 });
    expect(v.terms).toHaveLength(2);
    expect(v.terms![1].coldRent).toBe(1200);
    expect(unitDueAt(v, '2026-04')).toBe(1428); // 1.200 × 1,19
  });
  it('Offene Posten rechnen jeden Monat mit der damals geltenden Miete', () => {
    const { u, t, db } = simple({ moveIn: '2026-01-01', trackFrom: '2026-01' }, { coldRent: 500, advance: 100 });
    const unit = addTerm(u, '2026-07-01', { coldRent: 600 });
    const full = { ...db, units: [unit], payments: Array.from({ length: 6 }, (_, i) => payment(t.id, `2026-0${i + 1}`, 600)) };
    const items = openItems(full, full.tenants[0]);
    expect(items.find((x) => x.month === '2026-06')).toBeUndefined(); // 600 bezahlt = Soll
    expect(items.find((x) => x.month === '2026-07')).toMatchObject({ due: 700, open: 700 });
    expect(items.find((x) => x.month === '2026-11')).toMatchObject({ due: 700 });
  });
  it('Nebenkosten: Vorauszahlungen monatsgenau', () => {
    const { p, u, t, db } = simple({ moveIn: '2025-01-01' }, { advance: 100 });
    const unit = addTerm(u, '2025-07-01', { advance: 150 });
    const d = { ...db, units: [unit], costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müll', amount: 1500, key: 'area' as const }] };
    expect(nkStatement(d, t, unit, 2025).advances).toBe(1500); // 6 × 100 + 6 × 150
  });
  it('Cockpit: Soll je Monat nach Verlauf', () => {
    const { u, t, db } = simple({ moveIn: '2026-01-01', trackFrom: '2026-01' }, { coldRent: 640, advance: 160 });
    const unit = addTerm(u, '2026-10-01', { coldRent: 700 });
    const c = cockpit({ ...db, units: [unit], tenants: [t] }, NOW);
    expect(c.months.map((m) => [m.month, m.soll])).toEqual([['2026-06', 800], ['2026-07', 800], ['2026-08', 800], ['2026-09', 800], ['2026-10', 860], ['2026-11', 860]]);
    expect(c.rentRoll).toBe(860);
  });
});

describe('Datumshilfen', () => {
  it('Monatsanfang und -ende', () => {
    expect(monthStart('2026-11-15', 3)).toBe('2027-02-01');
    expect(monthStart('2026-11-15', 2)).toBe('2027-01-01');
    expect(monthEnd('2026-11-15', 2)).toBe('2027-01-31');
    expect(monthEnd('2026-12-02', 2)).toBe('2027-02-28');
  });
  it('letzte Änderung: Verlauf oder Einzug', () => {
    const { u, t } = simple({ moveIn: '2020-03-01' });
    expect(lastChange(u, t, NOW)).toBe('2020-03-01');
    expect(lastChange(addTerm(u, '2024-01-01', { coldRent: 700 }), t, NOW)).toBe('2024-01-01');
    expect(lastChange(addTerm(u, '2027-01-01', { coldRent: 700 }), t, NOW)).toBe('2020-03-01'); // Zukunft zählt nicht
  });
});

describe('Mieterhöhung prüfen: Vergleichsmiete (§ 558 BGB)', () => {
  const base = () => simple({ moveIn: '2020-01-01' }, { coldRent: 500, advance: 100, area: 50 });
  it('zulässig: unter Kappung und Vergleichsmiete, Fristen eingehalten', () => {
    const { u, t } = base();
    const c = checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 575, comparePerSqm: 12 });
    expect(c.errors).toEqual([]);
    expect(c).toMatchObject({ effective: '2027-02-01', consentUntil: '2027-01-31', currentRent: 500, increase: 75, increasePct: 15, perSqm: 11.5, maxByCap: 600, maxByCompare: 600 });
  });
  it('Kappungsgrenze 20 % bzw. 15 %', () => {
    const { u, t } = base();
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 601, comparePerSqm: 20 }).errors[0]).toContain('Kappungsgrenze');
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 580, comparePerSqm: 20, capPct: 15 }).errors[0]).toContain('15 %');
  });
  it('Kappung bezieht sich auf die Miete vor drei Jahren, nicht die jetzige', () => {
    const { u, t } = base();
    const v = addTerm(u, '2025-01-01', { coldRent: 560 }); // schon einmal erhöht
    const c = checkIncrease({ kind: 'vergleich', unit: v, tenant: t, letterDate: '2026-11-15', newRent: 610, comparePerSqm: 20 });
    expect(c.baseline3y).toBe(500);
    expect(c.maxByCap).toBe(600);
    expect(c.errors.join(' ')).toContain('Kappungsgrenze');
  });
  it('Sperrfristen: ein Jahr nach der letzten Erhöhung, 15 Monate bis zum Wirksamwerden', () => {
    const { u, t } = base();
    const v = addTerm(u, '2026-03-01', { coldRent: 520 });
    expect(checkIncrease({ kind: 'vergleich', unit: v, tenant: t, letterDate: '2026-11-15', newRent: 560, comparePerSqm: 20 }).errors.join(' ')).toContain('ein Jahr');
    const v2 = addTerm(u, '2025-12-01', { coldRent: 520 });
    expect(checkIncrease({ kind: 'vergleich', unit: v2, tenant: t, letterDate: '2026-11-15', newRent: 560, comparePerSqm: 20 }).errors.join(' ')).toContain('ein Jahr'); // 11 Monate seit 01.12.2025
    expect(checkIncrease({ kind: 'vergleich', unit: v2, tenant: t, letterDate: '2026-11-30', newRent: 560, comparePerSqm: 20 }).errors.join(' ')).toContain('15 Monaten'); // ein Jahr erfüllt, aber nur 14 Monate bis zum Wirksamwerden
    expect(checkIncrease({ kind: 'vergleich', unit: v2, tenant: t, letterDate: '2026-12-15', newRent: 560, comparePerSqm: 20 }).errors).toEqual([]); // 12 Monate, wirksam nach 15 Monaten
  });
  it('über Mietspiegel, ohne Mietspiegel, niedriger als jetzt', () => {
    const { u, t } = base();
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 580, comparePerSqm: 10 }).errors.join(' ')).toContain('Vergleichsmiete');
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 540 }).warnings.join(' ')).toContain('Mietspiegel');
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 480, comparePerSqm: 12 }).errors[0]).toContain('höher');
  });
  it('Gewerbe: Hinweis statt Wohnraumregeln', () => {
    const { u, t } = simple({ moveIn: '2020-01-01' }, { kind: 'gewerbe', coldRent: 1000, area: 100 });
    expect(checkIncrease({ kind: 'vergleich', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 1100, comparePerSqm: 12 }).warnings.join(' ')).toContain('Gewerbe');
  });
});

describe('Mieterhöhung prüfen: Indexmiete (§ 557b BGB)', () => {
  it('Miete aus dem Index, wirksam ab dem übernächsten Monat', () => {
    const { u, t } = simple({ moveIn: '2020-01-01', rentAdjust: 'Indexmiete' }, { coldRent: 500 });
    expect(indexRent(500, 110, 121)).toBe(550);
    const c = checkIncrease({ kind: 'index', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 0, indexOld: 110, indexNew: 121 });
    expect(c.errors).toEqual([]);
    expect(c).toMatchObject({ newRent: 550, increase: 50, increasePct: 10, effective: '2027-01-01' });
    expect(c.warnings).toEqual([]);
  });
  it('Fehler: Index nicht gestiegen, fehlt, zu kurz her; Hinweis ohne Indexvermerk', () => {
    const { u, t } = simple({ moveIn: '2020-01-01' }, { coldRent: 500 });
    expect(checkIncrease({ kind: 'index', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 0, indexOld: 120, indexNew: 118 }).errors.join(' ')).toContain('nicht gestiegen');
    expect(checkIncrease({ kind: 'index', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 0 }).errors.join(' ')).toContain('Index');
    expect(checkIncrease({ kind: 'index', unit: addTerm(u, '2026-06-01', { coldRent: 520 }), tenant: t, letterDate: '2026-11-15', newRent: 0, indexOld: 110, indexNew: 121 }).errors.join(' ')).toContain('ein Jahr');
    expect(checkIncrease({ kind: 'index', unit: u, tenant: t, letterDate: '2026-11-15', newRent: 0, indexOld: 110, indexNew: 121 }).warnings.join(' ')).toContain('Indexklausel');
  });
});

describe('Briefe zur Mieterhöhung', () => {
  const { u, t, p } = simple({ salutation: 'Frau' }, { coldRent: 500, advance: 100, area: 50 });
  const s = { ...defaultSettings, name: 'Muster' };
  it('Vergleichsmiete: Verlangen mit Zustimmungsfrist, Kündigungsrecht und Zustimmungserklärung', () => {
    const m = rentIncreaseModel('vergleich', t, u, p, s, { currentRent: 500, newRent: 575, effective: '2027-02-01', consentUntil: '2027-01-31', comparePerSqm: 12, advance: 100 }, '2026-11-15');
    const text = JSON.stringify(m.blocks);
    expect(m.title).toContain('Mieterhöhungsverlangen');
    expect(text).toContain('§ 558 BGB');
    expect(text).toContain('31.01.2027');
    expect(text).toContain('01.02.2027');
    expect(text).toContain('Zustimmungserklärung');
    expect(text).toContain('§ 561 BGB');
    const kv = (m.blocks.find((b) => b.t === 'kv') as { rows: [string, string][] }).rows;
    expect(Object.fromEntries(kv)).toMatchObject({ 'Gilt ab': '01.02.2027' });
  });
  it('Indexmiete: Berechnung steht im Brief, keine Zustimmung nötig', () => {
    const m = rentIncreaseModel('index', t, u, p, s, { currentRent: 500, newRent: 550, effective: '2027-01-01', indexOld: 110, indexNew: 121, advance: 100 }, '2026-11-15');
    const text = JSON.stringify(m.blocks);
    expect(text).toContain('§ 557b BGB');
    expect(text).toContain('121 ÷ 110');
    expect(text).toContain('Eine Zustimmung ist nicht erforderlich');
  });
  void dbWith;
});
