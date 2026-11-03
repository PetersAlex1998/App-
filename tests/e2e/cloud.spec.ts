import { expect, test } from '@playwright/test';
import { body, btn, readDb, seedDb, tap } from './helpers';

// Die Cloud wird durch einen Ersatz im Browser nachgebildet (kein echter Server nötig).
test('Cloud: anmelden, Bestand hochladen, Daten von anderem Gerät übernehmen', async ({ page }) => {
  const stored = new Map<string, any>();
  const pushed: any[] = [];
  // „Anderes Gerät“ hat schon eine Ausgabe in der Cloud
  stored.set('expenses:ext1', { kind: 'expenses', id: 'ext1', deleted: false, client_updated_at: '2026-05-01T10:00:00.000Z', updated_at: '2026-05-01T10:00:01.000Z',
    data: { id: 'ext1', propertyId: 'p1', date: '2026-05-01', amount: 42, category: 'sonstiges', vendor: 'Fremdgerät', description: '', updatedAt: '2026-05-01T10:00:00.000Z' } });
  await page.route('**/auth/v1/token?grant_type=password', (r) => r.fulfill({ json: { access_token: 'jwt', refresh_token: 'rt', expires_in: 3600, user: { id: 'u-1', email: 'alex@example.com' } } }));
  await page.route('**/rest/v1/immo_records**', async (r) => {
    const req = r.request();
    if (req.method() === 'POST') {
      for (const row of req.postDataJSON()) { pushed.push(row); stored.set(`${row.kind}:${row.id}`, { ...row, updated_at: new Date().toISOString() }); }
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [...stored.values()].filter((x) => !pushed.includes(x)).sort((a, b) => a.updated_at.localeCompare(b.updated_at)) });
  });
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));

  await seedDb(page);
  await page.goto('/cloud');
  await page.getByLabel('E-Mail').fill('alex@example.com');
  await page.getByLabel('Passwort').fill('geheim-1234');
  await tap(page, btn(page, /^Anmelden/));
  await expect.poll(() => body(page), { timeout: 15_000 }).toContain('Letzter Abgleich');

  // lokaler Bestand wurde hochgeladen
  expect(pushed.some((r) => r.kind === 'tenants' && r.id === 't1' && r.deleted === false)).toBe(true);
  expect(pushed.some((r) => r.kind === 'properties' && r.id === 'p1')).toBe(true);
  // Ausgabe vom anderen Gerät kam an
  await expect.poll(async () => (await readDb(page)).expenses?.some((e: any) => e.id === 'ext1')).toBe(true);

  // Änderung am Gerät geht automatisch hoch
  await page.goto('/objekt/formular?id=p1');
  await page.getByLabel('Bezeichnung').fill('Haus Neu');
  const before = pushed.length;
  await tap(page, btn(page, /Speichern/));
  await expect.poll(() => pushed.slice(before).some((r) => r.kind === 'properties' && r.data?.name === 'Haus Neu'), { timeout: 15_000 }).toBe(true);

  // Löschen erzeugt Grabstein
  await page.goto('/zahlung/formular?tenantId=t1');
  await page.goto('/person/formular?id=t2');
  page.on('dialog', (d) => d.accept());
  await tap(page, btn(page, /^Löschen/));
  await expect.poll(() => pushed.some((r) => r.kind === 'tenants' && r.id === 't2' && r.deleted === true), { timeout: 15_000 }).toBe(true);
});
