import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

// 1x1-PNG als „Foto“ des Belegs
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Ausgabe mit Beleg erfassen, Anlage V, CSV, Löschen', async ({ page }, info) => {
  page.on('dialog', (d) => d.accept());
  const year = new Date().getFullYear();
  await seedDb(page);
  await page.goto('/ausgaben');
  await expect(page.getByText('Ausgaben und Belege').first()).toBeVisible();
  await tap(page, btn(page, /Ausgabe erfassen/));

  await page.getByLabel('Betrag (brutto)').fill('1.234,50');
  await page.getByLabel('Lieferant / Handwerker').fill('Sanitär Meier');
  await page.getByLabel('Beschreibung').fill('Rohrbruch Keller');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, btn(page, /Foto oder PDF auswählen/))]);
  await fc.setFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => body(page)).toContain('beleg.png');
  await tap(page, btn(page, /^Speichern/));

  await expect.poll(async () => (await readDb(page)).expenses?.length).toBe(1);
  const db = await readDb(page);
  const e = db.expenses[0];
  expect(e).toMatchObject({ amount: 1234.5, vendor: 'Sanitär Meier', category: 'instandhaltung' });
  const doc = db.documents.find((d: any) => d.id === e.receiptId);
  expect(doc).toMatchObject({ category: 'rechnung', ownerKind: 'property', ownerId: 'p1' });

  await expect.poll(() => body(page)).toContain('Sanitär Meier');
  expect(await body(page)).not.toContain('Beleg fehlt');

  // Anlage V
  await tap(page, btn(page, /Auswertung für die Steuer/));
  await expect.poll(() => body(page)).toContain(`Anlage V ${year}`);
  const t = await body(page);
  expect(t).toContain('Reparatur und Instandhaltung');
  expect(t).toContain('1.234,50');
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page, btn(page, /Ausgaben als CSV exportieren/))]);
  const file = info.outputPath('ausgaben.csv');
  await dl.saveAs(file);
  const csv = (await import('node:fs')).readFileSync(file, 'utf8');
  expect(csv).toContain('"Sanitär Meier"');
  expect(csv).toContain('"1234,50"');

  // Löschen entfernt Beleg mit
  await page.goto('/ausgaben');
  await tap(page, btn(page, /Sanitär Meier/));
  await tap(page, btn(page, /^Löschen/));
  await expect.poll(async () => (await readDb(page)).expenses.length).toBe(0);
  expect((await readDb(page)).documents.some((d: any) => d.id === e.receiptId)).toBe(false);
});

test('Ausgabe ohne Beleg wird markiert', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page);
  await page.goto('/ausgabe/formular?propertyId=p1');
  await page.getByLabel('Betrag (brutto)').fill('80');
  await page.getByLabel('Beschreibung').fill('Glühbirnen');
  await tap(page, btn(page, /^Speichern/));
  await page.goto('/ausgaben');
  await expect.poll(() => body(page)).toContain('Beleg fehlt');
});
