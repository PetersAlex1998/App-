import { expect, test } from '@playwright/test';
import { fullDb } from '../helpers/builders';
import { body, seedDb } from './helpers';

/** Rauchtest mit dem ausgebauten Bestand (7 Häuser, 88 Einheiten, ~2.000 Zahlungen, Darlehen, Schäden, Prüfungen): jede Seite öffnet zügig und ohne Fehler. */
test('Großer Bestand: alle wichtigen Seiten öffnen zügig und ohne Fehler', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  const db: any = fullDb();
  await seedDb(page, db);
  const pages: [string, string][] = [
    ['/', 'Dein Bestand im Blick'], ['/aufgaben', 'Aufgaben'], ['/portfolio', 'Cashflow'], ['/eigentuemer-abrechnung', 'Eigentümerabrechnung'],
    ['/kautionen', 'Gehaltene Kautionen'], ['/firmenabrechnung', 'Abrechnung an die Häuser'], ['/schaeden', 'offen'], ['/wartung', 'überfällig'],
    ['/darlehen', 'Restschuld heute'], ['/mieterhoehung-potenzial', 'Potenzial'], ['/objekte', 'Haus'], ['/zahlungen', 'Zahlung'], ['/module', 'Alle Module'],
  ];
  const times: string[] = [];
  for (const [url, text] of pages) {
    const t0 = Date.now();
    await page.goto(url);
    await expect.poll(() => body(page), { timeout: 15_000, message: url }).toContain(text);
    const ms = Date.now() - t0;
    times.push(`${url}: ${ms} ms`);
    expect(ms, `${url} öffnet zu langsam (${times.join('; ')})`).toBeLessThan(8000);
  }
  // Wohnung und Haus mit vielen Daten
  for (const [url, text] of [[`/objekt/${db.properties[0].id}`, db.properties[0].name], [`/wohnung/${db.units[0].id}`, db.units[0].name]]) {
    const t0 = Date.now();
    await page.goto(url);
    await expect.poll(() => body(page), { timeout: 15_000, message: url }).toContain(text);
    expect(Date.now() - t0, url).toBeLessThan(8000);
  }
  expect(errors).toEqual([]);
});
