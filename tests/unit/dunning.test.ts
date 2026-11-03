import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dunningPlans, feeFor, makeReminder, overdueItems, relevantReminders } from '../../src/dunning';
import { defaultSettings as s } from '../../src/settingsDefaults';
import { dbWith, payment, property, resetIds, tenant, unit } from '../helpers/builders';
import { Reminder } from '../../src/types';

const at = (iso: string) => vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
beforeEach(() => { vi.useFakeTimers(); resetIds(); });
afterEach(() => vi.useRealTimers());

const rem = (tenantId: string, date: string, level: 1 | 2 | 3, deadline: string): Reminder => ({ id: tenantId + date, tenantId, date, level, amount: 800, fee: 0, deadline });

/** Fünf Mieter: A ohne Mahnung, B mit laufender Frist, C hat alle drei Stufen, D mit Altfall aus 2025, E zieht erst im November ein. */
function szenario() {
  const p = property({ houseNo: 1 });
  const units = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => unit(p.id, { name: 'WE ' + n, no: i + 1 }));
  const T = (i: number, o = {}) => tenant(units[i].id, { name: 'Mieter ' + 'ABCDEFG'[i], moveIn: '2026-08-01', ...o });
  const tenants = [T(0), T(1), T(2), T(3, { moveIn: '2024-01-01', trackFrom: '2026-10' }), T(4, { moveIn: '2026-11-01' }), T(5, { moveOut: '2026-09-30' }), T(6, { moveIn: '2020-01-01', trackFrom: '2026-11' })];
  const [a, b, c, d] = tenants;
  const reminders = [
    rem(b.id, '2026-11-02', 1, '2026-11-09'),
    rem(c.id, '2026-09-05', 1, '2026-09-12'), rem(c.id, '2026-10-05', 2, '2026-10-12'), rem(c.id, '2026-10-20', 3, '2026-10-27'),
    rem(d.id, '2025-03-01', 3, '2025-03-08'),
  ];
  return { db: dbWith({ properties: [p], units, tenants, reminders }), tenants, a, b, c, d };
}
const name = (plans: ReturnType<typeof dunningPlans>) => plans.map((p) => p.tenant.name.replace('Mieter ', ''));

describe('Karenz (Fälligkeit + Karenztage)', () => {
  it('Miete des laufenden Monats ist erst nach dem 8. überfällig', () => {
    const { db } = szenario();
    at('2026-11-06');
    expect(name(dunningPlans(db, s, '2026-11-06'))).not.toContain('E');
    expect(name(dunningPlans(db, s, '2026-11-06'))).not.toContain('G');
    at('2026-11-12');
    expect(name(dunningPlans(db, s, '2026-11-12'))).toEqual(expect.arrayContaining(['E', 'G']));
  });
  it('Genau am letzten Karenztag noch nicht, einen Tag später ja', () => {
    const { db, tenants } = szenario();
    const e = tenants[4];
    at('2026-11-08'); expect(overdueItems(db, e, s, '2026-11-08')).toEqual([]);
    at('2026-11-09'); expect(overdueItems(db, e, s, '2026-11-09')).toHaveLength(1);
  });
  it('Vormonate sind sofort überfällig', () => {
    const { db, tenants } = szenario();
    at('2026-11-02');
    expect(overdueItems(db, tenants[0], s, '2026-11-02').map((i) => i.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});

describe('Stufen und Fristen', () => {
  it('ohne Mahnung: Stufe 1 (Zahlungserinnerung), gebührenfrei', () => {
    const { db } = szenario(); at('2026-11-12');
    const a = dunningPlans(db, s, '2026-11-12').find((p) => p.tenant.name.endsWith('A'))!;
    expect(a).toMatchObject({ level: 1, fee: 0, status: 'faellig' });
  });
  it('laufende Frist: Mieter wartet, danach nächste Stufe mit Gebühr', () => {
    const { db } = szenario();
    at('2026-11-06');
    const b1 = dunningPlans(db, s, '2026-11-06').find((p) => p.tenant.name.endsWith('B'))!;
    expect(b1).toMatchObject({ status: 'wartet', level: 2, fee: 5 });
    at('2026-11-12');
    const b2 = dunningPlans(db, s, '2026-11-12').find((p) => p.tenant.name.endsWith('B'))!;
    expect(b2).toMatchObject({ status: 'faellig', level: 2, fee: 5 });
  });
  it('drei Mahnungen: letzte Stufe erreicht, Gebühr der 2. Mahnung', () => {
    const { db } = szenario(); at('2026-11-12');
    expect(dunningPlans(db, s, '2026-11-12').find((p) => p.tenant.name.endsWith('C'))).toMatchObject({ status: 'max', level: 3, fee: 10 });
  });
  it('Altfall aus früheren Monaten zählt nicht: Stufe 1', () => {
    const { db } = szenario(); at('2026-11-12');
    expect(dunningPlans(db, s, '2026-11-12').find((p) => p.tenant.name.endsWith('D'))).toMatchObject({ level: 1, status: 'faellig' });
  });
  it('Ausgezogene und voll Bezahlte erscheinen nicht', () => {
    const { db, tenants } = szenario(); at('2026-11-12');
    expect(name(dunningPlans(db, s, '2026-11-12'))).not.toContain('F');
    const bezahlt = { ...db, payments: ['2026-08', '2026-09', '2026-10', '2026-11'].map((m) => payment(tenants[0].id, m, 800)) };
    expect(name(dunningPlans(bezahlt, s, '2026-11-12'))).not.toContain('A');
  });
  it('Reihenfolge: älteste Rückstände zuerst', () => {
    const { db } = szenario(); at('2026-11-12');
    const months = dunningPlans(db, s, '2026-11-12').map((p) => p.items[0].month);
    expect([...months].sort()).toEqual(months);
  });
  it('einstellbare Karenz und Gebühren', () => {
    const { db } = szenario(); at('2026-11-12');
    const strikt = { ...s, graceDays: 0, rentDueDay: 3, fee2: 12 };
    expect(name(dunningPlans(db, strikt, '2026-11-05'))).toContain('E');
    expect(feeFor(2, strikt)).toBe(12);
    expect(feeFor(1, s)).toBe(0);
  });
});

describe('Mahnung erstellen', () => {
  it('übernimmt Stufe, Gebühr, Frist und Stand der offenen Posten', () => {
    const { db } = szenario(); at('2026-11-12');
    const plan = dunningPlans(db, s, '2026-11-12').find((p) => p.tenant.name.endsWith('B'))!;
    const r = makeReminder('x', plan, s, '2026-11-12');
    expect(r).toMatchObject({ tenantId: plan.tenant.id, date: '2026-11-12', level: 2, fee: 5, deadline: '2026-11-19', amount: plan.open });
    expect(r.items).toHaveLength(plan.items.length);
  });
  it('relevantReminders: nur Mahnungen ab dem ältesten offenen Monat', () => {
    const { db, d } = szenario(); at('2026-11-12');
    expect(relevantReminders(db, d, overdueItems(db, d, s, '2026-11-12'))).toEqual([]);
  });
});
