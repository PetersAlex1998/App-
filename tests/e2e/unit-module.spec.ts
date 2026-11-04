import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

const lastYear = new Date().getFullYear() - 1;
const ym = (o: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + o); return d.toISOString().slice(0, 7); };

function data() {
  const d: any = seed();
  d.tenants = [
    { id: 'a', unitId: 'u1', name: 'Erika Alt', email: '', phone: '', moveIn: '2014-03-01', moveOut: '2016-09-30', deposit: 0, coldRent: 440, trackFrom: '2016-10' },
    { id: 'b', unitId: 'u1', name: 'Bernd Mitte', email: '', phone: '', moveIn: '2017-03-01', moveOut: '2020-11-30', deposit: 0, trackFrom: '2020-12' },
    { id: 't1', unitId: 'u1', name: 'Anna Aktuell', email: '', phone: '', moveIn: '2020-12-01', moveOut: '', deposit: 1500, trackFrom: ym(-3) },
    { id: 't2', unitId: 'u2', name: 'Max Becker', email: '', phone: '', moveIn: '2020-12-01', moveOut: '', deposit: 0, trackFrom: ym(0) },
  ];
  d.costs = [{ id: 'c1', propertyId: 'p1', year: lastYear, category: 'Müllabfuhr', amount: 240, key: 'area' }];
  d.meters = [{ id: 'm1', propertyId: 'p1', unitId: 'u1', type: 'heizung', number: '4711' }];
  d.readings = [{ id: 'r1', meterId: 'm1', date: '2025-12-31', value: 1200 }];
  return d;
}

test('Wohnungsmodul: Schnellaktionen, volle Mieterhistorie auf Knopfdruck, Mahnung und Abrechnung direkt auslösen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('Anna Aktuell');

  // Schnellaktionen sichtbar
  for (const name of ['Zahlung', 'Ablesung', '(Mahnung|Erinnerung)', `NK ${lastYear}`, 'Neuer Mieter', 'Dokument', 'Zähler +']) {
    await expect(page.getByRole('button', { name: new RegExp('^' + name.replace(/[+]/g, '\\+')) }).filter({ visible: true }).first(), name).toBeVisible();
  }

  // Historie ist eingeklappt und lässt sich auf Knopfdruck komplett öffnen
  let t = await body(page);
  expect(t).not.toContain('Erika Alt');
  await tap(page, btn(page, /Mieterhistorie anzeigen/));
  await expect.poll(() => body(page)).toContain('Erika Alt');
  t = await body(page);
  expect(t).toContain('Bernd Mitte');
  expect(t).toContain('Anna Aktuell');
  expect(t).toContain('Aktuell'); // Markierung des aktuellen Mieters
  expect(t).toMatch(/Leerstand · 5 Monate/); // 10/2016 bis 02/2017
  expect(t).toMatch(/01\.03\.2014 – 30\.09\.2016 · 2 Jahre 7 Monate · Kaltmiete 440,00/);
  expect(t).toMatch(/Kaution 1\.500,00/);
  await tap(page, btn(page, /Mieterhistorie ausblenden/));
  await expect.poll(() => body(page)).not.toContain('Erika Alt');

  // Zahlung direkt aus der Wohnung
  await tap(page, btn(page, /^\s*[^A-Za-z]*Zahlung$/));
  await expect(page.getByLabel('Betrag')).toBeVisible();
  await page.goBack();

  // Mahnung direkt aus der Wohnung (Miete überfällig)
  await expect.poll(() => body(page)).toContain('Anna Aktuell');
  await tap(page, btn(page, /Mahnung\. Miete überfällig|Erinnerung\. Miete überfällig/));
  await expect.poll(async () => (await readDb(page)).reminders.length, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await readDb(page)).documents.filter((x: any) => x.category === 'brief').length, { timeout: 15_000 }).toBe(1);

  // Nebenkostenabrechnung direkt aus der Wohnung
  await page.goto('/wohnung/u1');
  await tap(page, btn(page, new RegExp(`^NK ${lastYear}`)));
  await expect.poll(async () => (await readDb(page)).documents.filter((x: any) => x.category === 'brief').length, { timeout: 15_000 }).toBe(2);
  expect((await readDb(page)).tenants.find((x: any) => x.id === 't1').nkDone[String(lastYear)]).toBeTruthy();

  // Zähler anlegen mit vorbelegter Wohnung
  await page.goto('/wohnung/u1');
  await tap(page, btn(page, /Zähler \+/));
  await expect.poll(() => body(page)).toMatch(/Zählernummer|Neuer Zähler/);
});

test('Leere Wohnung: Aktionen, die einen Mieter brauchen, sind gesperrt', async ({ page }) => {
  const d = data();
  d.tenants = [];
  await seedDb(page, d);
  await page.goto('/wohnung/u1');
  await expect.poll(() => body(page)).toContain('Leerstand');
  const zahlung = page.getByRole('button', { name: /^[^A-Za-z]*Zahlung$/ }).filter({ visible: true }).first();
  await expect(zahlung).toBeDisabled();
  expect(await body(page)).not.toContain('Mieterhistorie anzeigen');
});
