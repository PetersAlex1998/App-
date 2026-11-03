import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage, { __mem } from '../stubs/async-storage';
import { DataError, KEY_DEFEKT, SCHEMA_VERSION, hydrate, localRepository } from '../../src/repo';
import { simple } from '../helpers/builders';

beforeEach(() => __mem.clear());

describe('hydrate', () => {
  it('ergänzt fehlende Listen und entfernt _schema', () => {
    const d = hydrate({ _schema: 1, properties: [{ id: 'p' }] });
    expect(d.properties).toHaveLength(1);
    expect(d.payments).toEqual([]);
    expect((d as any)._schema).toBeUndefined();
  });
  it('ersetzt Nicht-Listen durch leere Listen', () => {
    expect(hydrate({ tenants: 'kaputt' }).tenants).toEqual([]);
  });
  it('wirft bei neuerem Datenformat', () => {
    try { hydrate({ _schema: SCHEMA_VERSION + 1 }); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(DataError); expect((e as DataError).kind).toBe('newer'); }
  });
});

describe('localRepository', () => {
  it('leer → null', async () => { expect(await localRepository.load()).toBeNull(); });
  it('Speichern und Laden ergibt dieselben Daten', async () => {
    const { db } = simple();
    await localRepository.save(db);
    const back = await localRepository.load();
    expect(back).toEqual(db);
    expect(JSON.parse(__mem.get('immo-db-v1')!)._schema).toBe(SCHEMA_VERSION);
  });
  it('unlesbare Daten: Fehler „corrupt“, Original bleibt, Kopie wird gesichert', async () => {
    await AsyncStorage.setItem('immo-db-v1', '{kaputt');
    await expect(localRepository.load()).rejects.toMatchObject({ kind: 'corrupt' });
    expect(__mem.get('immo-db-v1')).toBe('{kaputt');
    expect(__mem.get(KEY_DEFEKT)).toBe('{kaputt');
  });
  it('ein JSON-Array ist kein gültiger Datenstand', async () => {
    await AsyncStorage.setItem('immo-db-v1', '[]');
    await expect(localRepository.load()).rejects.toMatchObject({ kind: 'corrupt' });
  });
  it('neuere Version wird nicht überschrieben', async () => {
    await AsyncStorage.setItem('immo-db-v1', JSON.stringify({ _schema: 99 }));
    await expect(localRepository.load()).rejects.toMatchObject({ kind: 'newer' });
  });
});
