import { expect, test } from '@playwright/test';
import { body, btn, seed, seedDb, tap } from './helpers';

test('Wohnung zeigt die Mieterhistorie: frühere Mieter mit Zeitraum und Kaltmiete', async ({ page }) => {
  const data: any = seed();
  data.tenants = [
    { id: 'h1', unitId: 'u1', name: 'Erika Alt', email: '', phone: '', moveIn: '2014-03-01', moveOut: '2016-09-30', deposit: 0, coldRent: 440, trackFrom: '2016-10' },
    { id: 'h2', unitId: 'u1', name: 'Bernd Mittel', email: '', phone: '', moveIn: '', moveOut: '2020-11-30', deposit: 0, trackFrom: '2020-12' },
    { id: 't1', unitId: 'u1', name: 'Anna Aktuell', email: '', phone: '', moveIn: '2020-12-01', moveOut: '', deposit: 0, trackFrom: '2026-08' },
  ];
  await seedDb(page, data);
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('Anna Aktuell');
  // Die Historie ist eingeklappt und öffnet sich auf Knopfdruck
  expect(await body(page)).not.toContain('Erika Alt');
  await tap(page, btn(page, /Mieterhistorie anzeigen/));
  await expect.poll(() => body(page)).toContain('Erika Alt');
  const t = await body(page);
  expect(t).toContain('Bernd Mittel');
  expect(t).toMatch(/01\.03\.2014 – 30\.09\.2016 · 2 Jahre 7 Monate · Kaltmiete 440,00/);
  expect(t).toContain('Einzug unbekannt – 30.11.2020');
  // Ehemalige haben keine offenen Posten
  await page.goto('/');
  expect(await body(page)).not.toContain('Erika Alt');
});
