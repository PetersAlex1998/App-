import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

test('Unternehmensdaten: einmal pflegen, Vorschau, Vollständigkeit, IBAN-Prüfung und Weitergabe an Briefe', async ({ page }) => {
  await seedDb(page);
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('immo-settings-v1') ?? '{}'));
  await page.goto('/unternehmen');
  await expect.poll(() => body(page)).toContain('0 von 7 vollständig');

  await page.getByLabel('Name oder Firma').fill('Mustermann Immobilien');
  await tap(page, page.getByRole('radio', { name: 'GmbH', exact: true }));
  await page.getByLabel('Inhaber oder Geschäftsführung').fill('Max Mustermann');
  await page.getByLabel('Straße und Hausnummer').fill('Hauptstraße 1');
  await page.getByLabel('PLZ', { exact: true }).fill('33098');
  await page.getByLabel('Ort', { exact: true }).fill('Paderborn');
  await page.getByLabel('E-Mail').fill('info@muster.de');
  await page.getByLabel('Steuernummer', { exact: true }).fill('339/5800/1234');
  await page.getByLabel('Handelsregister').fill('Amtsgericht Paderborn, HRB 1234');

  // falsche IBAN wird gemeldet, richtige akzeptiert und formatiert
  await page.getByLabel(/^IBAN/).fill('DE89 3704 0044 0532 0130 01');
  await expect.poll(() => body(page)).toContain('nicht gültig');
  await page.getByLabel(/^IBAN/).fill('DE89370400440532013000');
  await expect.poll(() => body(page)).toContain('Gültig: DE89 3704 0044 0532 0130 00');
  await page.getByLabel('Unterzeichner').fill('Max Mustermann');
  await page.getByLabel('Funktion').fill('Geschäftsführer');

  await expect.poll(() => body(page)).toContain('Alles vollständig');
  const t = await body(page);
  // Vorschau: Firmenname mit Rechtsform, Fußzeile aus Stammdaten, Bankzeile, Unterschrift
  expect(t).toContain('Mustermann Immobilien GmbH');
  expect(t).toContain('Steuernummer 339/5800/1234');
  expect(t).toContain('Geschäftsführung: Max Mustermann');
  expect(t).toContain('IBAN DE89 3704 0044 0532 0130 00');
  expect(t).toContain('Geschäftsführer');

  // Wird gespeichert (und damit mit der Cloud abgeglichen)
  await expect.poll(async () => (await settings()).legalForm).toBe('GmbH');
  expect(await settings()).toMatchObject({ name: 'Mustermann Immobilien', zip: '33098', taxNo: '339/5800/1234', signerRole: 'Geschäftsführer' });

  // Briefe-Einstellungen verweisen auf die Stammdaten
  await page.goto('/briefe');
  await expect.poll(() => body(page)).toContain('Unternehmensdaten');
  expect(await body(page)).toContain('Mustermann Immobilien');

  // Testbrief übernimmt die Stammdaten
  page.on('dialog', (d) => d.accept());
  await tap(page, btn(page, /Testbrief an mich selbst/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
});
