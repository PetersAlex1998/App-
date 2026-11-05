import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portfolio, todos } from '../../src/portfolio';
import { balanceAt } from '../../src/loans';
import type { Expense, Loan } from '../../src/types';
import { dbWith, payment, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const exp = (o: Partial<Expense>): Expense => ({ id: Math.random().toString(36), propertyId: 'x', date: '2025-06-01', amount: 0, category: 'instandhaltung', vendor: '', description: '', ...o });

function setup() {
  const p = property({ purchasePrice: '400.000', marketValue: '500.000' });
  const rented = unit(p.id, { name: 'W1', area: 50, coldRent: 500, advance: 100 });
  const empty = unit(p.id, { name: 'W2', area: 50, coldRent: 600, advance: 100 });
  const t = tenant(rented.id, { moveIn: '2024-01-01', trackFrom: '2026-12' });
  const loan: Loan = { id: 'l', propertyId: p.id, name: 'Bank', amount: 100000, start: '2025-01-01', rate: 3.6, repayment: 2.4 };
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
  const db = dbWith({
    properties: [p], units: [rented, empty], tenants: [t], loans: [loan],
    payments: [...months.map((m) => payment(t.id, m, 600)), payment(t.id, '2024-01', 1500, { kind: 'kaution' })],
    expenses: [exp({ propertyId: p.id, amount: 1000 }), exp({ propertyId: p.id, amount: 3000, category: 'afa' }), exp({ propertyId: p.id, amount: 800, category: 'betriebskosten' })],
  });
  return { p, db, loan };
}

describe('Portfolio-Kennzahlen', () => {
  it('Cashflow: Einnahmen − Ausgaben (ohne AfA) − Zins − Tilgung; Kaution zählt nicht', () => {
    const { db } = setup();
    const { total } = portfolio(db, 2025);
    expect(total.income).toBe(7200);
    expect(total.expenses).toBe(1800);
    expect(total.interest + total.principal).toBe(6000); // 12 Raten à 500 €
    expect(total.cashflow).toBe(-600);
  });
  it('Vermietung, Leerstand, Renditen', () => {
    const { db } = setup();
    const k = portfolio(db, 2025).total;
    expect(k).toMatchObject({ units: 2, rented: 1, vacant: 1, rentRented: 6000, rentVacant: 7200, occupancy: 50, price: 400000, marketValue: 500000 });
    expect(k.grossYield).toBe(3.3);
    expect(k.netYield).toBe(1.25); // (6000 − 1000 nicht umlagefähig) ÷ 400.000
  });
  it('Restschuld, Beleihung, Vermögen', () => {
    const { db, loan } = setup();
    const k = portfolio(db, 2025).total;
    const debt = balanceAt(loan, NOW);
    expect(k.debt).toBe(debt);
    expect(k.ltv).toBe(Math.round((debt / 500000) * 10000) / 100);
    expect(k.netWorth).toBe(Math.round((500000 - debt) * 100) / 100);
  });
  it('erfasste Schuldzinsen ersetzen die Zinsen aus dem Darlehen (keine Doppelzählung)', () => {
    const { db, p } = setup();
    const own = { ...db, expenses: [...db.expenses, exp({ propertyId: p.id, amount: 3500, category: 'schuldzinsen' })] };
    const k = portfolio(own, 2025).total;
    expect(k.interest).toBe(0);
    expect(k.expenses).toBe(1800 + 3500);
    expect(k.principal).toBeGreaterThan(2000);
  });
  it('ohne Kaufpreis und Marktwert keine Renditen; Häuser nach Cashflow sortiert', () => {
    const { db, p } = setup();
    const p2 = property({ name: 'Haus B' });
    const u2 = unit(p2.id, { area: 40, coldRent: 400 });
    const t2 = tenant(u2.id, { trackFrom: '2026-12' });
    const d = dbWith({ ...db, properties: [{ ...p, purchasePrice: undefined, marketValue: undefined }, p2], units: [...db.units, u2], tenants: [...db.tenants, t2], payments: [...db.payments, payment(t2.id, '2025-05', 5000)] });
    const r = portfolio(d, 2025);
    expect(r.houses[0].name).toBe('Haus B');
    expect(r.houses.find((h) => h.id === p.id)!.grossYield).toBeNull();
    expect(r.total.ltv).toBeNull();
  });
});

describe('Handlungsfelder', () => {
  it('Leerstand und Zinsbindung erscheinen, sonst nichts erfunden', () => {
    const { db } = setup();
    const ids = todos({ ...db, loans: [{ ...db.loans[0], fixedUntil: '2027-03-31' }] }, NOW).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['leerstand', 'zinsbindung']));
    expect(ids).not.toContain('schaeden');
    expect(todos(dbWith({}), NOW)).toEqual([]);
  });
});
