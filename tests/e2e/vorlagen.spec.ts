import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

function data() {
  const d: any = seed();
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 60, rooms: 2, coldRent: 640, advance: 160 }, { id: 'u2', propertyId: 'p1', name: 'Wohnung 2', no: 2, area: 50, rooms: 2, coldRent: 500, advance: 100 }];
  d.tenants = [
    { id: 't1', unitId: 'u1', name: 'Anna Schmidt', salutation: 'Frau', email: '', phone: '', moveIn: '2025-01-01', moveOut: '', deposit: 1500, trackFrom: '2026-10' },
    { id: 't2', unitId: 'u2', name: 'Max Becker', salutation: 'Herr', email: '', phone: '', moveIn: '2024-06-01', moveOut: '', deposit: 0, trackFrom: '2026-10' },
  ];
  return d;
}
const company = { name: 'Mustermann Immobilien', legalForm: 'GmbH', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', email: 'info@muster.de', iban: 'DE89370400440532013000', signerName: 'Max Mustermann', taxNo: '339/5800/1234' };

test('Dokumente erstellen: Vorlage wählen, Mieter vorbelegt, Brief im Briefausgang', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await expect.poll(() => body(page)).toContain('Dein Bestand im Blick');

  // aus der Wohnung: Mieter ist schon gewählt
  await page.goto('/wohnung/u1');
  await tap(page, btn(page, /^[^A-Za-z]*Schreiben/));
  await expect.poll(() => body(page)).toContain('Dokumente erstellen');
  expect(await body(page)).toContain('Mietvertrag Wohnraum');
  await tap(page, btn(page, /Mietbescheinigung/));
  await expect.poll(() => body(page)).toContain('Anna Schmidt');
  await tap(page, btn(page, /Im Briefausgang ablegen/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 15_000 }).toBe(1);
  const doc = (await readDb(page)).documents[0];
  expect(doc).toMatchObject({ ownerKind: 'tenant', ownerId: 't1', note: 'Mietbescheinigung' });
  expect(doc.name).toContain('Mietbescheinigung');
});

test('Mietvertrag: Kautionswarnung, Pflichtangabe; Zahlungsinformation für alle Mieter', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await expect.poll(() => body(page)).toContain('Dein Bestand im Blick');

  await page.goto('/vorlagen/formular?templateId=mietvertrag&tenantId=t1');
  await expect.poll(() => body(page)).toContain('Mietbeginn');
  await page.getByLabel('Kaution', { exact: true }).fill('2500');
  await expect.poll(() => body(page)).toContain('drei Nettokaltmieten');

  await page.goto('/vorlagen/formular?templateId=zahlungsinfo');
  await expect.poll(() => body(page)).toContain('2 Briefe erstellen');
  await tap(page, btn(page, /2 Briefe erstellen/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 20_000 }).toBe(2);
});
