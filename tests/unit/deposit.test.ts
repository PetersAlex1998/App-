import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depositOverview, depositRow, returnDeadline } from '../../src/deposit';
import { depositSettlement, wechsel } from '../../src/moveOut';
import { computeTasks } from '../../src/tasks';
import { dbWith, payment, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

function mk(tOver = {}, paid = 0) {
  const p = property(); const u = unit(p.id, { coldRent: 500 });
  const t = tenant(u.id, { moveIn: '2024-01-01', trackFrom: '2026-11', deposit: 1500, ...tOver });
  const payments = paid ? [payment(t.id, '2024-01', paid, { kind: 'kaution' })] : [];
  return { p, u, t, db: dbWith({ properties: [p], units: [u], tenants: [t], payments }) };
}

describe('Kautionsstatus', () => {
  it('fehlt, teilweise, gehalten', () => {
    expect(depositRow(mk().db, mk().t)?.status).toBe('fehlt');
    const a = mk({}, 500); expect(depositRow(a.db, a.t)?.status).toBe('teilweise');
    const b = mk({}, 1500); expect(depositRow(b.db, b.t)?.status).toBe('gehalten');
  });
  it('ohne Vereinbarung und Zahlung keine Zeile; Ausgezogene ohne Zahlung auch nicht', () => {
    const a = mk({ deposit: 0 }); expect(depositRow(a.db, a.t)).toBeNull();
    const b = mk({ moveOut: '2026-01-31' }); expect(depositRow(b.db, b.t)).toBeNull();
  });
  it('Ausgezogen mit Kaution: Rückzahlung offen, nach Rückzahlung erledigt', () => {
    const a = mk({ moveOut: '2026-08-31' }, 1500);
    expect(depositRow(a.db, a.t)).toMatchObject({ status: 'rueckzahlung', daysSinceMoveOut: 76 });
    expect(returnDeadline(a.t)).toBe('2027-02-27');
    const back = { ...a.t, depositReturned: { date: NOW, amount: 1500 } };
    expect(depositRow(a.db, back)).toMatchObject({ status: 'zurueck', held: 0 });
  });
  it('Zinsen zählen zum gehaltenen Betrag; Kaution über 3 Kaltmieten und fehlende Anlage werden erkannt', () => {
    const a = mk({ deposit: 1800, depositInterest: 20 }, 1800);
    const r = depositRow(a.db, a.t)!;
    expect(r.held).toBe(1820);
    expect(r.tooHigh).toBe(true);
    expect(r.maxAllowed).toBe(1500);
    expect(r.notPlaced).toBe(true);
    const placed = depositRow(a.db, { ...a.t, depositPlaced: '2024-01-05' })!;
    expect(placed.notPlaced).toBe(false);
    const buerg = depositRow(a.db, { ...a.t, depositType: 'Bürgschaft' })!;
    expect(buerg.notPlaced).toBe(false);
  });
  it('Übersicht summiert gehaltene Kautionen ohne zurückgezahlte', () => {
    const a = mk({}, 1500);
    const t2 = tenant(a.u.id, { deposit: 900, moveIn: '2023-01-01', moveOut: '2025-01-01', depositReturned: { date: '2025-03-01', amount: 900 } });
    const o = depositOverview({ ...a.db, tenants: [a.t, t2], payments: [...a.db.payments, payment(t2.id, '2023-01', 900, { kind: 'kaution' })] });
    expect(o.held).toBe(1500);
    expect(o.rows).toHaveLength(2);
  });
});

describe('Abrechnung mit Zinsen und Mieterwechsel', () => {
  it('Zinsen erhöhen den Rückzahlbetrag', () => {
    const a = mk({ moveOut: '2026-10-31', depositInterest: 30, trackFrom: '2026-10' }, 1500);
    const d = { ...a.db, payments: [...a.db.payments, payment(a.t.id, '2026-10', 660)] }; // Okt. voll bezahlt
    expect(depositSettlement(d, a.t, a.u).refund).toBe(1530);
  });
  it('Schritt „Kaution“ ist mit erfasster Rückzahlung erledigt', () => {
    const a = mk({ moveOut: '2026-10-31', depositReturned: { date: NOW, amount: 1500 } }, 1500);
    expect(wechsel(a.db, a.u.id)!.steps.find((s) => s.id === 'kaution')).toMatchObject({ status: 'done' });
  });
});

describe('Aufgaben', () => {
  const ids = (db: any) => computeTasks(db, { now: NOW }).map((t) => t.id);
  it('Rückzahlung ab 60 Tagen; hoch nach sechs Monaten', () => {
    const early = mk({ moveOut: '2026-10-31' }, 1500);
    expect(ids(early.db).some((i) => i.startsWith('kaution-zurueck'))).toBe(false);
    const late = mk({ moveOut: '2026-08-31' }, 1500);
    expect(computeTasks(late.db, { now: NOW }).find((t) => t.id.startsWith('kaution-zurueck'))?.level).toBe('normal');
    const old = mk({ moveOut: '2026-03-01' }, 1500);
    expect(computeTasks(old.db, { now: NOW }).find((t) => t.id.startsWith('kaution-zurueck'))?.level).toBe('hoch');
  });
  it('Anlage und Obergrenze als Hinweise', () => {
    const a = mk({ deposit: 1800 }, 1800);
    expect(ids(a.db)).toEqual(expect.arrayContaining([`kaution-anlage:${a.t.id}`, `kaution-hoch:${a.t.id}`]));
  });
});
