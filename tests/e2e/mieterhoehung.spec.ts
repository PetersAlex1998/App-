import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Schmidt', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' }];
  return d;
}

test('Mieterhöhung: prüfen, Schreiben erstellen, Zustimmung übernehmen, Mietverlauf', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/wohnung/u1');
  await tap(page, btn(page, /Miete erhöhen/));
  await expect.poll(() => body(page)).toContain('Miete erhöhen');

  // zu hoch: Kappungsgrenze → nicht zulässig, Knopf gesperrt
  await page.getByLabel('Neue Kaltmiete pro Monat').fill('700');
  await tap(page, page.getByRole('radio', { name: 'Mietspiegel' }));
  await page.getByLabel(/Mittelwert deiner Wohnung/).fill('15');
  await expect.poll(() => body(page)).toContain('Nicht zulässig');
  expect(await body(page)).toContain('Kappungsgrenze');
  await expect(page.getByRole('button', { name: /Schreiben erstellen/ }).filter({ visible: true }).first()).toBeDisabled();

  // zulässig
  await page.getByLabel('Neue Kaltmiete pro Monat').fill('575');
  await expect.poll(() => body(page)).toMatch(/Zulässig/);
  expect(await body(page)).not.toContain('Nicht zulässig');
  await tap(page, btn(page, /Schreiben erstellen/));
  await expect.poll(async () => (await readDb(page)).tenants[0].rentChange?.coldRent, { timeout: 15_000 }).toBe(575);
  const rc = (await readDb(page)).tenants[0].rentChange;
  expect(rc).toMatchObject({ kind: 'vergleich', coldRent: 575 });
  expect(rc.from).toMatch(/^\d{4}-\d{2}-01$/);
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length).toBe(1);
  // Miete ist noch nicht geändert
  expect((await readDb(page)).units[0].terms).toBeUndefined();

  // Zustimmung erhalten → Mietverlauf
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('ANGEKÜNDIGTE MIETERHÖHUNG');
  await tap(page, btn(page, /Kaltmiete ab/));
  await expect.poll(async () => (await readDb(page)).units[0].terms?.length).toBe(1);
  const u = (await readDb(page)).units[0];
  expect(u.terms[0]).toMatchObject({ coldRent: 575, advance: 100, reason: 'Vergleichsmiete' });
  expect(u.coldRent).toBe(500); // Basis bleibt: vorher galten 500 €
  expect((await readDb(page)).tenants[0].rentChange).toBeUndefined();
  await expect.poll(() => body(page)).toContain('MIETVERLAUF');
  expect(await body(page)).toContain('Vorher: 500,00');
});

test('Miete direkt eintragen (Staffel) und Indexmiete', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/mieterhoehung?unitId=u1');
  await tap(page, page.getByRole('radio', { name: 'Eintragen' }));
  await page.getByLabel('Neue Kaltmiete pro Monat').fill('530');
  await page.getByLabel('Grund').fill('Staffelmiete');
  await tap(page, btn(page, /^Eintragen/));
  await expect.poll(async () => (await readDb(page)).units[0].terms?.[0]?.coldRent).toBe(530);
  expect((await readDb(page)).units[0].terms[0].reason).toBe('Staffelmiete');

  await page.goto('/mieterhoehung?unitId=u1');
  await tap(page, page.getByRole('radio', { name: 'Indexmiete' }));
  await page.getByLabel('Index bei der letzten Mietfestsetzung').fill('100');
  await page.getByLabel('Aktueller Index').fill('110');
  await expect.poll(() => body(page)).toContain('Neue Kaltmiete: 550,00');
});
