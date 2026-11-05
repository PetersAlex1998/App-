import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { houseSetup } from '../../src/setup';
import { computeTasks } from '../../src/tasks';
import { dbWith, property, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());
const ids = (s: ReturnType<typeof houseSetup>, f: (i: any) => boolean) => s.items.filter(f).map((i) => i.id);

describe('Haus einrichten', () => {
  it('leeres Haus: Pflichtangaben offen, nichts erfunden', () => {
    const p = property({ street: '', zip: '', city: '' });
    const s = houseSetup(dbWith({ properties: [p] }), p, NOW);
    expect(ids(s, (i) => !i.done && i.core)).toEqual(['adresse', 'einheiten', 'flaechen']);
    expect(s.coreOpen).toBe(3);
    expect(s.items.find((i) => i.id === 'adresse')!.detail).toMatch(/Straße, PLZ, Ort/);
    expect(s.done + s.open.length).toBe(s.total);
  });
  it('Flächen: zählt Einheiten ohne Fläche und führt zur ersten', () => {
    const p = property(); const a = unit(p.id, { name: 'W1', area: 0 }); const b = unit(p.id, { name: 'W2', area: 50 });
    const s = houseSetup(dbWith({ properties: [p], units: [a, b] }), p, NOW);
    const f = s.items.find((i) => i.id === 'flaechen')!;
    expect(f.done).toBe(false);
    expect(f.detail).toMatch(/1 Einheit ohne Fläche \(W1\)/);
    expect(f.params).toEqual({ id: a.id });
  });
  it('Energieausweis: fehlende Angaben, abgelaufen, vollständig', () => {
    const base = { eaType: 'Verbrauch', eaValue: '120', eaClass: 'D', energySource: 'Gas', yearBuilt: '1975', eaValidUntil: '2030-01-01' };
    const get = (o: object) => { const p = property({ ...base, ...o }); return houseSetup(dbWith({ properties: [p] }), p, NOW).items.find((i) => i.id === 'energie')!; };
    expect(get({}).done).toBe(true);
    expect(get({ eaClass: '' }).detail).toMatch(/Effizienzklasse/);
    expect(get({ eaValidUntil: '2020-01-01' })).toMatchObject({ done: false });
  });
  it('Mietspiegel entfällt bei reinem Gewerbe; Darlehen und Co. lassen sich als „nicht nötig“ ausnehmen', () => {
    const p = property(); const g = unit(p.id, { kind: 'gewerbe' });
    const s0 = houseSetup(dbWith({ properties: [p], units: [g] }), p, NOW);
    expect(s0.items.find((i) => i.id === 'mietspiegel')!.done).toBe(true);
    const skipped = { ...p, setupSkip: ['darlehen', 'zaehler', 'core-darf-nicht'] };
    const s1 = houseSetup(dbWith({ properties: [skipped], units: [g] }), skipped, NOW);
    expect(s1.items.find((i) => i.id === 'darlehen')).toMatchObject({ skipped: true });
    expect(s1.total).toBe(s0.total - 2);
    const core = { ...p, setupSkip: ['adresse'] };
    expect(houseSetup(dbWith({ properties: [core] }), core, NOW).items.find((i) => i.id === 'adresse')!.skipped).toBe(false); // Pflichtangaben nicht überspringbar
  });
  it('vorhandene Daten erledigen die Schritte', () => {
    const p = property({ purchasePrice: '1', marketValue: '2', insurer: 'X', contactName: 'Meier', rentBasis: { kind: 'keiner' } });
    const u = unit(p.id);
    const db = dbWith({ properties: [p], units: [u], meters: [{ id: 'm', propertyId: p.id, unitId: u.id, type: 'heizung', number: '1' }], loans: [{ id: 'l', propertyId: p.id, name: 'B', amount: 1, start: '2025-01-01', rate: 1 }], checks: [{ id: 'c', propertyId: p.id, title: 'x', intervalMonths: 12 }] });
    const s = houseSetup(db, p, NOW);
    expect(ids(s, (i) => !i.done)).toEqual(['energie']);
  });
});

describe('Aufgabe „Haus einrichten“', () => {
  it('nur bei fehlenden Pflichtangaben; optionale Schritte machen keine Aufgabe', () => {
    const p = property({ street: '' });
    const t = computeTasks(dbWith({ properties: [p] }), { now: NOW }).find((x) => x.id === `einrichten:${p.id}`)!;
    expect(t.level).toBe('normal');
    expect(t.screen).toBe('HouseSetup');
    expect(t.detail).toMatch(/Adresse, Wohnungen und Gewerbe, Flächen/);
    const q = property(); const u = unit(q.id, { area: 50 });
    const minimal = dbWith({ properties: [q], units: [u] });
    expect(houseSetup(minimal, q, NOW).open.length).toBeGreaterThan(0); // optionale Schritte offen …
    expect(computeTasks(minimal, { now: NOW }).some((x) => x.id.startsWith('einrichten:'))).toBe(false); // … aber keine Aufgabe
  });
});
