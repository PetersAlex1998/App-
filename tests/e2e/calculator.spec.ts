import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

test('Immokalkulator: Höchstpreis, Ampel, Speichern, Wiederöffnen, Löschen mit Rückgängig', async ({ page }) => {
  await seedDb(page);
  await page.goto('/kalkulator');
  await expect.poll(() => body(page)).toContain('Noch keine Kalkulation');
  await tap(page, btn(page, /Neue Kalkulation/));

  await page.getByLabel('Bezeichnung / Adresse').fill('Musterstr. 5, Paderborn');
  await page.getByLabel('Kaufpreis', { exact: true }).fill('300000');
  await page.getByLabel(/Kaltmiete pro Monat/).fill('1100');
  await page.getByLabel('Wohnfläche').fill('80');

  // Standard-Annahmen: Höchstpreis ca. 206.000 € (Rendite 4,5 % begrenzt vermutlich nicht, Cashflow/Faktor je nach Ziel)
  await expect.poll(() => body(page)).toContain('Empfohlener Höchstpreis');
  const t = await body(page);
  expect(t).toMatch(/Zu teuer/);
  expect(t).toMatch(/Netto-Mietrendite/);
  expect(t).toMatch(/Verhandle mindestens/);
  expect(t).toMatch(/Cashflow vor Steuern/);
  expect(t).toMatch(/Stresstest/i);

  // Niedrigerer Preis → „gut“
  await page.getByLabel('Kaufpreis', { exact: true }).fill('150000');
  await expect.poll(() => body(page)).toContain('Preis liegt unter dem Maximum');

  await tap(page, btn(page, /Kalkulation speichern/));
  await expect.poll(async () => (await readDb(page)).calculations?.length).toBe(1);
  const saved = (await readDb(page)).calculations[0];
  expect(saved).toMatchObject({ name: 'Musterstr. 5, Paderborn' });
  expect(saved.input).toMatchObject({ price: 150000, rentMonth: 1100, area: 80, landTax: 6.5 });

  // Liste zeigt Ergebnis, Öffnen lädt die Werte
  await expect.poll(() => body(page)).toContain('Musterstr. 5, Paderborn');
  expect(await body(page)).toMatch(/Max\. .*€/);
  await tap(page, btn(page, /Musterstr\. 5/));
  await expect(page.getByLabel('Kaufpreis', { exact: true })).toHaveValue('150000');

  // Löschen mit Rückgängig
  await tap(page, btn(page, /^Löschen/));
  await expect.poll(async () => (await readDb(page)).calculations.length).toBe(0);
  await tap(page, btn(page, /^Rückgängig/));
  await expect.poll(async () => (await readDb(page)).calculations.length).toBe(1);
});

test('Eigenkapital durchspielen: Regler, Schnellwahl, Euro-Eingabe, Vergleichstabelle und Mindest-Eigenkapital', async ({ page }) => {
  await seedDb(page);
  await page.goto('/kalkulator/formular');
  await page.getByLabel('Kaufpreis', { exact: true }).fill('300000');
  await page.getByLabel(/Kaltmiete pro Monat/).fill('1100');
  await page.getByLabel('Wohnfläche').fill('80');
  await expect.poll(() => body(page)).toContain('EIGENKAPITAL IM VERGLEICH');

  // Standard 20 % = 67.242 € bei 300.000 € Kaufpreis
  expect(await body(page)).toMatch(/67\.242,00\s€/);

  // Regler
  await page.getByLabel('Eigenkapital in Prozent').fill('50');
  await expect.poll(() => body(page)).toContain('50 %');
  await expect(page.getByLabel('Eigenkapital in Euro')).toHaveValue('168105');

  // Schnellwahl 100 %: kein Darlehen, Cashflow positiv
  await tap(page, btn(page, /^\s*100 Prozent Eigenkapital/));
  await expect.poll(() => body(page)).toMatch(/Darlehen 0,00\s€/);

  // Euro-Eingabe setzt den Prozentwert
  await page.getByLabel('Eigenkapital in Euro').fill('100000');
  await expect.poll(() => body(page)).toContain('29,7 %');

  // Vergleichstabelle: Zeile übernehmen
  await tap(page, btn(page, /^\s*40 Prozent Eigenkapital: Cashflow/));
  await expect.poll(async () => Number(await page.getByLabel('Eigenkapital in Prozent').inputValue())).toBe(40);

  // Mindest-Eigenkapital für Cashflow ≥ 0 übernehmen
  const t = await body(page);
  expect(t).toMatch(/Mindestens [\d,]+ % Eigenkapital/);
  await tap(page, btn(page, /Mindestens [\d,]+ % Eigenkapital/));
  const pctNow = Number(await page.getByLabel('Eigenkapital in Prozent').inputValue());
  expect(pctNow).toBeGreaterThanOrEqual(40);
  expect(pctNow).toBeLessThanOrEqual(42);
  await expect.poll(() => body(page)).toContain('40,9 %'); // Mindest-Eigenkapital für Cashflow ≥ 0
  expect(await body(page)).toMatch(/Kein Hebel|Positiver Hebel/);
});
