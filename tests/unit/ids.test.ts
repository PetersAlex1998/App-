import { describe, expect, it } from 'vitest';
import { defaultUnitName, houseId, nextHouseNo, nextUnitNo, normalizeIds, numberFromName, unitRef } from '../../src/ids';
import { dbWith, property, unit } from '../helpers/builders';

describe('Kennungen', () => {
  it('Haus-ID und Wohnungs-ID', () => {
    expect(houseId({ houseNo: 3 })).toBe('H03');
    expect(houseId({ houseNo: 12 })).toBe('H12');
    expect(houseId({})).toBe('');
    expect(unitRef({ houseNo: 3 }, { kind: 'wohnung', no: 12 })).toBe('H03-W12');
    expect(unitRef({ houseNo: 3 }, { kind: 'gewerbe', no: 2 })).toBe('H03-G02');
    expect(unitRef({ houseNo: 3 }, { kind: 'eigentum', no: 1 })).toBe('H03-W01'); // Eigentumswohnung zählt als Wohnung
    expect(unitRef({ houseNo: 3 }, { no: 1 })).toBe('H03-W01');
    expect(unitRef({}, { no: 1 })).toBe('');
  });
  it('Standardnamen', () => {
    expect(defaultUnitName('wohnung', 4)).toBe('Wohnung 4');
    expect(defaultUnitName('gewerbe', 1)).toBe('Gewerbe 1');
    expect(defaultUnitName(undefined, 2)).toBe('Wohnung 2');
  });
  it('Nummer aus dem Namen', () => {
    expect(numberFromName('Wohnung 12')).toBe(12);
    expect(numberFromName('WE 3, 1. OG')).toBe(3);
    expect(numberFromName('Gewerbe 04')).toBe(4);
    expect(numberFromName('Dachstudio')).toBeUndefined();
    expect(numberFromName('7')).toBe(7);
  });
});

describe('normalizeIds', () => {
  const messy = () => {
    const a = property({ id: 'a' }), b = property({ id: 'b', houseNo: 2 }), c = property({ id: 'c', houseNo: 2 }); // c ist eine Doppelung
    return dbWith({
      properties: [a, b, c],
      units: [
        unit('a', { id: '1', name: 'Wohnung 1' }), unit('a', { id: '2', name: 'Wohnung 2' }), unit('a', { id: '3', name: 'WE 7, 1. OG' }), unit('a', { id: '4', name: 'Dachstudio' }),
        unit('a', { id: '5', name: 'Gewerbe 1', kind: 'gewerbe' }), unit('a', { id: '6', name: 'Wohnung 2' }), // 6 ist Doppelung
        unit('b', { id: '7', name: 'Laden', kind: 'gewerbe', no: 5 }), unit('b', { id: '8', name: 'x', no: 5 }),
      ],
    });
  };
  const refs = (d: ReturnType<typeof messy>) => d.units.map((u) => unitRef(d.properties.find((p) => p.id === u.propertyId), u));

  it('füllt Haus-Nummern von unten auf und löst Doppelungen', () => {
    const n = normalizeIds(messy());
    expect(n.properties.map((p) => houseId(p))).toEqual(['H01', 'H02', 'H03']);
  });
  it('vergibt eindeutige Wohnungs-IDs', () => {
    const r = refs(normalizeIds(messy()));
    expect(new Set(r).size).toBe(r.length);
    expect(r).toContain('H01-W01'); expect(r).toContain('H01-W02'); expect(r).toContain('H01-W07'); expect(r).toContain('H01-G01');
  });
  it('Nummer aus dem Namen wird übernommen, sonst nächste freie', () => {
    const n = normalizeIds(messy());
    expect(n.units.find((u) => u.id === '3')!.no).toBe(7);
    expect(n.units.find((u) => u.id === '4')!.no).toBeGreaterThan(0);
  });
  it('ist idempotent (gleiches Objekt, wenn nichts zu tun ist)', () => {
    const n = normalizeIds(messy());
    expect(normalizeIds(n)).toBe(n);
  });
  it('gleiche Nummer in verschiedenen Häusern oder Arten ist erlaubt', () => {
    const d = normalizeIds(dbWith({ properties: [property({ id: 'a', houseNo: 1 }), property({ id: 'b', houseNo: 2 })], units: [unit('a', { no: 3 }), unit('b', { no: 3 }), unit('a', { no: 3, kind: 'gewerbe' })] }));
    expect(refs(d as never)).toEqual(['H01-W03', 'H02-W03', 'H01-G03']);
  });
  it('nächste freie Nummern', () => {
    const d = normalizeIds(messy());
    expect(nextHouseNo(d)).toBe(4);
    expect(nextUnitNo(d, 'a', 'wohnung')).toBe(10);
    expect(nextUnitNo(d, 'a', 'gewerbe')).toBe(2);
    expect(nextUnitNo(d, 'zzz')).toBe(1);
  });
});
