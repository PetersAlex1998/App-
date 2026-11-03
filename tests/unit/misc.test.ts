import { describe, expect, it, vi } from 'vitest';
import { consumption, yearRange } from '../../src/meters';
import { expiryState, daysUntil } from '../../src/docs';
import { kindText, sourceLabel, sourceOf, stamp } from '../../src/payments';
import { dueStatements, nkOverview, occupants } from '../../src/nk';
import { dbWith, property, simple, tenant, unit } from '../helpers/builders';
import { emptyDB } from '../../src/types';

describe('Zähler: Verbrauch', () => {
  const base = () => {
    const { p, u, db } = simple();
    const m = { id: 'm1', propertyId: p.id, unitId: u.id, type: 'wasser_kalt' as const, number: '1' };
    return { u, m, db: { ...db, meters: [m] } };
  };
  it('Differenz der Jahresendstände', () => {
    const { u, m, db } = base();
    db.readings = [{ id: 'r1', meterId: m.id, date: '2024-12-31', value: 100 }, { id: 'r2', meterId: m.id, date: '2025-12-31', value: 160.5 }];
    const { from, to } = yearRange(2025);
    expect(consumption(db, u.id, 'wasser_kalt', from, to)).toEqual({ value: 60.5, estimatedStart: false });
  });
  it('fehlender Anfangsstand: erste Ablesung im Zeitraum, als geschätzt markiert', () => {
    const { u, m, db } = base();
    db.readings = [{ id: 'r1', meterId: m.id, date: '2025-03-01', value: 110 }, { id: 'r2', meterId: m.id, date: '2025-12-31', value: 150 }];
    const { from, to } = yearRange(2025);
    expect(consumption(db, u.id, 'wasser_kalt', from, to)).toEqual({ value: 40, estimatedStart: true });
  });
  it('keine Ablesungen → null; negative Differenz wird nie negativ', () => {
    const { u, m, db } = base();
    const { from, to } = yearRange(2025);
    expect(consumption(db, u.id, 'wasser_kalt', from, to).value).toBeNull();
    db.readings = [{ id: 'r1', meterId: m.id, date: '2024-12-31', value: 200 }, { id: 'r2', meterId: m.id, date: '2025-12-31', value: 150 }];
    expect(consumption(db, u.id, 'wasser_kalt', from, to).value).toBe(0);
  });
});

describe('Dokumente: Ablauf', () => {
  it('abgelaufen, bald, gültig, leer', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    expect(expiryState('2026-05-22')).toMatchObject({ tone: 'danger', text: 'Abgelaufen seit 10 Tagen' });
    expect(expiryState('2026-07-01')).toMatchObject({ tone: 'warn' });
    expect(expiryState('2028-01-01')).toMatchObject({ tone: 'ok' });
    expect(expiryState('')).toBeNull();
    expect(daysUntil('2026-06-11')).toBe(10);
    vi.useRealTimers();
  });
});

describe('Zahlungen: Herkunft', () => {
  it('ohne Angabe gilt „manuell“', () => {
    expect(sourceOf({})).toBe('manuell');
    expect(sourceLabel({ source: 'import' })).toBe('Kontoauszug');
    expect(sourceLabel({})).toBe('Manuell');
    expect(kindText('kaution')).toBe('Kaution');
    expect(stamp('quatsch')).toBe('');
    expect(stamp()).toBe('');
  });
});

describe('Nebenkosten-Übersicht', () => {
  it('Mieter im Abrechnungsjahr werden gefunden, Auszug vor dem Jahr nicht', () => {
    const p = property({ houseNo: 1 });
    const u = unit(p.id);
    const alt = tenant(u.id, { moveIn: '2020-01-01', moveOut: '2024-06-30' });
    const neu = tenant(u.id, { moveIn: '2024-07-01' });
    const db = dbWith({ properties: [p], units: [u], tenants: [alt, neu] });
    expect(occupants(db, p.id, 2025).map((o) => o.tenant.id)).toEqual([neu.id]);
    expect(occupants(db, p.id, 2024)).toHaveLength(2);
  });
  it('Übersicht ohne Kosten warnt und bricht nicht', () => {
    const { p, db } = simple();
    const o = nkOverview(db, p, 2025);
    expect(o.rows).toHaveLength(1);
    expect(o.totalCosts).toBe(0);
    expect(Array.isArray(dueStatements(emptyDB))).toBe(true);
  });
});
