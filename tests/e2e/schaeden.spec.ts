import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' }];
  return d;
}

test('Schaden melden, Handwerker zuordnen, beauftragen, Rechnung erfassen, erledigen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());

  // Handwerker anlegen
  await page.goto('/handwerker/formular');
  await page.getByLabel('Name oder Firma').fill('Sanitär Meier');
  await page.getByRole('radio', { name: 'Sanitär' }).filter({ visible: true }).first().click();
  await page.getByLabel('E-Mail').fill('meier@example.de');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).contractors?.length).toBe(1);

  // Schaden melden (Wohnung vorbelegt)
  await page.goto('/schaeden/formular?propertyId=p1&unitId=u1');
  await page.getByLabel('Was ist kaputt?').fill('Heizung wird nicht warm');
  await page.getByRole('radio', { name: 'Sanitär Meier' }).filter({ visible: true }).first().click();
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).issues?.length).toBe(1);
  const i = (await readDb(page)).issues[0];
  expect(i).toMatchObject({ title: 'Heizung wird nicht warm', unitId: 'u1', tenantId: 't1', status: 'offen' });
  expect(i.contractorId).toBe((await readDb(page)).contractors[0].id);

  // Liste und Detail
  await page.goto('/schaeden');
  await expect.poll(() => body(page)).toContain('Heizung wird nicht warm');
  await tap(page, btn(page, /Heizung wird nicht warm/));
  await expect.poll(() => body(page)).toContain('Auftrag per E-Mail');
  await tap(page, btn(page, /Als beauftragt markieren/));
  await expect.poll(async () => (await readDb(page)).issues[0].status).toBe('beauftragt');

  // Rechnung: Handwerker und Titel vorbelegt, an die Meldung gebunden
  await tap(page, btn(page, /Rechnung erfassen/));
  await expect(page.getByLabel('Lieferant / Handwerker').filter({ visible: true }).first()).toHaveValue('Sanitär Meier');
  await page.getByLabel('Betrag (brutto)').fill('250');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).expenses.find((e: any) => e.issueId === i.id)?.amount).toBe(250);
  await expect.poll(() => body(page)).toMatch(/Zusammen 250,00\s€/);

  await tap(page, btn(page, /Als erledigt markieren/));
  await expect.poll(async () => (await readDb(page)).issues[0].status).toBe('erledigt');
  await page.goto('/handwerker');
  await expect.poll(() => body(page)).toContain('1 Auftrag');
  expect(await body(page)).toMatch(/250,00\s€/);
});

test('Schaden ohne Titel wird abgewiesen', async ({ page }) => {
  await seedDb(page, data());
  await page.goto('/schaeden/formular?propertyId=p1');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('Bitte kurz beschreiben');
  expect((await readDb(page)).issues ?? []).toHaveLength(0);
});
