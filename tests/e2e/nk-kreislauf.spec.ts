import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

const last = new Date().getFullYear() - 1;

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 60, rooms: 2, coldRent: 640, advance: 100 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Schmidt', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' }];
  d.expenses = [
    { id: 'e1', propertyId: 'p1', date: `${last}-03-10`, amount: 900, category: 'betriebskosten', vendor: 'Stadtwerke', description: 'Grundsteuer', allocatable: true },
    { id: 'e2', propertyId: 'p1', date: `${last}-06-10`, amount: 600, category: 'versicherung', vendor: 'Allianz', description: '', allocatable: true },
    { id: 'e3', propertyId: 'p1', date: `${last}-07-10`, amount: 800, category: 'instandhaltung', vendor: 'Meier', description: 'Dach', allocatable: false },
  ];
  return d;
}

test('Nebenkosten-Kreislauf: Ausgaben → Kostenpositionen → Abrechnung → Vorauszahlung anpassen → in der Wohnung übernehmen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());

  // Aufgabe weist auf die offene Übernahme hin
  await expect.poll(() => body(page)).toContain(`Betriebskosten ${last}`);

  await page.goto(`/nk-kosten?propertyId=p1&year=${last}`);
  await expect.poll(() => body(page)).toContain('Gebäudeversicherung');
  const t = await body(page);
  expect(t).toContain('Grundsteuer');
  expect(t).not.toContain('Dach'); // nicht umlagefähig
  await tap(page, btn(page, /2 Positionen übernehmen/));
  await expect.poll(async () => (await readDb(page)).costs.length).toBe(2);
  const costs = (await readDb(page)).costs;
  expect(costs.find((c: any) => c.category === 'Grundsteuer')).toMatchObject({ amount: 900, key: 'area', fromExpenses: true, year: last });

  // Nebenkosten-Lauf: 1.500 € Kosten, Vorauszahlung 100 € → Vorschlag 135 €
  await page.goto(`/nk-lauf?propertyId=p1`);
  await expect.poll(() => body(page)).toContain('Kosten sind aus den Ausgaben übernommen');
  expect(await body(page)).toMatch(/Vorauszahlung 100,00\s€ → 135,00\s€/);
  await tap(page, btn(page, /Vorauszahlung anpassen \(1\)/));
  await expect.poll(async () => (await readDb(page)).tenants[0].advanceChange?.amount, { timeout: 15_000 }).toBe(135);
  const ac = (await readDb(page)).tenants[0].advanceChange;
  expect(ac.from).toMatch(/^\d{4}-\d{2}-01$/);
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length).toBe(1);

  // In der Wohnung sichtbar und übernehmbar
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('ANGEKÜNDIGTE ÄNDERUNG');
  await tap(page, btn(page, /Vorauszahlung ab/));
  await expect.poll(async () => (await readDb(page)).units[0].advance).toBe(135);
  expect((await readDb(page)).tenants[0].advanceChange).toBeUndefined();
});
