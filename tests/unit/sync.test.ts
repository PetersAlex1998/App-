import { describe, expect, it } from 'vitest';
import { Changes, PushRow, Remote, RemoteRow, SETTINGS_ID, SETTINGS_KIND, SyncState, applyToDb, flatten, freshState, runSync } from '../../src/sync';
import { DB, emptyDB } from '../../src/types';
import { removeItem, upsertItem } from '../../src/dbops';
import { property, simple, unit } from '../helpers/builders';

/** Cloud im Speicher: verhält sich wie die Tabelle immo_records (Server-Zeitstempel je Schreibzugriff). */
class FakeCloud {
  rows = new Map<string, RemoteRow>();
  files = new Map<string, Blob>();
  clock = 0;
  pulls = 0;
  remote(): Remote {
    return {
      pull: async (since) => { this.pulls++; return [...this.rows.values()].filter((r) => r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)); },
      push: async (rows: PushRow[]) => { for (const r of rows) this.rows.set(`${r.kind}:${r.id}`, { ...r, updated_at: new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000).toISOString() }); },
      upload: async (id, b) => { this.files.set(id, b); },
      removeFile: async (id) => { this.files.delete(id); },
    };
  }
}

/** Ein Gerät mit eigenem Datenbestand und Abgleichsstand. */
class Device {
  db: DB = emptyDB;
  settings: { updatedAt?: string; [k: string]: any } = {};
  state: SyncState = freshState('u1');
  blobs = new Map<string, Blob>();
  constructor(public cloud: FakeCloud, public clockStart = '2026-02-01T10:00:00.000Z') {}
  private t = 0;
  stamp = () => new Date(Date.parse(this.clockStart) + ++this.t * 1000).toISOString();
  save(kind: any, item: any) { this.db = upsertItem(this.db, kind, item, this.stamp()); }
  remove(kind: any, id: string) { this.db = removeItem(this.db, kind, id).db; }
  sync(now?: string) {
    return runSync({
      remote: this.cloud.remote(),
      getLocal: () => ({ db: this.db, settings: this.settings }),
      apply: (ch: Changes) => {
        this.db = applyToDb(this.db, ch);
        const s = ch.puts.find((p) => p.kind === SETTINGS_KIND);
        if (s) this.settings = s.data;
      },
      loadState: async () => this.state,
      saveState: async (s) => { this.state = s; },
      blobs: { has: async (id) => this.blobs.has(id), get: async (id) => this.blobs.get(id) },
      now: now ? () => now : undefined,
    });
  }
}

