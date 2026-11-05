import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESETS, checkState, counts, markDone, missingPresets, nextDue, sortChecks } from '../../src/checks';
import { computeTasks } from '../../src/tasks';
import { deadlines } from '../../src/cockpit';
import { removeItem } from '../../src/dbops';
import type { Check } from '../../src/types';
import { dbWith, property } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const chk = (o: Partial<Check> = {}): Check => ({ id: 'c1', propertyId: 'p', title: 'Heizungswartung', intervalMonths: 12, ...o });

describe('Termine', () => {
  it('letzte Erledigung plus Intervall; Monatsende wird abgefangen', () => {
    expect(nextDue(chk({ last: '2025-11-20' }))).toBe('2026-11-20');
    expect(nextDue(chk({ last: '2026-01-31', intervalMonths: 1 }))).toBe('2026-02-28');
    expect(nextDue(chk({ last: '2024-02-29', intervalMonths: 12 }))).toBe('2025-02-28');
    expect(nextDue(chk({ last: '2023-11-15', intervalMonths: 36 }))).toBe('2026-11-15');
  });
  it('fester Termin hat Vorrang; ohne Angaben unbekannt', () => {
    expect(nextDue(chk({ last: '2025-01-01', due: '2027-05-01' }))).toBe('2027-05-01');
    expect(nextDue(chk())).toBeNull();
    expect(checkState(chk(), NOW).status).toBe('unbekannt');
  });
  it('Status: überfällig, bald, in Ordnung', () => {
    expect(checkState(chk({ last: '2025-10-01' }), NOW)).toMatchObject({ status: 'ueberfaellig', days: -45 });
    expect(checkState(chk({ last: '2025-12-15' }), NOW)).toMatchObject({ status: 'bald', days: 30 });
    expect(checkState(chk({ last: '2026-06-01' }), NOW).status).toBe('ok');
    expect(checkState(chk({ due: NOW }), NOW)).toMatchObject({ status: 'bald', days: 0 });
  });
});

describe('Erledigen und Sortieren', () => {
  it('erledigt setzt das Datum, löscht festen Termin und merkt den Verlauf ohne Doppelte', () => {
    const c = markDone(chk({ last: '2025-11-01', due: '2026-10-01', history: ['2024-11-01'] }), '2026-11-15');
    expect(c).toMatchObject({ last: '2026-11-15', due: undefined });
    expect(c.history).toEqual(['2024-11-01', '2025-11-01']);
    expect(nextDue(c)).toBe('2027-11-15');
    expect(markDone(c, '2026-11-15').history).toEqual(['2024-11-01', '2025-11-01']);
  });
  it('überfällig zuerst, dann bald, dann ohne Datum, dann in Ordnung', () => {
    const list = [chk({ id: 'ok', last: '2026-10-01' }), chk({ id: 'u' }), chk({ id: 'bald', last: '2025-12-20' }), chk({ id: 'ue', last: '2025-01-01' })];
    expect(sortChecks(list, NOW).map((x) => x.id)).toEqual(['ue', 'bald', 'u', 'ok']);
  });
  it('Zählung je Haus', () => {
    const db = dbWith({ checks: [chk({ last: '2025-01-01' }), chk({ id: 'b', last: '2025-12-20' }), chk({ id: 'c' }), chk({ id: 'd', propertyId: 'x', last: '2025-01-01' })] });
    expect(counts(db, NOW, 'p')).toEqual({ total: 3, overdue: 1, soon: 1, unknown: 1 });
    expect(counts(db, NOW).overdue).toBe(2);
  });
  it('Vorschläge: nur, was im Haus noch fehlt', () => {
    const db = dbWith({ checks: [chk({ preset: 'heizung' })] });
    expect(missingPresets(db, 'p').some((p) => p.key === 'heizung')).toBe(false);
    expect(missingPresets(db, 'p')).toHaveLength(PRESETS.length - 1);
    expect(missingPresets(db, 'anderes')).toHaveLength(PRESETS.length);
  });
});

describe('Aufgaben, Termine, Löschen', () => {
  const p = property({ id: 'p', name: 'Haus A' });
  const tasks = (c: Check) => computeTasks(dbWith({ properties: [p], checks: [c] }), { now: NOW }).filter((t) => t.id.startsWith('wartung'));
  it('überfällig → normal, nach 30 Tagen hoch; bald (≤30 Tage) → Hinweis; weit weg → nichts; ohne Datum → Hinweis', () => {
    expect(tasks(chk({ last: '2025-11-01' }))[0]).toMatchObject({ level: 'normal' });
    expect(tasks(chk({ last: '2025-10-01' }))[0]).toMatchObject({ level: 'hoch' });
    expect(tasks(chk({ last: '2025-12-01' }))[0]).toMatchObject({ level: 'hinweis' });
    expect(tasks(chk({ last: '2026-06-01' }))).toEqual([]);
    expect(tasks(chk())[0].id).toBe('wartung-datum:c1');
  });
  it('Fristen im Cockpit: innerhalb von 60 Tagen oder überfällig', () => {
    const d = (c: Check) => deadlines(dbWith({ properties: [p], checks: [c] }), NOW).filter((x) => x.key.startsWith('chk'));
    expect(d(chk({ last: '2025-12-20' }))).toHaveLength(1);
    expect(d(chk({ last: '2025-01-01' }))[0].tone).toBe('danger');
    expect(d(chk({ last: '2026-06-01' }))).toHaveLength(0);
  });
  it('Haus löschen entfernt die Prüfungen', () => {
    const db = dbWith({ properties: [p], checks: [chk(), chk({ id: 'x', propertyId: 'anderes' })] });
    expect(removeItem(db, 'properties', 'p').db.checks.map((c) => c.id)).toEqual(['x']);
  });
});
