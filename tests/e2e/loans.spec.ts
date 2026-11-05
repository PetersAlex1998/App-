import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test('Darlehen anlegen, Restschuld sehen, Zinsen in der Steuerauswertung', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' }];
  await seedDb(page, d);

  await page.goto('/darlehen');
  await expect.poll(() => body(page)).toContain('Noch keine Darlehen');
  await page.goto('/darlehen/formular?propertyId=p1');
  await page.getByLabel('Bank oder Bezeichnung').fill('Sparkasse');
  await page.getByLabel('Darlehensbetrag').fill('100000');
  await page.getByLabel('Sollzins').fill('3,6');
  await page.getByLabel('Anfängliche Tilgung').fill('2,4');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).loans?.length).toBe(1);
  const l = (await readDb(page)).loans[0];
  expect(l).toMatchObject({ name: 'Sparkasse', amount: 100000, rate: 3.6, repayment: 2.4 });

  await page.goto('/darlehen');
  await expect.poll(() => body(page)).toContain('Sparkasse');
  expect(await body(page)).toContain('Restschuld heute');
  expect(await body(page)).toMatch(/Rate 500,00\s€/);
  await tap(page, btn(page, /Sparkasse/));
  await expect.poll(() => body(page)).toContain('Voraussichtlich getilgt');

  await page.goto(`/anlage-v?year=${new Date().getFullYear()}`);
  await expect.poll(() => body(page)).toContain('Schuldzinsen');
  expect(await body(page)).toContain('aus deinen Darlehen berechnet');
});

test('Darlehen: Eingaben werden geprüft', async ({ page }) => {
  await seedDb(page);
  await page.goto('/darlehen/formular?propertyId=p1');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('Darlehensbetrag eingeben');
  expect((await readDb(page)).loans ?? []).toHaveLength(0);
});
