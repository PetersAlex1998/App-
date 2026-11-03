import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test('Löschen ohne Rückfrage, mit „Rückgängig“', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.accept(); });
  await seedDb(page);
  await page.goto('/person/formular?id=t2');
  await tap(page, btn(page, /^Löschen/));
  expect(dialogs).toBe(0);
  await expect.poll(async () => (await readDb(page)).tenants.length).toBe(1);
  await expect(page.getByText('Gelöscht').first()).toBeVisible();
  await tap(page, btn(page, /^Rückgängig/));
  await expect.poll(async () => (await readDb(page)).tenants.map((t: any) => t.id).sort()).toEqual(['t1', 't2']);
  expect((await readDb(page)).tenants.find((t: any) => t.id === 't2').name).toBe('Max Becker');
});

test('Datenprüfung: Aufgabe erscheint, führt zur Lösung und lässt sich als erledigt markieren', async ({ page }) => {
  const data: any = seed();
  data.tenants.push({ id: 't9', unitId: 'u1', name: 'Zweiter Mieter', email: '', phone: '', moveIn: '2025-01-01', moveOut: '', deposit: 0, trackFrom: '2026-10' });
  data.tenants[1].notes = 'Einzugsdatum fehlt in der Tabelle, bitte ergänzen.';
  await seedDb(page, data);
  await expect.poll(() => body(page)).toContain('Datenprüfung (2)');
  await expect.poll(() => body(page)).toContain('2 aktive Mieter in Wohnung 1');
  await tap(page, btn(page, /Datenprüfung \(2\)/));
  await expect.poll(() => body(page)).toContain('WICHTIG (1)');
  await tap(page, btn(page, /Erledigt: Prüfen: Max Becker/));
  await expect.poll(() => body(page)).not.toContain('Prüfen: Max Becker');
  await page.reload();
  await expect.poll(() => body(page)).not.toContain('Prüfen: Max Becker');
});
