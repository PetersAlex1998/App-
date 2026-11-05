import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.properties = [{ id: 'p1', name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', yearBuilt: '1975', notes: '', purchasePrice: '400000', marketValue: '500000' }];
  d.units = [
    { id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 },
    { id: 'u2', propertyId: 'p1', name: 'Wohnung 2', no: 2, area: 55, rooms: 2, coldRent: 650, advance: 160, floor: '1. OG' },
  ];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna Alt', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2099-01' }];
  const y = new Date().getFullYear() - 1;
  d.payments = Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, tenantId: 't1', date: `${y}-${String(i + 1).padStart(2, '0')}-03`, month: `${y}-${String(i + 1).padStart(2, '0')}`, amount: 600, kind: 'miete', note: '' }));
  d.expenses = [{ id: 'e1', propertyId: 'p1', date: `${y}-06-01`, amount: 1000, category: 'instandhaltung', vendor: 'X', description: '' }];
  return d;
}

test('Portfolio: Cashflow, Leerstand und Handlungsfelder', async ({ page }) => {
  await seedDb(page, data());
  await page.goto('/portfolio');
  await expect.poll(() => body(page)).toContain('Portfolio');
  await expect.poll(() => body(page)).toMatch(/Einnahmen 7\.200,00\s€ − Ausgaben 1\.000,00\s€/);
  expect(await body(page)).toMatch(/Cashflow \d{4} nach Zins und Tilgung/);
  expect(await body(page)).toMatch(/1 Einheit leer/);
  expect(await body(page)).toContain('HÄUSER');
  expect(await body(page)).toMatch(/1\/2 vermietet/);
});

test('Exposé: Vorbelegung, Hinweise, PDF öffnet sich', async ({ page }) => {
  await seedDb(page, data());
  await page.goto('/wohnung/u2');
  await tap(page, btn(page, /^[^A-Za-z]*Exposé/));
  await expect.poll(() => body(page)).toContain('Exposé');
  await expect(page.getByLabel('Titel').filter({ visible: true }).first()).toHaveValue('2-Zimmer-Wohnung, 55 m², Bad Lippspringe');
  await expect(page.getByLabel('Kaltmiete pro Monat').filter({ visible: true }).first()).toHaveValue('650');
  await expect(page.getByLabel('Kaution').filter({ visible: true }).first()).toHaveValue('1950');
  expect(await body(page)).toContain('Energieangaben fehlen');
  const [popup] = await Promise.all([page.waitForEvent('popup'), tap(page, btn(page, /Exposé ansehen/))]);
  expect(popup).toBeTruthy();
});

test('Exposé ablegen: Dokument bei der Wohnung', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/expose?unitId=u2');
  await expect.poll(() => body(page)).toContain('ANGEBOT');
  const [popup] = await Promise.all([page.waitForEvent('popup'), tap(page, btn(page, /Erstellen und bei der Wohnung ablegen/))]);
  void popup;
  await expect.poll(async () => (await readDb(page)).documents.filter((x: any) => x.note === 'Exposé' && x.ownerId === 'u2').length).toBe(1);
});
