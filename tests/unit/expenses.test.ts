import { describe, expect, it } from 'vitest';
import { anlageV, expensesCsv, expensesOf } from '../../src/expenses';
import { removeItem, upsertItem } from '../../src/dbops';
import { parseBackup, serialize } from '../../src/backup';
import { hydrate } from '../../src/repo';
import { Expense } from '../../src/types';
import { dbWith, payment, property, simple, tenant, unit } from '../helpers/builders';

const exp = (propertyId: string, o: Partial<Expense> = {}): Expense => ({ id: 'e' + Math.random(), propertyId, date: '2025-05-10', amount: 100, category: 'instandhaltung', vendor: 'Meier', description: 'Rohr', ...o });

describe('Ausgaben und Anlage V', () => {
  it('Einnahmen nach Zahlungsdatum im Jahr, Kaution zählt nicht', () => {
    const { p, t, db } = simple();
    const full = { ...db, payments: [
      payment(t.id, '2025-01', 800, { date: '2025-01-03' }),
      payment(t.id, '2024-12', 800, { date: '2025-01-02' }), // Zufluss 2025
      payment(t.id, '2025-12', 800, { date: '2025-12-31' }),
      payment(t.id, '2026-01', 800, { date: '2026-01-02' }), // 2026
      payment(t.id, '2025-02', 1500, { date: '2025-02-01', kind: 'kaution' }),
      payment(t.id, '2025-03', 200, { date: '2025-03-15', kind: 'nachzahlung' }),
    ], expenses: [exp(p.id, { amount: 250.5 }), exp(p.id, { amount: 100, category: 'versicherung' }), exp(p.id, { date: '2024-12-31', amount: 999 })] };
    const a = anlageV(full, 2025);
    expect(a.income).toBe(2600);
    expect(a.expenses).toBe(350.5);
    expect(a.surplus).toBe(2249.5);
    expect(a.byCategory.map((x) => x.category)).toEqual(['instandhaltung', 'versicherung']);
    expect(a.noReceipt).toBe(2);
  });
  it('Filter nach Haus trennt Einnahmen und Ausgaben', () => {
    const p1 = property({ houseNo: 1 }), p2 = property({ houseNo: 2, name: 'B' });
    const u1 = unit(p1.id), u2 = unit(p2.id);
    const t1 = tenant(u1.id), t2 = tenant(u2.id);
    const db = dbWith({ properties: [p1, p2], units: [u1, u2], tenants: [t1, t2], payments: [payment(t1.id, '2025-01', 500, { date: '2025-01-03' }), payment(t2.id, '2025-01', 300, { date: '2025-01-03' })], expenses: [exp(p1.id, { amount: 50 }), exp(p2.id, { amount: 70 })] });
    expect(anlageV(db, 2025, p1.id)).toMatchObject({ income: 500, expenses: 50, surplus: 450 });
    expect(anlageV(db, 2025, p2.id)).toMatchObject({ income: 300, expenses: 70 });
    expect(anlageV(db, 2025)).toMatchObject({ income: 800, expenses: 120 });
  });
  it('Verlust ist negativ; Cent-Summen werden gerundet', () => {
    const { p, db } = simple();
    const a = anlageV({ ...db, expenses: [exp(p.id, { amount: 0.1 }), exp(p.id, { amount: 0.2 })] }, 2025);
    expect(a.expenses).toBe(0.3);
    expect(a.surplus).toBe(-0.3);
  });
  it('expensesOf sortiert absteigend nach Datum', () => {
    const { p, db } = simple();
    const l = expensesOf({ ...db, expenses: [exp(p.id, { date: '2025-01-01' }), exp(p.id, { date: '2025-09-01' })] }, { year: 2025 });
    expect(l.map((e) => e.date)).toEqual(['2025-09-01', '2025-01-01']);
  });
  it('CSV: Semikolon, deutsche Zahlen, Anführungszeichen maskiert', () => {
    const { p, db } = simple();
    const csv = expensesCsv({ ...db, expenses: [exp(p.id, { amount: 1234.5, description: 'Rohr "defekt"', receiptId: 'd1', allocatable: true })] }, 2025);
    const [head, row] = csv.split('\r\n');
    expect(head.startsWith('"Datum";"Haus"')).toBe(true);
    expect(row).toBe('"10.05.2025";"Haus A";"Reparatur und Instandhaltung";"Meier";"Rohr ""defekt""";"1234,50";"ja";"ja"');
  });
});

describe('Ausgaben im Datenbestand', () => {
  it('upsert legt an und aktualisiert', () => {
    const { p, db } = simple();
    const e = exp(p.id);
    const d1 = upsertItem(db, 'expenses', e);
    expect(d1.expenses).toHaveLength(1);
    expect(upsertItem(d1, 'expenses', { ...e, amount: 5 }).expenses).toMatchObject([{ amount: 5 }]);
  });
  it('Ausgabe löschen entfernt den Beleg mit', () => {
    const { p, db } = simple();
    const doc = { id: 'd1', ownerKind: 'property' as const, ownerId: p.id, category: 'rechnung' as const, name: 'B', mime: 'image/jpeg', size: 1, added: '2025-05-10' };
    const full = { ...db, documents: [doc], expenses: [exp(p.id, { id: 'e1', receiptId: 'd1' })] };
    const r = removeItem(full, 'expenses', 'e1');
    expect(r.db.expenses).toEqual([]);
    expect(r.db.documents).toEqual([]);
    expect(r.goneDocs.map((d) => d.id)).toEqual(['d1']);
  });
  it('Beleg löschen lässt die Ausgabe bestehen, ohne Verweis', () => {
    const { p, db } = simple();
    const doc = { id: 'd1', ownerKind: 'property' as const, ownerId: p.id, category: 'rechnung' as const, name: 'B', mime: 'image/jpeg', size: 1, added: '2025-05-10' };
    const full = { ...db, documents: [doc], expenses: [exp(p.id, { id: 'e1', receiptId: 'd1' })] };
    const r = removeItem(full, 'documents', 'd1');
    expect(r.db.expenses).toHaveLength(1);
    expect(r.db.expenses[0].receiptId).toBeUndefined();
  });
  it('Haus löschen entfernt seine Ausgaben samt Belegen, fremde bleiben', () => {
    const p1 = property({ houseNo: 1 }), p2 = property({ houseNo: 2 });
    const d = (id: string, owner: string) => ({ id, ownerKind: 'property' as const, ownerId: owner, category: 'rechnung' as const, name: 'B', mime: 'a/b', size: 1, added: '2025-01-01' });
    const db = dbWith({ properties: [p1, p2], documents: [d('d1', p1.id), d('d2', p2.id)], expenses: [exp(p1.id, { id: 'e1', receiptId: 'd1' }), exp(p2.id, { id: 'e2', receiptId: 'd2' })] });
    const r = removeItem(db, 'properties', p1.id);
    expect(r.db.expenses.map((e) => e.id)).toEqual(['e2']);
    expect(r.db.documents.map((x) => x.id)).toEqual(['d2']);
  });
  it('alte Daten ohne Ausgaben werden ergänzt; Sicherung enthält Ausgaben', () => {
    expect(hydrate({ properties: [] }).expenses).toEqual([]);
    const { p, db } = simple();
    const back = parseBackup(serialize({ ...db, expenses: [exp(p.id, { id: 'e9' })] }));
    expect(back.db.expenses.map((e) => e.id)).toEqual(['e9']);
  });
});
