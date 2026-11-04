import { describe, expect, it } from 'vitest';
import { computeTasks } from '../../src/tasks';
import { dbWith, payment, property, simple, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-03';

describe('Aufgaben aus der Datenprüfung', () => {
  it('sauberer Bestand: keine Aufgaben', () => {
    const { db } = simple({ moveIn: '2024-01-01' });
    expect(computeTasks(db, { now: NOW })).toEqual([]);
  });
  it('zwei aktive Mieter in einer Einheit ist „hoch“ und steht oben', () => {
    const { p, u, db } = simple({ name: 'Eins', moveIn: '2020-01-01' });
    const full = { ...db, tenants: [...db.tenants, tenant(u.id, { name: 'Zwei', moveIn: '' })] };
    const t = computeTasks(full, { now: NOW });
    expect(t[0]).toMatchObject({ level: 'hoch', screen: 'UnitDetail', params: { id: u.id } });
    expect(t[0].title).toContain('2 aktive Mieter');
    expect(t.some((x) => x.id.startsWith('einzug:'))).toBe(true);
    expect(p).toBeTruthy();
  });
  it('Vermerk „bitte prüfen/ergänzen“ wird zur Aufgabe, Erledigt blendet aus', () => {
    const { db, t } = simple({ notes: 'Sonstiges. Einzugsdatum unbekannt, bitte ergänzen. Mehr.' });
    const all = computeTasks(db, { now: NOW });
    const n = all.find((x) => x.id === `notiz:${t.id}`)!;
    expect(n.detail).toContain('bitte ergänzen');
    expect(computeTasks(db, { now: NOW, dismissed: [`notiz:${t.id}`] }).some((x) => x.id === n.id)).toBe(false);
  });
  it('vermietete Einheit ohne Fläche oder Miete', () => {
    const { db } = simple({}, { area: 0 });
    expect(computeTasks(db, { now: NOW }).some((x) => x.title.includes('Fläche fehlt'))).toBe(true);
  });
  it('frühere Mieter zählen nicht als aktiv und werden nur als Hinweis gesammelt', () => {
    const { u, db } = simple({ moveIn: '2022-01-01' });
    const full = { ...db, tenants: [tenant(u.id, { name: 'Alt', moveIn: '', moveOut: '2021-12-31' }), ...db.tenants] };
    const t = computeTasks(full, { now: NOW });
    expect(t.some((x) => x.level === 'hoch')).toBe(false);
    expect(t.find((x) => x.id === 'historie-einzug')).toMatchObject({ level: 'hinweis' });
  });
  it('Zählerstände zum letzten Jahresende fehlen: eine Sammelaufgabe pro Haus', () => {
    const { p, u, db } = simple({ moveIn: '2020-01-01' });
    const meters = [{ id: 'm1', propertyId: p.id, unitId: u.id, type: 'heizung' as const, number: '1' }, { id: 'm2', propertyId: p.id, unitId: u.id, type: 'wasser_kalt' as const, number: '2' }];
    const readings = [{ id: 'r1', meterId: 'm1', date: '2015-12-04', value: 1 }, { id: 'r2', meterId: 'm2', date: '2025-12-31', value: 5 }];
    const t = computeTasks({ ...db, meters, readings }, { now: NOW });
    const z = t.find((x) => x.id.startsWith('zaehler:'))!;
    expect(z.title).toBe('Zählerstände 2025: 1 von 2 fehlen');
    expect(z).toMatchObject({ screen: 'Ablesung', params: { propertyId: p.id } });
  });
  it('Ausgaben ohne Beleg erst nach einer Woche', () => {
    const { p, db } = simple({ moveIn: '2020-01-01' });
    const e = (id: string, date: string) => ({ id, propertyId: p.id, date, amount: 5, category: 'sonstiges' as const, vendor: '', description: '' });
    expect(computeTasks({ ...db, expenses: [e('a', '2026-11-01')] }, { now: NOW })).toEqual([]);
    expect(computeTasks({ ...db, expenses: [e('a', '2026-10-01'), e('b', '2026-10-02')] }, { now: NOW })[0].title).toBe('2 Ausgaben ohne Beleg');
  });
  it('unterstützt große Bestände zügig', () => {
    const p = property({ houseNo: 1 });
    const units = Array.from({ length: 200 }, (_, i) => unit(p.id, { name: `Wohnung ${i + 1}`, no: i + 1 }));
    const tenants = units.map((u) => tenant(u.id, { moveIn: '2020-01-01' }));
    const t0 = performance.now();
    computeTasks(dbWith({ properties: [p], units, tenants, payments: [payment(tenants[0].id, '2026-01', 1)] }), { now: NOW });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('Aufgaben: Nebenkosten-Kreislauf', () => {
  it('umlagefähige Ausgaben des Vorjahres, noch nicht übernommen', () => {
    const { p, db } = simple({ moveIn: '2020-01-01' });
    const e = { id: 'e', propertyId: p.id, date: '2025-05-01', amount: 100, category: 'betriebskosten' as const, vendor: '', description: 'Müllabfuhr', allocatable: true };
    const t = computeTasks({ ...db, expenses: [{ ...e, receiptId: 'd' }] }, { now: NOW });
    expect(t.find((x) => x.id.startsWith('nkkosten:'))).toMatchObject({ screen: 'NkKosten', params: { propertyId: p.id, year: '2025' } });
    const done = computeTasks({ ...db, expenses: [{ ...e, receiptId: 'd' }], costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müllabfuhr', amount: 100, key: 'area' as const }] }, { now: NOW });
    expect(done.some((x) => x.id.startsWith('nkkosten:'))).toBe(false);
  });
  it('angekündigte Vorauszahlung wird fällig', () => {
    const { db, t } = simple({ moveIn: '2020-01-01', advanceChange: { from: '2026-11-01', amount: 150, letterDate: '2026-09-10' } });
    expect(computeTasks(db, { now: NOW }).find((x) => x.id.startsWith('vorauszahlung:'))).toMatchObject({ screen: 'UnitDetail' });
    expect(computeTasks({ ...db, tenants: [{ ...t, advanceChange: { ...t.advanceChange!, from: '2027-01-01' } }] }, { now: NOW }).some((x) => x.id.startsWith('vorauszahlung:'))).toBe(false);
  });
});
