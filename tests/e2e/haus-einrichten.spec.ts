import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.properties = [{ id: 'p1', name: 'Haus A', street: '', zip: '', city: '', yearBuilt: '', notes: '' }];
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 0, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = []; d.payments = [];
  return d;
}

test('Haus einrichten: Checkliste, Sprung zum Feld, „Nicht nötig“ rechnet den Fortschritt neu', async ({ page }) => {
  await seedDb(page, data());
  await page.goto('/objekt/p1');
  await expect.poll(() => body(page)).toMatch(/Haus einrichten: \d von \d+ erledigt/);
  await tap(page, btn(page, /Haus einrichten:/));
  await expect.poll(() => body(page)).toContain('NOCH OFFEN');
  expect(await body(page)).toMatch(/Es fehlt: Straße, PLZ, Ort/);
  expect(await body(page)).toMatch(/1 Einheit ohne Fläche/);

  const before = (await body(page)).match(/(\d+) von (\d+) erledigt/)!;
  await tap(page, page.getByRole('button', { name: /Darlehen: nicht nötig/ }).filter({ visible: true }).first());
  await expect.poll(async () => (await readDb(page)).properties[0].setupSkip).toEqual(['darlehen']);
  await expect.poll(async () => (await body(page)).match(/(\d+) von (\d+) erledigt/)![2]).toBe(String(Number(before[2]) - 1));
  expect(await body(page)).toContain('Wieder aufnehmen');

  // Pflichtangaben lassen sich nicht überspringen
  expect(await page.getByRole('button', { name: /Adresse: nicht nötig/ }).count()).toBe(0);
});

test('Aufgabe für fehlende Pflichtangaben führt zur Checkliste', async ({ page }) => {
  await seedDb(page, data());
  await page.goto('/aufgaben');
  await expect.poll(() => body(page)).toContain('Haus einrichten: Haus A');
  await tap(page, btn(page, /Haus einrichten: Haus A/));
  await expect.poll(() => body(page)).toContain('NOCH OFFEN');
});
