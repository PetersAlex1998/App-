import { Page, expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 60, rooms: 2, coldRent: 640, advance: 160 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Schmidt', salutation: 'Frau', email: '', phone: '', moveIn: '2025-01-01', moveOut: '', deposit: 1500, trackFrom: '2026-10' }];
  return d;
}
const company = { name: 'Mustermann Immobilien', legalForm: 'GmbH', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', email: 'info@muster.de', signerName: 'Max Mustermann', iban: 'DE89370400440532013000' };
const readSettings = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('immo-settings-v1') || '{}'));

/** Mit der Maus (wie mit dem Finger) eine Unterschrift in das n-te sichtbare Feld zeichnen. */
async function sign(page: Page, n = 0) {
  const pad = page.getByTestId('signature-pad').filter({ visible: true }).nth(n);
  await pad.scrollIntoViewIfNeeded();
  const bb = (await pad.boundingBox())!;
  await page.mouse.move(bb.x + 30, bb.y + bb.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(bb.x + 30 + i * 14, bb.y + bb.height * (0.6 - 0.25 * Math.sin(i / 2)), { steps: 2 });
  await page.mouse.up();
}

test('Eigene Unterschrift in den Unternehmensdaten zeichnen und speichern', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/unternehmen');
  await expect.poll(() => body(page)).toContain('MEINE UNTERSCHRIFT');
  // leer: Speichern verlangt eine Unterschrift
  await tap(page, btn(page, /^[^A-Za-z]*Unterschrift speichern/));
  expect((await readSettings(page)).signature ?? '').toBe('');
  await sign(page);
  await tap(page, btn(page, /^[^A-Za-z]*Unterschrift speichern/));
  await expect.poll(async () => (await readSettings(page)).signature).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByLabel('Gespeicherte Unterschrift').first()).toBeVisible();
  expect((await readSettings(page)).autoSign).not.toBe(false);
});

test('Übergabeprotokoll: Vermieter und Mieter unterschreiben am Handy, PDF und Nachweis werden abgelegt', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await page.goto('/vorlagen/formular?templateId=uebergabeprotokoll&tenantId=t1&unitId=u1');
  await expect.poll(() => body(page)).toContain('UNTERSCHRIFT');
  await tap(page, btn(page, /Jetzt am Handy unterschreiben/));
  await expect.poll(() => body(page)).toContain('Gib das Handy der unterschreibenden Person');
  expect(await page.getByTestId('signature-pad').filter({ visible: true }).count()).toBe(2);
  // ohne Unterschrift ist „Fertig“ gesperrt
  await expect(page.getByRole('button', { name: /Fertig/ }).filter({ visible: true }).first()).toBeDisabled();
  await sign(page, 0);
  await sign(page, 1);
  await tap(page, btn(page, /^[^A-Za-z]*Fertig/));
  await expect.poll(() => body(page)).toContain('Unterschrieben. Neu unterschreiben');
  await tap(page, btn(page, /Im Briefausgang ablegen/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 20_000 }).toBe(1);
  const doc = (await readDb(page)).documents[0];
  expect(doc.signed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(doc.letter.signatures).toBeUndefined(); // Zeichnungen stehen nur im PDF
  expect(doc.letter.logo).toBeUndefined();
  expect(doc.size).toBeGreaterThan(3000);
});

test('Briefausgang: später am Handy unterschreiben (Mieter vor Ort)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await page.goto('/vorlagen/formular?templateId=wohnungsgeber&tenantId=t1&unitId=u1');
  await expect.poll(() => body(page)).toContain('Wohnungsgeberbestätigung');
  await tap(page, btn(page, /Im Briefausgang ablegen/));
  await expect.poll(async () => (await readDb(page)).documents.length, { timeout: 20_000 }).toBe(1);
  expect((await readDb(page)).documents[0].signed).toBeUndefined();
  const sizeBefore = (await readDb(page)).documents[0].size;

  await page.goto('/briefausgang');
  await tap(page, btn(page, /: unterschreiben/));
  await expect.poll(() => body(page)).toContain('Unterschreiben');
  await sign(page, 0);
  await tap(page, btn(page, /^[^A-Za-z]*Fertig/));
  await expect.poll(async () => (await readDb(page)).documents[0].signed, { timeout: 20_000 }).toBeTruthy();
  expect((await readDb(page)).documents[0].size).toBeGreaterThan(sizeBefore);
  await expect.poll(() => body(page)).toContain('Unterschrieben am');
  await expect.poll(() => body(page)).toContain('Neu unterschreiben');
});

test('Mietvertrag erstellen und trotzdem am Handy unterschreiben (mit Hinweis zur Form)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), { ...company, signature: SIG });
  await page.reload();
  await page.goto('/vorlagen/formular?templateId=mietvertrag&tenantId=t1&unitId=u1');
  await expect.poll(() => body(page)).toContain('UNTERSCHRIFT');
  expect(await body(page)).toMatch(/Bei Mietverträgen über ein Jahr/);
  await tap(page, btn(page, /Jetzt am Handy unterschreiben/));
  await expect.poll(() => body(page)).toContain('Gib das Handy der unterschreibenden Person');
  expect(await body(page)).toMatch(/Die Handy-Unterschrift gilt dort als Nachweis/);
  // Vermieter: gespeicherte Unterschrift ist vorbelegt, der Mieter zeichnet
  expect(await page.getByTestId('signature-pad').filter({ visible: true }).count()).toBe(1);
  await sign(page, 0);
  await tap(page, btn(page, /^[^A-Za-z]*Fertig/));
  await expect.poll(() => body(page)).toContain('Unterschrieben. Neu unterschreiben');
  await tap(page, btn(page, /Im Briefausgang ablegen/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 20_000 }).toBe(1);
  const doc = (await readDb(page)).documents[0];
  expect(doc.note).toBe('Mietvertrag Wohnraum');
  expect(doc.signed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('Mietvertrag: ohne Handy-Unterschrift bleibt das Schreiben nachträglich unterschreibbar', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await page.goto('/vorlagen/formular?templateId=mietvertrag&tenantId=t1&unitId=u1');
  await tap(page, btn(page, /Im Briefausgang ablegen/));
  await expect.poll(async () => (await readDb(page)).documents.length, { timeout: 20_000 }).toBe(1);
  await page.goto('/briefausgang');
  await tap(page, btn(page, /: unterschreiben/));
  await expect.poll(() => body(page)).toContain('Gib das Handy der unterschreibenden Person');
  expect(await page.getByTestId('signature-pad').filter({ visible: true }).count()).toBe(2);
  await sign(page, 0);
  await sign(page, 1);
  await tap(page, btn(page, /^[^A-Za-z]*Fertig/));
  await expect.poll(async () => (await readDb(page)).documents[0].signed, { timeout: 20_000 }).toBeTruthy();
});