describe('Abgleich Gerät ↔ Cloud', () => {
  it('Erster Abgleich lädt den lokalen Bestand hoch', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud);
    const { p, u, t } = simple();
    a.save('properties', p); a.save('units', u); a.save('tenants', t);
    const r = await a.sync();
    expect(r.pushed).toBe(4); // 3 Datensätze + Einstellungen
    expect([...cloud.rows.keys()].sort()).toEqual([`properties:${p.id}`, `tenants:${t.id}`, `units:${u.id}`, `${SETTINGS_KIND}:${SETTINGS_ID}`].sort());
  });

  it('Zweites Gerät erhält alles; erneuter Abgleich ändert nichts mehr', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud);
    const { p, u, t } = simple();
    a.save('properties', p); a.save('units', u); a.save('tenants', t);
    await a.sync();
    const r = await b.sync();
    expect(r.pulled).toBe(3); // Einstellungen: gleicher Stand (beide ohne Änderung)
    expect(b.db.tenants[0].name).toBe('Anna Schmidt');
    const again = await b.sync();
    expect(again).toMatchObject({ pulled: 0, pushed: 0, deleted: 0 });
    const aAgain = await a.sync();
    expect(aAgain).toMatchObject({ pushed: 0, deleted: 0 });
  });

  it('Änderungen gehen in beide Richtungen; der neuere Stand gewinnt', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, '2026-02-01T10:00:00.000Z'), b = new Device(cloud, '2026-02-01T12:00:00.000Z');
    const { p } = simple();
    a.save('properties', p);
    await a.sync(); await b.sync();
    a.save('properties', { ...a.db.properties[0], name: 'von A' }); // 10:00:01
    b.save('properties', { ...b.db.properties[0], name: 'von B' }); // 12:00:01 (neuer)
    await a.sync(); // A lädt hoch
    await b.sync(); // B ist neuer, behält und lädt hoch
    await a.sync();
    expect(a.db.properties[0].name).toBe('von B');
    expect(b.db.properties[0].name).toBe('von B');
  });

  it('Unterschiedliche Datensätze auf zwei Geräten werden zusammengeführt', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud);
    a.save('properties', property({ id: 'pa', name: 'A', houseNo: 1 }));
    b.save('properties', property({ id: 'pb', name: 'B', houseNo: 2 }));
    await a.sync(); await b.sync(); await a.sync();
    expect(a.db.properties.map((x) => x.id).sort()).toEqual(['pa', 'pb']);
    expect(b.db.properties.map((x) => x.id).sort()).toEqual(['pa', 'pb']);
  });

  it('Löschen wird übertragen (Grabstein) und nicht wiederhergestellt', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud);
    const p1 = property({ id: 'p1', houseNo: 1 }), p2 = property({ id: 'p2', houseNo: 2, name: 'Z' });
    a.save('properties', p1); a.save('properties', p2);
    await a.sync(); await b.sync();
    a.remove('properties', 'p1');
    const r = await a.sync();
    expect(r.deleted).toBe(1);
    expect(cloud.rows.get('properties:p1')).toMatchObject({ deleted: true, data: null });
    await b.sync();
    expect(b.db.properties.map((x) => x.id)).toEqual(['p2']);
    await a.sync();
    expect(a.db.properties.map((x) => x.id)).toEqual(['p2']);
  });

  it('Lokal gelöscht, aber anderswo bearbeitet: Löschen gewinnt, solange es nicht hochgeladen ist', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud, '2026-03-01T00:00:00.000Z');
    a.save('properties', property({ id: 'p1', houseNo: 1 }));
    await a.sync(); await b.sync();
    b.save('properties', { ...b.db.properties[0], name: 'bearbeitet' });
    await b.sync();
    a.remove('properties', 'p1'); // Löschung noch offline
    await a.sync();               // holt B's Änderung, darf Satz nicht wiederbeleben
    expect(a.db.properties).toEqual([]);
    expect(cloud.rows.get('properties:p1')!.deleted).toBe(true);
  });

  it('Lokale Änderung nach dem Grabstein einer anderen Seite bleibt erhalten', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud, '2026-06-01T00:00:00.000Z');
    a.save('properties', property({ id: 'p1', houseNo: 1 }));
    await a.sync(); await b.sync();
    a.remove('properties', 'p1');
    await a.sync('2026-02-02T00:00:00.000Z'); // Grabstein früh
    b.save('properties', { ...b.db.properties[0], name: 'später bearbeitet' }); // 2026-06
    await b.sync();
    expect(b.db.properties.map((x) => x.name)).toEqual(['später bearbeitet']);
    await a.sync();
    expect(a.db.properties.map((x) => x.name)).toEqual(['später bearbeitet']);
  });

  it('Einstellungen werden mit abgeglichen', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud);
    a.settings = { updatedAt: '2026-02-01T10:00:00.000Z', senderName: 'Alex Peters' };
    await a.sync(); await b.sync();
    expect(b.settings.senderName).toBe('Alex Peters');
    expect(cloud.rows.has(`${SETTINGS_KIND}:${SETTINGS_ID}`)).toBe(true);
  });

  it('Dateien von Dokumenten werden hochgeladen und beim Löschen entfernt', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud), b = new Device(cloud);
    const doc = { id: 'd1', ownerKind: 'property' as const, ownerId: 'p1', category: 'rechnung' as const, name: 'Beleg', mime: 'image/png', size: 3, added: '2026-01-01' };
    a.save('documents', doc);
    a.blobs.set('d1', new Blob(['abc']));
    const r = await a.sync();
    expect(r.files).toBe(1);
    expect(cloud.files.has('d1')).toBe(true);
    await a.sync();
    expect((await a.sync()).files).toBe(0); // nicht erneut
    await b.sync();
    expect(b.state.uploaded).toContain('d1'); // Datei liegt schon in der Cloud, kein erneuter Upload
    a.remove('documents', 'd1');
    await a.sync();
    expect(cloud.files.has('d1')).toBe(false);
  });

  it('Unbekannte Arten aus einer neueren App-Version werden ignoriert', async () => {
    const cloud = new FakeCloud();
    cloud.rows.set('zukunft:1', { kind: 'zukunft', id: '1', data: { id: '1' }, deleted: false, client_updated_at: '', updated_at: '2026-01-01T00:00:01.000Z' });
    const a = new Device(cloud);
    const r = await a.sync();
    expect(r.pulled).toBe(0);
    expect(a.db).toEqual(emptyDB);
  });

  it('Cloud nicht erreichbar: lokaler Stand und Abgleichsstand bleiben unverändert', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud);
    a.save('properties', property({ id: 'p1', houseNo: 1 }));
    cloud.remote = () => ({ pull: async () => { throw new Error('offline'); }, push: async () => {}, upload: async () => {}, removeFile: async () => {} });
    await expect(a.sync()).rejects.toThrow('offline');
    expect(a.state.synced).toEqual({});
    expect(a.db.properties).toHaveLength(1);
  });

  it('flatten/applyToDb: Rundlauf ohne Verlust', () => {
    const { p, u, t, db } = simple();
    const items = flatten(db, { updatedAt: 'x' });
    expect(items).toHaveLength(4);
    const rebuilt = applyToDb(emptyDB, { puts: items.filter((i) => i.kind !== SETTINGS_KIND), dels: [] });
    expect(rebuilt.units).toEqual([u]);
    expect(rebuilt.properties).toEqual([p]);
    expect(rebuilt.tenants).toEqual([t]);
  });
});
