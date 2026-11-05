import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test('Zahlenfelder: Buchstaben werden nicht angenommen, absurde Beträge werden abgewiesen', async ({ page }) => {
  await seedDb(page, seed());
  await page.goto('/ausgabe/formular?propertyId=p1');
  const amount = page.getByLabel('Betrag (brutto)');
  await amount.fill('12abc,5€');
  await expect(amount).toHaveValue('12,5');
  await amount.fill('99999999');
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(() => body(page)).toContain('Der Betrag ist zu groß');
  expect((await readDb(page)).expenses ?? []).toHaveLength(0);
});

test('Texte sind in der Länge begrenzt', async ({ page }) => {
  await seedDb(page, seed());
  await page.goto('/ausgabe/formular?propertyId=p1');
  const v = page.getByLabel('Lieferant / Handwerker');
  await v.fill('x'.repeat(2000));
  expect((await v.inputValue()).length).toBe(500);
});

test('CSV-Export: Formelzeichen werden entschärft', async ({ page }, info) => {
  const d: any = seed();
  d.expenses = [{ id: 'e1', propertyId: 'p1', date: `${new Date().getFullYear() - 1}-05-01`, amount: 100, category: 'instandhaltung', vendor: '=HYPERLINK("http://x")', description: 'Test' }];
  await seedDb(page, d);
  await page.goto(`/anlage-v?year=${new Date().getFullYear() - 1}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page, btn(page, /Ausgaben als CSV exportieren/))]);
  const path = await dl.path();
  const text = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(text).toContain(`"'=HYPERLINK`);
  expect(text).not.toMatch(/;"=HYPERLINK/);
  void info;
});
