import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

test('Zähler und Stände per CSV importieren und in der Wohnung sehen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page);
  await page.goto('/zaehler-import');
  await page.getByLabel('Oder Inhalt einfügen').fill('Haus;Einheit;Zähler;Zählernummer;Datum;Stand\nHaus Lindenstraße;Wohnung 1;Heizung;111;19.10.2013;0\nHaus Lindenstraße;Wohnung 1;Heizung;111;11.01.2014;1.882\nHaus Lindenstraße;Wohnung 2;Heizung;222;11.01.2014;813');
  await tap(page, btn(page, /^Einlesen/));
  await expect.poll(() => body(page)).toContain('3. VORSCHAU');
  await tap(page, btn(page, /Jetzt importieren/));
  await expect.poll(async () => (await readDb(page)).readings.length).toBe(3);
  const db = await readDb(page);
  expect(db.meters.map((m: any) => m.number).sort()).toEqual(['111', '222']);
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('Nr. 111');
});
