import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

test('Immokalkulator: Höchstpreis, Ampel, Speichern, Wiederöffnen, Löschen mit Rückgängig', async ({ page }) => {
  await seedDb(page);
  await page.goto('/kalkulator');
  await expect.poll(() => body(page)).toContain('Noch keine Kalkulation');
  await tap(page, btn(page, /Neue Kalkulation/));

  await page.getByLabel('Bezeichnung / Adresse').fill('Musterstr. 5, Paderborn');
  await page.getByLabel('Kaufpreis', { exact: true }).fill('300000');
  await page.getByLabel(/Kaltmiete pro Monat/).fill('1100');
  await page.getByLabel('Wohnfläche').fill('80');

  // Standard-Annahmen: Höchstpreis ca. 206.000 € (Rendite 4,5 % begrenzt vermutlich nicht, Cashflow/Faktor je nach Ziel)
  await expect.poll(() => body(page)).toContain('Empfohlener Höchstpreis');
  const t = await body(page);
  expect(t).toMatch(/Zu teuer/);
  expect(t).toMatch(/Netto-Mietrendite/);
  expect(t).toMatch(/Verhandle mindestens/);
  expect(t).toMatch(/Cashflow vor Steuern/);
  expect(t).toMatch(/Stresstest/i);

  // Niedrigerer Preis → „gut“
  await page.getByLabel('Kaufpreis', { exact: true }).fill('150000');
  await expect.poll(() => body(page)).toContain('Preis liegt unter dem Maximum');

  await tap(page, btn(page, /Kalkulation speichern/));
  await expect.poll(async () => (await readDb(page)).calculations?.length).toBe(1);
  const saved = (await readDb(page)).calculations[0];
  expect(saved).toMatchObject({ name: 'Musterstr. 5, Paderborn' });
  expect(saved.input).toMatchObject({ price: 150000, rentMonth: 1100, area: 80, landTax: 6.5 });

  // Liste zeigt Ergebnis, Öffnen lädt die Werte
  await expect.poll(() => body(page)).toContain('Musterstr. 5, Paderborn');
  expect(await body(page)).toMatch(/Max\. .*€/);
  await tap(page, btn(page, /Musterstr\. 5/));
  await expect(page.getByLabel('Kaufpreis', { exact: true })).toHaveValue('150000');

  // Löschen mit Rückgängig
  await tap(page, btn(page, /^Löschen/));
  await expect.poll(async () => (await readDb(page)).calculations.length).toBe(0);
  await tap(page, btn(page, /^Rückgängig/));
  await expect.poll(async () => (await readDb(page)).calculations.length).toBe(1);
});
