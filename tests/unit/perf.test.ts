import { describe, expect, it } from 'vitest';
import { openItems, totalOpen } from '../../src/calc';
import { normalizeIds } from '../../src/ids';
import { bigDb } from '../helpers/builders';
import { serialize, parseBackup } from '../../src/backup';

// Großzügige Grenzen (CI-Rechner sind langsam): sie fangen nur gravierende Rückschritte ab.
describe('Leistung bei 88 Einheiten / ~2.000 Zahlungen', () => {
  const db = bigDb();
  it('Bestand hat die erwartete Größe', () => {
    expect(db.properties).toHaveLength(7);
    expect(db.units).toHaveLength(88);
    expect(db.payments.length).toBeGreaterThan(1500);
  });
  it('Rückstände aller Mieter < 1 s', () => {
    const t0 = performance.now();
    const sum = db.tenants.reduce((s, t) => s + totalOpen(db, t), 0);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(sum).toBeGreaterThan(0);
    expect(db.tenants.some((t) => openItems(db, t).length > 0)).toBe(true);
  });
  it('normalizeIds < 500 ms und ist idempotent', () => {
    const t0 = performance.now();
    const a = normalizeIds(db);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(normalizeIds(a)).toEqual(a);
  });
  it('Sicherung serialisieren + einlesen < 1 s', () => {
    const t0 = performance.now();
    const r = parseBackup(serialize(db));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.db.payments).toHaveLength(db.payments.length);
  });
});
