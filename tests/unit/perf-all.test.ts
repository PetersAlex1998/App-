import { describe, expect, it } from 'vitest';
import { fullDb } from '../helpers/builders';
import { computeTasks } from '../../src/tasks';
import { cockpit, deadlines, actions } from '../../src/cockpit';
import { portfolio, todos } from '../../src/portfolio';
import { depositOverview } from '../../src/deposit';
import { planAll } from '../../src/firmBilling';
import { byPerson, ownerStatement } from '../../src/ownerStatement';
import { houseSetup } from '../../src/setup';
import { potential } from '../../src/rentBasis';
import { counts } from '../../src/checks';
import { defaultSettings } from '../../src/settingsDefaults';
import type { DB } from '../../src/types';

const time = (fn: () => unknown) => { const t0 = performance.now(); fn(); return performance.now() - t0; };

describe('Tempo mit dem ausgebauten Bestand (88 Einheiten, ~2.000 Zahlungen)', () => {
  const db = fullDb();
  const cases: [string, () => unknown, number][] = [
    ['Aufgaben', () => computeTasks(db), 800],
    ['Cockpit', () => cockpit(db), 800],
    ['Termine', () => deadlines(db), 300],
    ['Aktionen', () => actions(db, defaultSettings), 800],
    ['Portfolio', () => portfolio(db, 2025), 800],
    ['Handlungsfelder', () => todos(db), 1200],
    ['Kautionen', () => depositOverview(db), 300],
    ['Abrechnung an die Häuser', () => planAll(db, defaultSettings, '2026-11'), 300],
    ['Eigentümerabrechnung (alle Häuser)', () => db.properties.forEach((p) => ownerStatement(db, p.id, 2025)), 800],
    ['Je Person', () => byPerson(db, 2025), 800],
    ['Haus einrichten (alle Häuser)', () => db.properties.forEach((p) => houseSetup(db, p)), 300],
    ['Mieterhöhungs-Potenzial', () => potential(db), 1500],
    ['Prüfungen zählen', () => counts(db), 100],
  ];
  it.each(cases)('%s bleibt schnell', (_n, fn, max) => {
    fn(); // Aufwärmen
    expect(time(fn)).toBeLessThan(max);
  });
  it('liefert plausible Mengen', () => {
    expect(db.units.length).toBeGreaterThanOrEqual(88);
    expect(computeTasks(db).length).toBeGreaterThan(0);
    expect(portfolio(db, 2025).houses).toHaveLength(7);
  });
});
