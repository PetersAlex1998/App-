import { describe, expect, it } from 'vitest';
import { removeItem, upsertItem } from '../../src/dbops';
import { dbWith, payment, property, resetIds, tenant, unit } from '../helpers/builders';
import { beforeEach } from 'vitest';
import { Doc } from '../../src/types';

beforeEach(resetIds);

/** Zwei Häuser; Haus 1 hängt an Einheiten, Mietern, Zahlungen, Zählern, Kosten, Mahnungen und Dokumenten. */
function welt() {
  const p1 = property({ id: 'p1', houseNo: 1 }), p2 = property({ id: 'p2', houseNo: 2 });
  const u1 = unit('p1', { id: 'u1', no: 1 }), u2 = unit('p1', { id: 'u2', no: 2 }), u3 = unit('p2', { id: 'u3', no: 1 });
  const t1 = tenant('u1', { id: 't1' }), t2 = tenant('u2', { id: 't2' }), t3 = tenant('u3', { id: 't3' });
  const doc = (id: string, ownerKind: Doc['ownerKind'], ownerId: string): Doc => ({ id, ownerKind, ownerId, category: 'sonstiges', name: id, mime: 'application/pdf', size: 1, added: '2026-01-01' });
  return dbWith({
    properties: [p1, p2], units: [u1, u2, u3], tenants: [t1, t2, t3],
    payments: [payment('t1', '2026-01', 800), payment('t2', '2026-01', 800), payment('t3', '2026-01', 800)],
    reminders: [{ id: 'r1', tenantId: 't1', date: '2026-02-01', level: 1, amount: 1, fee: 0, deadline: '2026-02-08' }, { id: 'r3', tenantId: 't3', date: '2026-02-01', level: 1, amount: 1, fee: 0, deadline: '2026-02-08' }],
    meters: [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'wasser_kalt', number: '1' }, { id: 'm3', propertyId: 'p2', unitId: 'u3', type: 'wasser_kalt', number: '3' }],
    readings: [{ id: 'a', meterId: 'm1', date: '2026-01-01', value: 1 }, { id: 'b', meterId: 'm3', date: '2026-01-01', value: 1 }],
    costs: [{ id: 'c1', propertyId: 'p1', year: 2025, category: 'x', amount: 1, key: 'area' }, { id: 'c2', propertyId: 'p2', year: 2025, category: 'x', amount: 1, key: 'area' }],
    documents: [doc('dp1', 'property', 'p1'), doc('du1', 'unit', 'u1'), doc('dt1', 'tenant', 't1'), doc('dt2', 'tenant', 't2'), doc('dp2', 'property', 'p2'), doc('dt3', 'tenant', 't3')],
  });
}
const ids = (l: { id: string }[]) => l.map((x) => x.id).sort();

describe('Löschen mit allem, was daran hängt', () => {
  it('Haus entfernt Einheiten, Mieter, Zahlungen, Mahnungen, Zähler, Ablesungen, Kosten und Dokumente, aber nichts vom anderen Haus', () => {
    const { db, goneDocs } = removeItem(welt(), 'properties', 'p1');
    expect(ids(db.properties)).toEqual(['p2']);
    expect(ids(db.units)).toEqual(['u3']);
    expect(ids(db.tenants)).toEqual(['t3']);
    expect(db.payments.map((p) => p.tenantId)).toEqual(['t3']);
    expect(ids(db.reminders)).toEqual(['r3']);
    expect(ids(db.meters)).toEqual(['m3']);
    expect(ids(db.readings)).toEqual(['b']);
    expect(ids(db.costs)).toEqual(['c2']);
    expect(ids(db.documents)).toEqual(['dp2', 'dt3']);
    expect(ids(goneDocs)).toEqual(['dp1', 'dt1', 'dt2', 'du1']);
  });
  it('Einheit entfernt Mieter, Zahlungen, Mahnungen, Zähler, Ablesungen und Dokumente der Einheit', () => {
    const { db } = removeItem(welt(), 'units', 'u1');
    expect(ids(db.units)).toEqual(['u2', 'u3']);
    expect(ids(db.tenants)).toEqual(['t2', 't3']);
    expect(db.payments.map((p) => p.tenantId).sort()).toEqual(['t2', 't3']);
    expect(ids(db.reminders)).toEqual(['r3']);
    expect(ids(db.meters)).toEqual(['m3']);
    expect(ids(db.documents)).toEqual(['dp1', 'dp2', 'dt2', 'dt3']);
  });
  it('Mieter entfernt seine Zahlungen, Mahnungen und Dokumente, nicht die Einheit', () => {
    const { db } = removeItem(welt(), 'tenants', 't1');
    expect(ids(db.units)).toEqual(['u1', 'u2', 'u3']);
    expect(ids(db.tenants)).toEqual(['t2', 't3']);
    expect(db.payments.map((p) => p.tenantId).sort()).toEqual(['t2', 't3']);
    expect(ids(db.documents)).not.toContain('dt1');
    expect(ids(db.documents)).toContain('du1');
  });
  it('Zähler entfernt seine Ablesungen', () => {
    const { db } = removeItem(welt(), 'meters', 'm1');
    expect(ids(db.meters)).toEqual(['m3']);
    expect(ids(db.readings)).toEqual(['b']);
  });
  it('Dokument entfernt nur das Dokument', () => {
    const { db, goneDocs } = removeItem(welt(), 'documents', 'dp1');
    expect(ids(goneDocs)).toEqual(['dp1']);
    expect(db.documents).toHaveLength(5);
    expect(db.properties).toHaveLength(2);
  });
  it('Zahlung entfernt nur die Zahlung', () => {
    const w = welt();
    const { db } = removeItem(w, 'payments', w.payments[0].id);
    expect(db.payments).toHaveLength(2);
  });
  it('verändert das Original nicht', () => {
    const w = welt(); removeItem(w, 'properties', 'p1');
    expect(w.properties).toHaveLength(2);
    expect(w.payments).toHaveLength(3);
  });
});

describe('Anlegen und Ändern', () => {
  it('neuer Datensatz bekommt Änderungszeit und IDs', () => {
    const d = upsertItem(dbWith({}), 'properties', property({ id: 'x' }), '2026-11-03T10:00:00.000Z');
    expect(d.properties[0]).toMatchObject({ id: 'x', updatedAt: '2026-11-03T10:00:00.000Z', houseNo: 1 });
  });
  it('vorhandener Datensatz wird ersetzt, nicht verdoppelt', () => {
    const d1 = upsertItem(dbWith({}), 'properties', property({ id: 'x', name: 'Alt' }));
    const d2 = upsertItem(d1, 'properties', { ...d1.properties[0], name: 'Neu' });
    expect(d2.properties).toHaveLength(1);
    expect(d2.properties[0].name).toBe('Neu');
  });
  it('neue Einheit bekommt eine freie Nummer', () => {
    let d = upsertItem(dbWith({}), 'properties', property({ id: 'h' }));
    d = upsertItem(d, 'units', unit('h', { id: 'a', name: 'Wohnung 1' }));
    d = upsertItem(d, 'units', unit('h', { id: 'b', name: 'Wohnung 1' }));
    expect(d.units.map((u) => u.no).sort()).toEqual([1, 2]);
  });
});
