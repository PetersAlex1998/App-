import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

const ls = (page: any, k: string) => page.evaluate((k: string) => localStorage.getItem(k), k);

test.describe('Datensicherheit', () => {
  test('Änderung wird beim Verlassen der App sofort gesichert', async ({ page }) => {
    await seedDb(page);
    await page.goto('/objekt/formular?id=p1');
    await page.getByLabel('Bezeichnung').fill('Haus Neu');
    await tap(page, btn(page, /Speichern/));
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const raw = await readDb(page);
    expect(raw.properties[0].name).toBe('Haus Neu');
    expect(raw._schema).toBe(4);
    expect(raw.properties[0].updatedAt).toBeTruthy();
  });

  test('defekte Daten werden nie überschrieben', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('immo-db-v1', '{"properties":[{kaputt'));
    await page.reload();
    await expect(page.getByText('nicht lesbar').first()).toBeVisible();
    expect(await ls(page, 'immo-db-v1-defekt')).toBe('{"properties":[{kaputt');
    expect(await ls(page, 'immo-db-v1')).toBe('{"properties":[{kaputt');
    await tap(page, btn(page, /Mit leeren Daten starten/));
    await expect.poll(() => body(page)).toMatch(/Willkommen|Legen wir los/);
    expect(await ls(page, 'immo-db-v1-defekt')).toBe('{"properties":[{kaputt');
  });

  test('zu neues Datenformat: kein „leer starten“, Daten unverändert', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((d) => localStorage.setItem('immo-db-v1', JSON.stringify({ ...d, _schema: 99 })), seed());
    await page.reload();
    await expect(page.getByText('neueren Version').first()).toBeVisible();
    expect(await body(page)).not.toContain('Mit leeren Daten starten');
    expect(JSON.parse((await ls(page, 'immo-db-v1'))!)._schema).toBe(99);
  });

  test('Sicherungs-Erinnerung und verschlüsselte Sicherung (Rundlauf)', async ({ page, browser }, info) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
    await seedDb(page);
    expect(await body(page)).toContain('Sicherung fällig');

    await page.goto('/daten');
    const pw = page.getByLabel(/Passwort für verschlüsselte/);
    const save = () => btn(page, /Sicherung teilen oder speichern/);
    await pw.fill('kurz');
    await tap(page, save());
    expect(dialogs.some((m) => m.includes('mindestens 8'))).toBe(true);

    await pw.fill('Geheim-1234');
    const [dl] = await Promise.all([page.waitForEvent('download'), tap(page, save())]);
    const file = info.outputPath('verschluesselt.json');
    await dl.saveAs(file);
    expect(dl.suggestedFilename()).toContain('verschluesselt');
    const txt = (await import('node:fs')).readFileSync(file, 'utf8');
    expect(txt).toContain('"encrypted":true');
    expect(txt).not.toContain('Anna Schmidt');
    expect(JSON.parse((await ls(page, 'immo-settings-v1'))!).lastBackupAt).toBeTruthy();

    // Einspielen in einer frischen App
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const p2 = await ctx.newPage();
    const d2: string[] = [];
    p2.on('dialog', (d) => { d2.push(d.message()); d.accept(); });
    await p2.goto('/daten');
    await expect(p2.getByText('Sicherung und Darstellung').first()).toBeVisible();
    const pick = async () => {
      const [fc] = await Promise.all([p2.waitForEvent('filechooser'), tap(p2, btn(p2, /Sicherungsdatei auswählen/))]);
      // Per Puffer statt Pfad: unabhängig von Sonderzeichen im Testordner
      await fc.setFiles({ name: 'sicherung.json', mimeType: 'application/json', buffer: (await import('node:fs')).readFileSync(file) });
      await p2.waitForTimeout(900);
    };
    await pick();
    await expect.poll(() => d2.some((m) => m.includes('verschlüsselt') && m.includes('Passwort'))).toBe(true);
    await p2.getByLabel(/Passwort für verschlüsselte/).fill('falsches-Passwort');
    await pick();
    await expect.poll(() => d2.some((m) => m.includes('Passwort ist falsch'))).toBe(true);
    await p2.getByLabel(/Passwort für verschlüsselte/).fill('Geheim-1234');
    await pick();
    await expect.poll(() => d2.some((m) => m.includes('Sicherung einspielen') && m.includes('1 Objekte'))).toBe(true);
    await expect.poll(async () => (await readDb(p2)).tenants?.[0]?.name).toBe('Anna Schmidt');
    await ctx.close();
  });
});
