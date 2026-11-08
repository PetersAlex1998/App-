import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

const company = { name: 'Mustermann Verwaltung', legalForm: 'GmbH', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', email: 'info@muster.de', taxNo: '339/5800/1234', iban: 'DE89370400440532013000' };

function data() {
  const d: any = seed();
  d.units = [1, 2].map((i) => ({ id: 'u' + i, propertyId: 'p1', name: 'Wohnung ' + i, no: i, area: 60, rooms: 2, coldRent: 640, advance: 160 }));
  d.tenants = []; d.payments = [];
  return d;
}

test('Firmenkosten erfassen und monatliche Rechnung an das Haus erstellen, buchen, bezahlen, löschen', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();

  // Hausmeisterkosten, die die Firma bezahlt hat
  await page.goto('/firmenkosten/formular?propertyId=p1');
  await page.getByLabel('Betrag netto').fill('100');
  await expect.poll(() => body(page)).toMatch(/Brutto 119,00\s€/);
  await tap(page, btn(page, /^[^A-Za-z]*Speichern/));
  await expect.poll(async () => (await readDb(page)).firmCosts?.length).toBe(1);
  expect((await readDb(page)).firmCosts[0]).toMatchObject({ net: 100, vat: 19, category: 'hausmeister', allocatable: true });

  // Abrechnung: 2 Einheiten × 25 € + 100 € Hausmeister = 150 € netto, 28,50 € USt
  await page.goto('/firmenabrechnung');
  await expect.poll(() => body(page)).toContain('HAUS LINDENSTRASSE');
  await expect.poll(() => body(page)).toMatch(/Rechnungsbetrag\s*178,50\s€/);
  // Betrag ändern: 30 € je Einheit → 160 € netto, 30,40 € USt
  await page.getByLabel('Verwaltungsgebühr je Einheit (netto)').fill('30');
  await expect.poll(() => body(page)).toMatch(/Rechnungsbetrag\s*190,40\s€/);
  await tap(page, btn(page, /1 Rechnung erstellen/));
  await expect.poll(async () => (await readDb(page)).firmInvoices?.length, { timeout: 20_000 }).toBe(1);

  const db = await readDb(page);
  const inv = db.firmInvoices[0];
  expect(inv).toMatchObject({ propertyId: 'p1', net: 160, vatSum: 30.4, gross: 190.4 });
  expect(inv.number).toMatch(/^R-\d{6}-H01$/);
  // Buchungen beim Haus
  const ex = db.expenses.filter((e: any) => e.invoiceId === inv.id);
  expect(ex.map((e: any) => [e.category, e.amount, !!e.allocatable])).toEqual([['verwaltung', 71.4, false], ['hausmeister', 119, true]]);
  expect(ex.every((e: any) => e.receiptId === inv.docId)).toBe(true);
  // Kosten sind weiterbelastet, PDF liegt im Briefausgang beim Haus
  expect(db.firmCosts[0].billedIn).toBe(inv.id);
  expect(db.documents.find((d: any) => d.id === inv.docId)).toMatchObject({ ownerKind: 'property', ownerId: 'p1', category: 'brief', status: 'bereit' });

  // wieder in der Abrechnung: Rechnung steht da, kein zweites Mal erstellen
  await page.goto('/firmenabrechnung');
  await expect.poll(() => body(page)).toContain(`Rechnung ${inv.number}`);
  expect(await body(page)).not.toContain('Rechnung erstellen');
  await tap(page, btn(page, /Als bezahlt markieren/));
  await expect.poll(async () => (await readDb(page)).firmInvoices[0].paid).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Rechnung löschen: Buchungen weg, Kosten wieder offen
  await tap(page, btn(page, /Rechnung löschen/));
  await expect.poll(async () => (await readDb(page)).firmInvoices.length).toBe(0);
  const after = await readDb(page);
  expect(after.expenses.filter((e: any) => e.invoiceId)).toHaveLength(0);
  expect(after.firmCosts[0].billedIn).toBeUndefined();
});

test('Standard-Gebühr in den Unternehmensdaten und je Haus änderbar', async ({ page }) => {
  await seedDb(page, data());
  await page.evaluate((c) => localStorage.setItem('immo-settings-v1', JSON.stringify(c)), company);
  await page.reload();
  await page.goto('/unternehmen');
  await expect.poll(() => body(page)).toContain('VERWALTUNGSVERGÜTUNG');
  await page.getByLabel('Gebühr je Einheit und Monat (netto)').fill('28,50');
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('immo-settings-v1')!))).mgmtFee).toBe(28.5);
  await page.goto('/firmenabrechnung');
  await expect.poll(() => body(page)).toMatch(/Rechnungsbetrag\s*67,83\s€/); // 2 × 28,50 = 57 netto + 19 % = 67,83
  // Haus-Gebühr dauerhaft speichern
  await page.getByLabel('Verwaltungsgebühr je Einheit (netto)').fill('20');
  await tap(page, btn(page, /Gebühr für dieses Haus dauerhaft speichern/));
  await expect.poll(async () => (await readDb(page)).properties[0].mgmtFee).toBe(20);
});

test('Kontoauszug des Hauskontos: Zahlung an die Firma markiert die Rechnung als bezahlt', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const d = data();
  d.firmInvoices = [
    { id: 'i1', propertyId: 'p1', month: '2026-11', number: 'R-202611-H01', date: '2026-11-30', lines: [], net: 160, vatSum: 30.4, gross: 190.4 },
    { id: 'i2', propertyId: 'p1', month: '2026-10', number: 'R-202610-H01', date: '2026-10-31', lines: [], net: 100, vatSum: 19, gross: 119 },
  ];
  await seedDb(page, d);
  await page.goto('/kontoauszug');
  const csv = 'Buchungstag;Betrag;Name;Verwendungszweck\n03.12.2026;-190,40;Mustermann Verwaltung;Rechnung R-202611-H01\n04.12.2026;-100,00;Mustermann Verwaltung;Rechnung R-202610-H01';
  await page.getByLabel('CSV-Inhalt').fill(csv);
  await tap(page, btn(page, /^Einlesen/));
  await expect.poll(() => body(page)).toContain('BEZAHLTE RECHNUNGEN DER FIRMA');
  // zweite Rechnung: Betrag weicht ab (100 statt 119) → nicht vorgewählt
  expect(await body(page)).toContain('Betrag weicht ab');
  await tap(page, btn(page, /1 Rechnung als bezahlt markieren/));
  await expect.poll(async () => (await readDb(page)).firmInvoices.find((i: any) => i.id === 'i1').paid).toBe('2026-12-03');
  expect((await readDb(page)).firmInvoices.find((i: any) => i.id === 'i2').paid).toBeUndefined();
});
