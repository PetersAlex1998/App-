import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test('Haus: drei Eigentümer mit Anteilen und Hauskonto eintragen, Prüfungen greifen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const d0: any = seed();
  d0.properties = [{ ...d0.properties[0], owners: undefined, bank: undefined }];
  await seedDb(page, d0);
  await page.goto('/objekt/formular?id=p1');
  await expect.poll(() => body(page)).toContain('EIGENTÜMER');

  for (let i = 0; i < 3; i++) await tap(page, btn(page, /Eigentümer hinzufügen/));
  await page.getByLabel('Eigentümer 1').fill('Max Muster');
  await page.getByLabel('Eigentümer 2').fill('Erika Muster');
  await page.getByLabel('Eigentümer 3').fill('Paul Muster');
  const shares = page.getByLabel('Anteil', { exact: true });
  await shares.nth(0).fill('50');
  await shares.nth(1).fill('30');
  await shares.nth(2).fill('10,5');
  await expect.poll(() => body(page)).toMatch(/Anteile zusammen: 90,5 %/);

  // Anteile ungleich 100 %: Speichern wird abgewiesen
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('Die Anteile ergeben 90,5 %');
  expect((await readDb(page)).properties[0].owners).toBeUndefined();

  await shares.nth(2).fill('20');
  await expect.poll(() => body(page)).toMatch(/Anteile zusammen: 100 % ✓/);

  // ungültige IBAN wird abgewiesen
  await page.getByLabel('IBAN', { exact: true }).fill('DE00 1234');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('Die IBAN ist nicht gültig');
  await page.getByLabel('IBAN', { exact: true }).fill('de02 1203 0000 0000 2020 51');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).properties[0].owners?.length).toBe(3);
  const p = (await readDb(page)).properties[0];
  expect(p.owners.map((o: any) => [o.name, o.share])).toEqual([['Max Muster', 50], ['Erika Muster', 30], ['Paul Muster', 20]]);
  expect(p.bank.iban).toBe('DE02120300000000202051');
});

test('Einzelner Eigentümer ohne Anteil gilt als 100 %; Eigentümer aus anderem Haus übernehmen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const d: any = seed();
  d.properties = [
    { ...d.properties[0], owners: [{ name: 'Max Muster', share: 100, address: 'Weg 1, 33100 Paderborn' }] },
    { id: 'p2', name: 'Haus B', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', yearBuilt: '', notes: '', houseNo: 2 },
  ];
  await seedDb(page, d);
  await page.goto('/objekt/formular?id=p2');
  await tap(page, btn(page, /Max Muster übernehmen/));
  await expect.poll(() => body(page)).toContain('Eigentümer 1');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).properties[1].owners?.[0]?.share).toBe(100);
  expect((await readDb(page)).properties[1].owners[0]).toMatchObject({ name: 'Max Muster', address: 'Weg 1, 33100 Paderborn' });
});

test('Haus einrichten: Eigentümer und Hauskonto sind Pflichtangaben und erzeugen eine Aufgabe', async ({ page }) => {
  const d: any = seed();
  d.properties = [{ ...d.properties[0], owners: undefined, bank: undefined }];
  await seedDb(page, d);
  await page.goto('/aufgaben');
  await expect.poll(() => body(page)).toContain('Haus einrichten: Haus Lindenstraße');
  expect(await body(page)).toMatch(/Es fehlt: .*Eigentümer.*Bankkonto des Hauses/);
});
