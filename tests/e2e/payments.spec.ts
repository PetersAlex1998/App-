import { expect, test } from '@playwright/test';
import path from 'node:path';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

test.describe('Zahlungen', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    const data: any = seed();
    // Altbestand ohne Herkunftsfelder
    data.payments = [{ id: 'alt1', tenantId: 't1', date: '2026-09-02', month: '2026-09', amount: 800, kind: 'miete', note: '' }];
    await seedDb(page, data);
  });

  test('manuell erfassen, nachträglich ändern, Herkunft dokumentiert', async ({ page }) => {
    await page.goto('/person/t1');
    await expect(page.getByText('Anna Schmidt').first()).toBeVisible();
    expect(await body(page)).toContain('Manuell');

    await tap(page, btn(page, 'Zahlung'));
    await expect(page.getByLabel('Betrag')).not.toHaveValue('');
    await page.getByLabel('Betrag').fill('800');
    await page.getByLabel('Notiz').fill('Barzahlung quittiert');
    await tap(page, btn(page, /buchen/));

    await expect.poll(async () => (await readDb(page)).payments.find((p: any) => p.note === 'Barzahlung quittiert')?.source).toBe('manuell');
    const man = (await readDb(page)).payments.find((p: any) => p.note === 'Barzahlung quittiert');
    expect(man.createdAt).toBeTruthy();

    await tap(page, btn(page, /Barzahlung quittiert/));
    expect(await body(page)).toContain('Manuell erfasst');
    await page.getByLabel('Betrag').fill('790');
    await tap(page, btn(page, /Änderungen speichern/));
    await expect.poll(async () => (await readDb(page)).payments.find((p: any) => p.note === 'Barzahlung quittiert')?.amount).toBe(790);
    const edited = (await readDb(page)).payments.find((p: any) => p.note === 'Barzahlung quittiert');
    expect(edited.editedAt).toBeTruthy();
    expect(edited.source).toBe('manuell');
  });

  test('Kontoauszug einlesen: Herkunft, Filter, Import rückgängig', async ({ page }) => {
    await page.goto('/zahlungen');
    await tap(page, btn(page, /Kontoauszug importieren/));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, btn(page, /CSV-Datei auswählen/))]);
    await fc.setFiles(path.join(__dirname, 'fixtures/bank2.csv'));
    await page.waitForTimeout(800);
    await tap(page, btn(page, /Zahlungen buchen/));

    await expect.poll(async () => (await readDb(page)).payments.filter((p: any) => p.source === 'import').length).toBe(2);
    const imp = (await readDb(page)).payments.filter((p: any) => p.source === 'import');
    expect(imp.every((p: any) => p.importId && p.importLabel?.includes('bank2.csv') && p.payer && p.createdAt)).toBe(true);
    expect(new Set(imp.map((p: any) => p.importId)).size).toBe(1);

    await page.goto('/zahlungen');
    await expect.poll(() => body(page)).toContain('Kontoauszug');
    expect(await body(page)).toContain('Manuell');

    await page.goto('/person/t2');
    await expect(btn(page, /Miete/)).toBeVisible();
    await tap(page, btn(page, /Miete/));
    await expect.poll(() => body(page)).toContain('Aus Kontoauszug eingelesen');
    expect(await body(page)).toContain('bank2.csv');
    await tap(page, btn(page, /Gesamten Import rückgängig machen/));
    await expect.poll(async () => (await readDb(page)).payments.filter((p: any) => p.source === 'import').length).toBe(0);
    expect((await readDb(page)).payments.some((p: any) => p.id === 'alt1')).toBe(true);
  });
});
