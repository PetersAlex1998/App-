import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test('Wartung: Vorschlag übernehmen, Datum eintragen, als erledigt markieren', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, seed());
  await page.goto('/wartung');
  await expect.poll(() => body(page)).toContain('VORSCHLÄGE');
  await tap(page, btn(page, /Heizungswartung/));
  await expect.poll(async () => (await readDb(page)).checks?.length).toBe(1);
  expect((await readDb(page)).checks[0]).toMatchObject({ title: 'Heizungswartung', intervalMonths: 12, preset: 'heizung' });
  await expect.poll(() => body(page)).toContain('DATUM FEHLT');

  // Detail: als erledigt eintragen → nächster Termin in einem Jahr
  await tap(page, btn(page, /Heizungswartung/));
  await expect.poll(() => body(page)).toContain('Als erledigt eintragen');
  await tap(page, btn(page, /Als erledigt eintragen/));
  await expect.poll(async () => (await readDb(page)).checks[0].last).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const next = `${new Date().getFullYear() + 1}`;
  await expect.poll(() => body(page)).toContain(next);
  await expect.poll(() => body(page)).toContain('BISHER ERLEDIGT');
});

test('Wartung: überfällige Prüfung steht in der Übersicht und in den Aufgaben', async ({ page }) => {
  const d: any = seed();
  d.checks = [{ id: 'c1', propertyId: 'p1', title: 'Schornsteinfeger', intervalMonths: 12, last: '2020-01-10' }];
  await seedDb(page, d);
  await page.goto('/wartung');
  await expect.poll(() => body(page)).toContain('ÜBERFÄLLIG');
  expect(await body(page)).toContain('überfällig');
  await page.goto('/aufgaben');
  await expect.poll(() => body(page)).toContain('Überfällig: Schornsteinfeger');
});

test('Wartung: Intervall wird geprüft', async ({ page }) => {
  await seedDb(page, seed());
  await page.goto('/wartung/formular?propertyId=p1');
  await page.getByLabel('Name').fill('Test');
  await page.getByLabel('Alle wie viele Monate?').fill('0');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('ganzen Monaten');
  expect((await readDb(page)).checks ?? []).toHaveLength(0);
});
