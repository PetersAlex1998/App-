import { Locator, Page, expect } from '@playwright/test';

export const mk = (i: number, name: string, moveIn = '2026-06-01', over: object = {}) =>
  ({ id: 't' + i, unitId: 'u' + i, name, salutation: i === 1 ? 'Frau' : 'Herr', email: '', phone: '', moveIn, moveOut: '', deposit: 0, trackFrom: '2026-08', ...over });

export const seed = () => ({
  properties: [{ id: 'p1', name: 'Haus Lindenstraße', street: 'Lindenstr. 12', zip: '50667', city: 'Köln', yearBuilt: '', notes: '', houseNo: 1 }],
  units: [1, 2].map((i) => ({ id: 'u' + i, propertyId: 'p1', name: 'Wohnung ' + i, no: i, area: 60, rooms: 2, coldRent: 640, advance: 160 })),
  tenants: [mk(1, 'Anna Schmidt'), mk(2, 'Max Becker')],
  payments: [], reminders: [], costs: [], meters: [], readings: [], documents: [],
});

/** Daten vor dem Start der App in den Speicher legen. */
export async function seedDb(page: Page, data: object = seed()) {
  await page.goto('/');
  await page.evaluate((d) => localStorage.setItem('immo-db-v1', JSON.stringify(d)), data);
  await page.reload();
  await expect(page.getByText('Dein Bestand im Blick').first()).toBeVisible();
}

export const readDb = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('immo-db-v1')!));

/** Tippen per Koordinaten: zuverlässig mit React-Native-Web (Overlays, Animationen). */
export async function tap(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const bb = (await loc.boundingBox())!;
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(450);
}

export const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();
export const body = (page: Page) => page.innerText('body');
