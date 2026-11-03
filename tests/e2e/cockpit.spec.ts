import { expect, test } from '@playwright/test';
import { body, seedDb } from './helpers';

const ym = (offset: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); };

function data() {
  const mk = (i: number, unit: string, name: string, extra: object = {}) => ({ id: 't' + i, unitId: unit, name, email: '', phone: '', moveIn: '2025-01-01', moveOut: '', deposit: 0, trackFrom: ym(-4), ...extra });
  const pay = (id: string, tenant: string, month: string, amount = 800) => ({ id, tenantId: tenant, date: month + '-03', month, amount, kind: 'miete', note: '' });
  return {
    properties: [{ id: 'p1', name: 'Haus A', street: 'A 1', zip: '1', city: 'K', yearBuilt: '', notes: '', houseNo: 1 }, { id: 'p2', name: 'Haus B', street: 'B 2', zip: '1', city: 'K', yearBuilt: '', notes: '', houseNo: 2 }],
    units: [1, 2, 3].map((i) => ({ id: 'u' + i, propertyId: i < 3 ? 'p1' : 'p2', name: 'Wohnung ' + i, no: i, area: 60, rooms: 2, coldRent: 640, advance: 160 })),
    tenants: [mk(1, 'u1', 'Anna Schmidt'), mk(2, 'u2', 'Max Becker')],
    payments: [pay('a', 't1', ym(-1)), pay('b', 't1', ym(0)), pay('c', 't2', ym(-2)), pay('d', 't2', ym(-1))],
    reminders: [], costs: [], expenses: [{ id: 'e1', propertyId: 'p1', date: ym(0) + '-02', amount: 150, category: 'instandhaltung', vendor: 'Meier', description: '' }], meters: [], readings: [], documents: [],
  };
}

test('Cockpit: Mieteingang, Kennzahlen, Objekte im Vergleich, Rückstände und Leerstand', async ({ page }) => {
  await seedDb(page, data());
  await expect.poll(() => body(page)).toContain('Mieteingang');
  const t = await body(page);
  // Hero: laufender Monat, Anna hat gezahlt (800 von 1.600 Soll)
  expect(t).toContain('800,00');
  expect(t).toContain('50 % eingegangen');
  // Kennzahlen
  expect(t).toContain('Offene Posten');
  expect(t).toContain('Auslastung');
  expect(t).toContain('67 %'); // 2 von 3 Einheiten vermietet
  expect(t).toContain('Leerstand / Monat');
  // Bereiche
  const tl = t.toLowerCase();
  expect(tl).toContain('jetzt wichtig');
  expect(tl).toContain('mieteingang der letzten monate');
  expect(tl).toContain('objekte im vergleich');
  expect(t).toContain('Haus B');
  expect(tl).toContain('rückstände (');
  expect(t).toContain('Max Becker');
  expect(tl).toContain('leerstand (1)');
  expect(tl).toContain('ergebnis');
  await page.screenshot({ path: 'test-results/cockpit.png', fullPage: true });
  // Diagramm ist für Screenreader beschrieben
  await expect(page.getByRole('img', { name: /Mieteingang der letzten Monate/ })).toBeVisible();
});
