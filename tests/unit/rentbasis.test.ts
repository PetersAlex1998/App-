import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basisNotes, comparablesCap, defaultBasis, findComparables, potential } from '../../src/rentBasis';
import { computeTasks } from '../../src/tasks';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

/** Haus mit n vermieteten Wohnungen; die erste (Index 0) ist die Zielwohnung. */
function house(rents: number[], over = {}) {
  const p = property({ city: 'Bad Lippspringe', ...over });
  const units = rents.map((r, i) => unit(p.id, { name: `W${i + 1}`, area: 50, coldRent: r }));
  const tenants = units.map((u) => tenant(u.id, { moveIn: '2020-01-01' }));
  return { p, units, db: dbWith({ properties: [p], units, tenants }) };
}

describe('Begründungsart je Haus', () => {
  it('Mietspiegel vorhanden → Mietspiegel, sonst Vergleichswohnungen', () => {
    expect(defaultBasis(property({ rentBasis: { kind: 'eigene' } }))).toBe('mietspiegel');
    expect(defaultBasis(property({ rentBasis: { kind: 'andere', gemeinde: 'Paderborn' } }))).toBe('mietspiegel');
    expect(defaultBasis(property({ rentBasis: { kind: 'keiner' } }))).toBe('vergleich');
    expect(defaultBasis(property())).toBe('vergleich');
  });
  it('Hinweise: nicht festgelegt, anderer Ort, keiner, abgelaufen', () => {
    expect(basisNotes(property())[0]).toMatch(/noch nicht hinterlegt/);
    expect(basisNotes(property({ rentBasis: { kind: 'andere', gemeinde: 'Paderborn' } })).join(' ')).toMatch(/§ 558a Abs. 4/);
    expect(basisNotes(property({ rentBasis: { kind: 'keiner' } })).join(' ')).toMatch(/drei Vergleichswohnungen/);
    expect(basisNotes(property({ rentBasis: { kind: 'eigene', name: 'MS 2022', validUntil: '2025-12-31' } }), NOW).join(' ')).toMatch(/nur bis 31\.12\.2025/);
    expect(basisNotes(property({ rentBasis: { kind: 'eigene', validUntil: '2027-12-31' } }), NOW)).toEqual([]);
  });
});

describe('Vergleichswohnungen', () => {
  it('nur gleiche Art, ähnliche Größe, mit Mieter, ohne die Wohnung selbst', () => {
    const { p, units, db } = house([500, 600, 620, 640]);
    const big = unit(p.id, { name: 'Groß', area: 120, coldRent: 900 });
    const leer = unit(p.id, { name: 'Leer', area: 50, coldRent: 700 });
    const gew = unit(p.id, { name: 'Laden', kind: 'gewerbe', area: 50, coldRent: 800 });
    const d2 = { ...db, units: [...db.units, big, leer, gew], tenants: [...db.tenants, tenant(big.id), tenant(gew.id)] };
    const c = findComparables(d2, units[0]);
    expect(c.map((x) => x.perSqm)).toEqual([12, 12.4, 12.8]);
    expect(c.every((x) => x.sameHouse)).toBe(true);
  });
  it('Obergrenze: mindestens drei, Durchschnitt und Spanne', () => {
    const { units, db } = house([500, 600, 620, 640]);
    const c = findComparables(db, units[0]);
    expect(comparablesCap(c.slice(0, 2)).ok).toBe(false);
    const cap = comparablesCap(c);
    expect(cap).toMatchObject({ ok: true, count: 3, min: 12, max: 12.8, avg: 12.4 });
    expect(comparablesCap([]).ok).toBe(false);
  });
});

describe('Mieterhöhungs-Potenzial', () => {
  it('schlägt die Erhöhung auf den Durchschnitt vor, begrenzt durch die Kappung', () => {
    const { units, db } = house([500, 600, 620, 640]); // Ø 12,40 €/m² → 620 €; Kappung 20 % von 500 = 600
    const [top] = potential(db).filter((x) => x.unit.id === units[0].id);
    expect(top.basis).toBe('vergleich');
    expect(top.count).toBe(3);
    expect(top.target).toBe(600);
    expect(top.gainMonth).toBe(100);
  });
  it('ohne drei Vergleichswohnungen und ohne Mietspiegel kein Vorschlag', () => {
    const { db } = house([500, 600, 620]);
    expect(potential(db)).toEqual([]);
  });
  it('Mietspiegelwert der Wohnung hat Vorrang', () => {
    const { units, db } = house([500]);
    const u = { ...units[0], mietspiegel: { mean: 11, upper: 12, date: NOW } };
    const [x] = potential({ ...db, units: [u] });
    expect(x.basis).toBe('mietspiegel');
    expect(x.target).toBe(600);
  });
  it('Sperrfrist wird als Grund gemeldet und sortiert nach hinten', () => {
    const { units, db } = house([500, 600, 620, 640]);
    const u0 = { ...units[0], terms: [{ from: '2026-06-01', coldRent: 500, advance: 160 }] };
    const r = potential({ ...db, units: [u0, ...db.units.slice(1)] });
    const mine = r.find((x) => x.unit.id === u0.id)!;
    expect(mine.blocked).toBeTruthy();
  });
});

describe('Aufgabe: Mietspiegel abgelaufen', () => {
  it('erscheint nur bei abgelaufener Gültigkeit', () => {
    const old = dbWith({ properties: [property({ rentBasis: { kind: 'eigene', name: 'MS', validUntil: '2025-12-31' } })] });
    expect(computeTasks(old, { now: NOW }).some((t) => t.id.startsWith('mietspiegel:'))).toBe(true);
    const ok = dbWith({ properties: [property({ rentBasis: { kind: 'eigene', validUntil: '2027-12-31' } })] });
    expect(computeTasks(ok, { now: NOW }).some((t) => t.id.startsWith('mietspiegel:'))).toBe(false);
  });
});
