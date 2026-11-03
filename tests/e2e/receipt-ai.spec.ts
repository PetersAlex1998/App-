import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Beleg fotografieren: Betrag, Datum, Lieferant und Kategorie werden automatisch ausgefüllt', async ({ page }) => {
  const calls: any[] = [];
  await page.route('**/functions/v1/beleg-lesen', (r) => {
    calls.push(r.request().postDataJSON());
    return r.fulfill({ json: { data: { vendor: 'Sanitär Meier', date: '2026-10-12', amount: 1234.5, category: 'instandhaltung', description: 'Rohrbruch Keller', readable: true } } });
  });
  await page.route('**/rest/v1/immo_records**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, body: '' }) : r.fulfill({ json: [] })));
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('immo-cloud-session', JSON.stringify({ access_token: 'jwt', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-1', email: 'a@b.de' } })));
  await seedDb(page);

  await page.goto('/ausgabe/formular?propertyId=p1');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, btn(page, /Foto oder PDF auswählen/))]);
  await fc.setFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => body(page)).toContain('Automatisch ausgefüllt');
  expect(calls).toHaveLength(1);
  expect(calls[0].mediaType).toMatch(/^image\//);
  expect(calls[0].image.length).toBeGreaterThan(20);
  await expect(page.getByLabel('Betrag (brutto)')).toHaveValue('1234,5');
  await expect(page.getByLabel('Lieferant / Handwerker')).toHaveValue('Sanitär Meier');
  await expect(page.getByLabel('Beschreibung')).toHaveValue('Rohrbruch Keller');

  await tap(page, btn(page, /^Speichern/));
  await expect.poll(async () => (await readDb(page)).expenses?.length).toBe(1);
  const e = (await readDb(page)).expenses[0];
  expect(e).toMatchObject({ amount: 1234.5, vendor: 'Sanitär Meier', date: '2026-10-12', category: 'instandhaltung' });
  expect(e.receiptId).toBeTruthy();
});

test('Ohne Cloud-Anmeldung: Hinweis statt Fehler, manuelles Erfassen bleibt möglich', async ({ page }) => {
  await seedDb(page);
  await page.goto('/ausgabe/formular?propertyId=p1');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, btn(page, /Foto oder PDF auswählen/))]);
  await fc.setFiles({ name: 'beleg.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => body(page)).toContain('Melde dich unter Daten');
  await page.getByLabel('Betrag (brutto)').fill('80');
  await tap(page, btn(page, /^Speichern/));
  await expect.poll(async () => (await readDb(page)).expenses?.length).toBe(1);
});
