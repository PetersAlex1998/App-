import { expect, test } from '@playwright/test';
import { body, btn, seedDb, tap } from './helpers';

test('Leiste: vier Bereiche ohne Lupe und ohne Mieter; „Alle Module“ sammelt die Funktionen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedDb(page);

  const tabs = page.getByRole('tab').filter({ visible: true });
  await expect(tabs).toHaveCount(4);
  const labels = (await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))));
  expect(labels).toEqual(['Übersicht', 'Objekte', 'Zahlungen', 'Module']);
  await expect(page.getByRole('button', { name: 'Suche' })).toHaveCount(0);

  // Die Leiste nutzt die volle Breite (kein Platz mehr für einen Suchknopf)
  const bar = await tabs.first().evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().toJSON());
  expect(bar.right).toBeGreaterThan(390 - 24);

  await tap(page, tabs.nth(3));
  await expect.poll(() => body(page)).toContain('Alle Module');
  const t = await body(page);
  for (const g of ['VERWALTEN', 'ABLÄUFE', 'FINANZEN', 'IMPORTIEREN', 'EINSTELLUNGEN']) expect(t).toContain(g);

  // Mieter ist ein Modul und öffnet die Mieterliste; „Module“ bleibt dabei aktiv
  await tap(page, btn(page, /^[^A-Za-zÄÖÜäöüß]*Mieter/));
  await expect.poll(() => body(page)).toContain('Deine Mieter');
  await expect(page.getByRole('tab', { name: 'Module' })).toHaveAttribute('aria-selected', 'true');

  // Suche liegt jetzt in den Modulen
  await tap(page, page.getByRole('tab', { name: 'Module' }));
  await tap(page, btn(page, /^[^A-Za-zÄÖÜäöüß]*Suche/));
  await expect.poll(() => body(page)).toContain('Suche');
  expect(errors).toEqual([]);
});

test('Jedes Modul in „Alle Module“ lässt sich öffnen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await seedDb(page);
  const titles = ['Mieter', 'Aufgaben', 'Prüfungen und Wartung', 'Schäden', 'Handwerker', 'Suche', 'Mahnlauf', 'Nebenkosten-Lauf', 'Briefausgang', 'Ausgaben und Belege', 'Auswertung für die Steuer', 'Immokalkulator', 'Portfolio', 'Mieterhöhungs-Potenzial', 'Kautionen', 'Darlehen', 'Eigentümerabrechnung', 'Abrechnung an die Häuser', 'Firmenkosten', 'Mietspiegel', 'Kontoauszug importieren', 'Bestand importieren', 'Zähler und Stände importieren', 'Cloud', 'Daten, Sicherung und Darstellung', 'Unternehmensdaten', 'Briefe und Mahnregeln', 'App-Sperre'];
  for (const title of titles) {
    await page.goto('/module');
    await expect.poll(() => body(page)).toContain('Alle Module');
    await tap(page, btn(page, new RegExp('^[^A-Za-zÄÖÜäöüß]*' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
    await page.waitForTimeout(300);
    expect(await body(page), title).not.toContain('Unbekannter Bildschirm');
  }
  expect(errors).toEqual([]);
});
