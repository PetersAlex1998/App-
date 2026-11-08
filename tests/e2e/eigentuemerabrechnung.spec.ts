import { expect, test } from '@playwright/test';
import { body, btn, readDb, seed, seedDb, tap } from './helpers';

const y = new Date().getFullYear() - 1;
function data() {
  const d: any = seed();
  d.properties = [{ ...d.properties[0], owners: [{ name: 'Max Muster', share: 50, address: 'Weg 1, 33100 Paderborn' }, { name: 'Erika Muster', share: 30 }, { name: 'Paul Muster', share: 20 }] }];
  d.units = [{ id: 'u1', propertyId: 'p1', name: 'Wohnung 1', no: 1, area: 60, rooms: 2, coldRent: 1000, advance: 0 }];
  d.tenants = [{ id: 't1', unitId: 'u1', name: 'Anna', salutation: 'Frau', email: '', phone: '', moveIn: '2020-01-01', moveOut: '', deposit: 0, trackFrom: '2099-01' }];
  d.payments = Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, tenantId: 't1', date: `${y}-${String(i + 1).padStart(2, '0')}-03`, month: `${y}-${String(i + 1).padStart(2, '0')}`, amount: 1000, kind: 'miete', note: '' }));
  d.expenses = [{ id: 'e1', propertyId: 'p1', date: `${y}-06-01`, amount: 2000, category: 'instandhaltung', vendor: 'X', description: '' }];
  return d;
}

test('Eigentümerabrechnung: Überschuss nach Anteil, PDF je Eigentümer im Briefausgang', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await seedDb(page, data());
  await page.goto('/eigentuemer-abrechnung');
  await expect.poll(() => body(page)).toContain('HAUS LINDENSTRASSE');
  // 12 × 1.000 − 2.000 = 10.000 € Überschuss; 50 % / 30 % / 20 %
  await expect.poll(() => body(page)).toMatch(/Überschuss 10\.000,00\s€/);
  const t = await body(page);
  expect(t).toMatch(/Max Muster\s*Anteil 50 %\s*5\.000,00\s€/);
  expect(t).toMatch(/Erika Muster\s*Anteil 30 %\s*3\.000,00\s€/);
  expect(t).toMatch(/Paul Muster\s*Anteil 20 %\s*2\.000,00\s€/);
  expect(t).toContain(`JE PERSON ÜBER ALLE HÄUSER ${y}`);

  await tap(page, btn(page, /3 Abrechnungen als PDF/));
  await expect.poll(async () => (await readDb(page)).documents.filter((d: any) => d.note?.startsWith(`Eigentümerabrechnung ${y}`)).length, { timeout: 25_000 }).toBe(3);
  const docs = (await readDb(page)).documents;
  expect(docs.map((d: any) => d.note).sort()).toEqual([`Eigentümerabrechnung ${y} – Erika Muster`, `Eigentümerabrechnung ${y} – Max Muster`, `Eigentümerabrechnung ${y} – Paul Muster`]);
  expect(docs.every((d: any) => d.ownerKind === 'property' && d.category === 'brief' && d.status === 'bereit')).toBe(true);
  await expect.poll(() => body(page)).toContain('Briefausgang');
});

test('Eigentümerabrechnung: ohne Eigentümer Hinweis, keine PDFs', async ({ page }) => {
  const d = data();
  d.properties = [{ ...d.properties[0], owners: undefined }];
  await seedDb(page, d);
  await page.goto('/eigentuemer-abrechnung');
  await expect.poll(() => body(page)).toContain('Keine Eigentümer hinterlegt');
  expect(await page.getByRole('button', { name: /Abrechnung.* als PDF/ }).count()).toBe(0);
});
