import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { body, btn, readDb, seedDb, tap } from './helpers';

const SW = path.resolve('dist-e2e/sw.js');
let swOriginal = '';
test.beforeAll(() => { swOriginal = fs.readFileSync(SW, 'utf8'); });
test.afterAll(() => { fs.writeFileSync(SW, swOriginal); });

test('Offline-Modus: Start ohne Netz, Zahlung erfassen, Brief erzeugen, Update-Banner', async ({ page, context }) => {
  page.on('dialog', (d) => d.accept());

  await seedDb(page);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); return (await (await caches.open(ks[0])).keys()).length; });
  expect(cached).toBeGreaterThan(20);

  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByText('Dein Bestand im Blick').first()).toBeVisible();
  expect(await body(page)).toContain('Du bist offline');

  await page.goto('/person/t1');
  await expect(page.getByText('Anna Schmidt').first()).toBeVisible();
  await tap(page, btn(page, 'Zahlung'));
  await page.getByLabel('Betrag').fill('800');
  await page.getByLabel('Notiz').fill('offline erfasst');
  await tap(page, btn(page, /buchen/));
  await expect.poll(async () => (await readDb(page)).payments.some((p: any) => p.note === 'offline erfasst' && p.source === 'manuell')).toBe(true);

  await page.goto('/mahnlauf');
  await page.waitForTimeout(1200);
  await tap(page, btn(page, /Mahnung.*erstellen/)).catch(() => {});
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.category === 'brief').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await context.setOffline(false);

  // Neue Version: Banner, Bestätigung, alte Caches weg, Daten bleiben
  fs.writeFileSync(SW, swOriginal.replace(/immo-[0-9a-f]{10}/, 'immo-neueversion'));
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update()));
  await expect(page.getByText('Neue Version verfügbar').first()).toBeVisible({ timeout: 20_000 });
  await Promise.all([page.waitForNavigation({ timeout: 15_000 }).catch(() => null), tap(page, btn(page, /Neue Version verfügbar/))]);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).join(',')), { timeout: 15_000 }).toBe('immo-neueversion');
  expect((await readDb(page)).payments.some((p: any) => p.note === 'offline erfasst')).toBe(true);
});
