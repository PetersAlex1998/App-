import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonths, balanceAt, balanceAtFixedEnd, interestInYear, isPaidOff, loanInterest, monthlyPayment, monthsToFixedEnd, payoffMonth, principalInYear, propertyDebt, schedule } from '../../src/loans';
import { anlageV } from '../../src/expenses';
import { computeTasks } from '../../src/tasks';
import type { Loan } from '../../src/types';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const loan = (o: Partial<Loan> = {}): Loan => ({ id: 'l1', propertyId: 'p', name: 'Bank', amount: 100000, start: '2025-01-01', rate: 3.6, repayment: 2.4, ...o });

describe('Tilgungsplan', () => {
  it('Rate aus Zins und Tilgung; erste Monate von Hand gerechnet', () => {
    const l = loan();
    expect(monthlyPayment(l)).toBe(500);
    const [a, b] = schedule(l);
    expect(a).toMatchObject({ month: '2025-01', interest: 300, principal: 200, balance: 99800 });
    expect(b).toMatchObject({ month: '2025-02', interest: 299.4, principal: 200.6, balance: 99599.4 });
  });
  it('feste Rate hat Vorrang', () => {
    expect(monthlyPayment(loan({ payment: 650 }))).toBe(650);
  });
  it('Restschuld je Datum: vor dem Start der Betrag, danach nach der Rate des Monats', () => {
    const l = loan();
    expect(balanceAt(l, '2024-12-31')).toBe(100000);
    expect(balanceAt(l, '2025-01-15')).toBe(99800);
    expect(balanceAt(l, '2025-02-01')).toBe(99599.4);
  });
  it('Sondertilgung senkt die Restschuld im Monat', () => {
    const l = loan({ specials: [{ date: '2025-02-10', amount: 5000 }] });
    expect(balanceAt(l, '2025-02-28')).toBe(94599.4);
    expect(interestInYear(l, 2025)).toBeLessThan(interestInYear(loan(), 2025));
  });
  it('Stichtag laut Bank: Plan beginnt danach, Zinsen davor fehlen', () => {
    const l = loan({ anchor: { date: '2025-12-31', balance: 90000 } });
    const [a] = schedule(l);
    expect(a).toMatchObject({ month: '2026-01', interest: 270, principal: 230, balance: 89770 });
    expect(balanceAt(l, '2025-12-31')).toBe(90000);
    expect(balanceAt(l, '2026-01-31')).toBe(89770);
    expect(interestInYear(l, 2025)).toBe(0);
  });
  it('Jahressummen stimmen mit der Rate überein', () => {
    const l = loan();
    const y = interestInYear(l, 2025) + principalInYear(l, 2025);
    expect(Math.round(y * 100) / 100).toBe(6000);
  });
  it('Tilgungsende; zu kleine Rate wird nie getilgt', () => {
    expect(payoffMonth(loan({ amount: 1000, rate: 0, repayment: 0, payment: 400 }))).toBe('2025-03');
    expect(payoffMonth(loan({ rate: 6, repayment: 0, payment: 400 }))).toBeNull();
  });
  it('getilgt erst nach der letzten Rate', () => {
    const l = loan({ amount: 1000, rate: 0, payment: 400 });
    expect(isPaidOff(l, '2025-02-15')).toBe(false);
    expect(isPaidOff(l, '2025-03-31')).toBe(true);
  });
  it('Monatsrechnung über den Jahreswechsel', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2025-01', -1)).toBe('2024-12');
  });
});

describe('Zinsbindung', () => {
  it('Monate bis zum Ende und Restschuld dann', () => {
    const l = loan({ fixedUntil: '2027-03-31' });
    expect(monthsToFixedEnd(l, NOW)).toBe(4);
    expect(monthsToFixedEnd(loan({ fixedUntil: '2026-09-30' }), NOW)).toBe(-2);
    expect(monthsToFixedEnd(loan(), NOW)).toBeNull();
    expect(balanceAtFixedEnd(l)).toBe(balanceAt(l, '2027-03-31'));
  });
});

describe('Haus, Anlage V, Aufgaben', () => {
  function setup(extra: Partial<Loan> = {}) {
    const p = property(); const u = unit(p.id, { coldRent: 640 }); const t = tenant(u.id, { moveIn: '2024-01-01' });
    return { p, db: dbWith({ properties: [p], units: [u], tenants: [t], loans: [loan({ propertyId: p.id, ...extra })] }) };
  }
  it('Kapitaldienst und Deckung durch die Kaltmiete', () => {
    const { p, db } = setup();
    const d = propertyDebt(db, p.id);
    expect(d.service).toBe(6000);
    expect(d.rentYear).toBe(7680);
    expect(d.coverage).toBe(1.28);
    expect(d.debt).toBe(balanceAt(db.loans[0]));
  });
  it('Schuldzinsen fließen in Anlage V; erfasste Schuldzinsen ersetzen die Berechnung', () => {
    const { p, db } = setup();
    const zins = loanInterest(db, 2025, p.id);
    expect(zins).toBeGreaterThan(3000);
    const a = anlageV(db, 2025);
    expect(a.fromLoans).toBe(zins);
    expect(a.byCategory.find((x) => x.category === 'schuldzinsen')?.amount).toBe(zins);
    const own = { ...db, expenses: [{ id: 'e', propertyId: p.id, date: '2025-12-31', amount: 3100, category: 'schuldzinsen' as const, vendor: 'Bank', description: '' }] };
    const b = anlageV(own, 2025);
    expect(b.fromLoans).toBe(0);
    expect(b.byCategory.find((x) => x.category === 'schuldzinsen')?.amount).toBe(3100);
  });
  it('Aufgabe: Zinsbindung endet in 4 Monaten → hoch; weit weg → keine', () => {
    const { db } = setup({ fixedUntil: '2027-03-31' });
    expect(computeTasks(db, { now: NOW }).find((t) => t.id.startsWith('zinsbindung:'))?.level).toBe('hoch');
    const far = setup({ fixedUntil: '2031-03-31' });
    expect(computeTasks(far.db, { now: NOW }).some((t) => t.id.startsWith('zinsbindung:'))).toBe(false);
  });
});
