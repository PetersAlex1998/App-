import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.properties = [{ id: 'p1', name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', yearBuilt: '', notes: '' }];
  const rents = [500, 600, 620, 640];
  d.units = rents.map((r, i) => ({ id: `u${i + 1}`, propertyId: 'p1', name: `Wohnung ${i + 1}`, no: i + 1, area: 50, rooms: 2, coldRent: r, advance: 100 }));
  d.tenants = rents.map((_, i) => ({ id: `t${i + 1}`, unitId: `u${i + 1}`, name: `Mieter ${i + 1}`, salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' }));
  return d;
}

test('Ohne Mietspiegel: Vergleichswohnungen auswählen, Obergrenze, Schreiben mit Begründung', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/mieterhoehung?unitId=u1');
  await tap(page, page.getByRole('radio', { name: 'Vergleichswohnungen' }));
  await expect.poll(() => body(page)).toContain('Wohnung 2');
  await expect.poll(() => body(page)).toContain('Wohnung 4');
  await page.getByLabel('Neue Kaltmiete pro Monat').fill('590');
  await tap(page, btn(page, /Schreiben erstellen/));
  await expect.poll(async () => (await readDb(page)).tenants[0].rentChange?.coldRent, { timeout: 15_000 }).toBe(590);
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length).toBe(1);
});

test('Mietspiegel pro Haus festlegen und Potenzial-Übersicht', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/mietspiegel');
  await tap(page, page.getByRole('radio', { name: 'Anderer Ort' }));
  await expect.poll(async () => (await readDb(page)).properties[0].rentBasis?.kind).toBe('andere');
  await page.getByLabel('Vergleichbare Gemeinde').fill('Paderborn');
  await expect.poll(async () => (await readDb(page)).properties[0].rentBasis?.gemeinde).toBe('Paderborn');

  await page.goto('/mieterhoehung-potenzial');
  await expect.poll(() => body(page)).toContain('Mieterhöhungs-Potenzial');
  await expect.poll(() => body(page)).toContain('Wohnung 1');
  expect(await body(page)).toContain('Vergleichswohnungen');
  expect(await body(page)).toMatch(/\+100,00\s€/);
});
