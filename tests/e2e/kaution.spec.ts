import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Alt', salutation: 'Frau', email: '', phone: '', moveIn: '2022-01-01', moveOut: '2026-06-30', deposit: 1500, trackFrom: '2026-07' }];
  d.payments = [{ id: 'k1', tenantId: 't1', date: '2022-01-03', month: '2022-01', amount: 1500, kind: 'kaution', note: '' }];
  d.costs = []; d.documents = []; d.meters = []; d.readings = [];
  return d;
}

test('Kautionen: Übersicht, Zinsen speichern, Rückzahlung erfassen und rückgängig machen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/kautionen');
  await expect.poll(() => body(page)).toContain('RÜCKZAHLUNG OFFEN');
  expect(await body(page)).toMatch(/1\.500,00\s€/);
  await tap(page, btn(page, /Anna Alt/));
  await expect.poll(() => body(page)).toContain('Rückzahlbar');

  await page.getByLabel('Aufgelaufene Zinsen').fill('30');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).tenants[0].depositInterest).toBe(30);
  expect(await body(page)).toMatch(/Rückzahlbar\s1\.530,00\s€/);

  await tap(page, btn(page, /Rückzahlung erfassen/));
  await expect.poll(async () => (await readDb(page)).tenants[0].depositReturned?.amount).toBe(1530);
  await expect.poll(() => body(page)).toContain('zurückgezahlt');

  await tap(page, btn(page, /Rückzahlung rückgängig machen/));
  await expect.poll(async () => (await readDb(page)).tenants[0].depositReturned).toBeUndefined();
});

test('Kautionszahlung erfassen: Art und Restbetrag sind vorbelegt', async ({ page }) => {
  const d = data();
  d.tenants[0].moveOut = '';
  d.payments = [{ id: 'k1', tenantId: 't1', date: '2022-01-03', month: '2022-01', amount: 500, kind: 'kaution', note: '' }];
  await seedDb(page, d);
  await page.goto('/kaution?tenantId=t1');
  await tap(page, btn(page, /Kautionszahlung erfassen/));
  await expect.poll(() => body(page)).toContain('Kaution');
  await expect(page.getByLabel(/^Betrag/).filter({ visible: true }).first()).toHaveValue('1000');
});
