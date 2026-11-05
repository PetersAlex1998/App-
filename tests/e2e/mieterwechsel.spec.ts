import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Alt', salutation: 'Frau', email: '', phone: '', moveIn: '2022-01-01', moveOut: '', deposit: 1500, trackFrom: '2026-11' }];
  d.payments = [{ id: 'k1', tenantId: 't1', date: '2022-01-03', month: '2022-01', amount: 1500, kind: 'kaution', note: '' }];
  d.meters = [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'wasser_kalt', number: '77' }];
  d.readings = []; d.costs = []; d.documents = [];
  return d;
}

test('Mieterwechsel: Auszug festhalten, Schritte abhaken, Kaution im Überblick, Nachmieter', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/wohnung/u1');
  await tap(page, btn(page, /^[^A-Za-z]*Mieterwechsel/));
  await expect.poll(() => body(page)).toContain('AUSZUGSTERMIN');

  await tap(page, btn(page, /Auszug festhalten/));
  await expect.poll(async () => (await readDb(page)).tenants[0].moveOut).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((await readDb(page)).tenants[0].coldRent).toBe(500); // Miete der Mietzeit für die Historie
  await expect.poll(() => body(page)).toContain('KAUTION IM ÜBERBLICK');
  expect(await body(page)).toMatch(/Rückzahlbar/);

  // Von Hand abhaken und wieder öffnen
  await tap(page, page.getByRole('button', { name: /Wohnung abnehmen.*als erledigt markieren/ }).filter({ visible: true }).first());
  await expect.poll(async () => Object.keys((await readDb(page)).tenants[0].moveSteps ?? {})).toContain('protokoll');
  await expect.poll(() => body(page)).toContain('Wieder öffnen');

  // Kaution abrechnen öffnet die Vorlage mit dem gezahlten Betrag
  await tap(page, btn(page, /^[^A-Za-z]*Kaution abrechnen/));
  await expect.poll(() => body(page)).toContain('Kautionsabrechnung');
  await expect(page.getByLabel('Gezahlte Kaution').filter({ visible: true }).first()).toHaveValue('1500');
});

test('Mieterwechsel: Nachmieter erkannt, Aufgabe in der Datenprüfung', async ({ page }) => {
  const d = data();
  d.tenants[0].moveOut = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await seedDb(page, d);
  await page.goto('/aufgaben');
  await expect.poll(() => body(page)).toMatch(/Mieterwechsel: \d+ Schritte? offen/);
  await tap(page, btn(page, /Mieterwechsel:/));
  await expect.poll(() => body(page)).toContain('NEUVERMIETUNG');
  expect(await body(page)).toContain('Noch kein Nachmieter eingetragen');
});
