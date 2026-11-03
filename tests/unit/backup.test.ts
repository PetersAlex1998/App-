import { describe, expect, it } from 'vitest';
import { EncryptedBackupError, isEncryptedBackup, parseBackup, parseBackupAny, serialize } from '../../src/backup';
import { decryptText, encryptText, hashPin } from '../../src/crypto';
import { defaultSettings } from '../../src/settingsDefaults';
import { simple } from '../helpers/builders';

describe('Sicherung', () => {
  it('Rundlauf: serialize → parseBackup liefert dieselben Daten samt Einstellungen', () => {
    const { db } = simple();
    const r = parseBackup(serialize(db, defaultSettings));
    expect(r.db.properties).toEqual(db.properties);
    expect(r.db.tenants).toEqual(db.tenants);
    expect(r.settings?.fee2).toBe(defaultSettings.fee2);
  });
  it('liest auch eine nackte DB ohne Hülle (alte Sicherungen)', () => {
    const { db } = simple();
    expect(parseBackup(JSON.stringify(db)).db.units).toHaveLength(1);
  });
  it('fehlende Listen werden ergänzt', () => {
    const r = parseBackup(JSON.stringify({ app: 'immo-verwaltung', data: { properties: [{ id: 'p1' }] } }));
    expect(r.db.payments).toEqual([]);
  });
  it('Fehler: kein JSON, leer, beschädigter Abschnitt', () => {
    expect(() => parseBackup('kein json')).toThrow(/kein lesbares JSON/);
    expect(() => parseBackup(JSON.stringify({ app: 'immo-verwaltung', data: {} }))).toThrow(/leer/);
    expect(() => parseBackup(JSON.stringify({ app: 'immo-verwaltung', data: { tenants: 'x' } }))).toThrow(/beschädigt/);
  });
});

describe('Verschlüsselte Sicherung', () => {
  it('Verschlüsseln und Entschlüsseln ergibt den Klartext; falsches Passwort scheitert', async () => {
    const c = await encryptText('Geheim äöü €', 'passwort123');
    expect(c.data).not.toContain('Geheim');
    expect(await decryptText(c, 'passwort123')).toBe('Geheim äöü €');
    await expect(decryptText(c, 'falsch-falsch')).rejects.toThrow(/falsch/);
  });
  it('zwei Verschlüsselungen desselben Textes unterscheiden sich (Salz/IV)', async () => {
    const a = await encryptText('x', 'passwort123');
    const b = await encryptText('x', 'passwort123');
    expect(a.data).not.toBe(b.data);
    expect(a.salt).not.toBe(b.salt);
  });
  it('manipulierte Daten werden erkannt', async () => {
    const c = await encryptText('abc', 'passwort123');
    const bad = { ...c, data: c.data.slice(0, -4) + 'AAAA' };
    await expect(decryptText(bad, 'passwort123')).rejects.toThrow();
  });
  it('parseBackupAny: ohne Passwort → EncryptedBackupError, mit Passwort → Daten', async () => {
    const { db } = simple();
    const file = JSON.stringify({ app: 'immo-verwaltung', version: 4, encrypted: true, cipher: await encryptText(serialize(db, defaultSettings), 'passwort123') });
    expect(isEncryptedBackup(file)).toBe(true);
    await expect(parseBackupAny(file)).rejects.toBeInstanceOf(EncryptedBackupError);
    await expect(parseBackupAny(file, 'falsch-falsch')).rejects.toThrow();
    const r = await parseBackupAny(file, 'passwort123');
    expect(r.db.tenants).toHaveLength(1);
  });
  it('isEncryptedBackup erkennt Klartext und Müll nicht', () => {
    expect(isEncryptedBackup(serialize(simple().db))).toBe(false);
    expect(isEncryptedBackup('{{')).toBe(false);
  });
});

describe('PIN-Hash', () => {
  it('gleiche PIN + gleiches Salz = gleicher Hash, andere PIN = anderer Hash', async () => {
    const a = await hashPin('1234');
    expect((await hashPin('1234', a.salt)).hash).toBe(a.hash);
    expect((await hashPin('1235', a.salt)).hash).not.toBe(a.hash);
  });
});
