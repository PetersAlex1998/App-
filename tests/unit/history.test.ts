import { describe, expect, it } from 'vitest';
import { durationText, monthsBetween, tenancyTimeline } from '../../src/history';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-03';
const p = property({ houseNo: 1 });
const u = unit(p.id);
const t = (name: string, moveIn: string, moveOut = '') => tenant(u.id, { name, moveIn, moveOut });

describe('Mieterhistorie: Zeitstrahl', () => {
  it('Monate und Dauer', () => {
    expect(monthsBetween('2020-01-01', '2020-12-31')).toBe(12);
    expect(monthsBetween('2020-01-01', '2020-01-31')).toBe(1);
    expect(monthsBetween('2019-03-15', '2022-03-14')).toBe(36);
    expect(durationText(51)).toBe('4 Jahre 3 Monate');
    expect(durationText(12)).toBe('1 Jahr');
    expect(durationText(1)).toBe('1 Monat');
    expect(durationText(7)).toBe('7 Monate');
  });
  it('alle Mieter, neuester zuerst, aktueller markiert', () => {
    const a = t('A', '2015-01-01', '2017-12-31'), b = t('B', '2018-01-01', '2021-06-30'), c = t('C', '2021-07-01');
    const tl = tenancyTimeline(dbWith({ properties: [p], units: [u], tenants: [b, c, a] }), u.id, NOW);
    expect(tl.map((e) => e.kind === 'tenant' ? e.tenant.name : 'Leerstand')).toEqual(['C', 'B', 'A']);
    expect(tl[0]).toMatchObject({ kind: 'tenant', current: true, months: 64 }); // 07/2021 bis 11/2026
    expect(tl[1]).toMatchObject({ current: false, months: 42 });
  });
  it('Leerstand zwischen zwei Mietern und nach dem letzten Auszug', () => {
    const a = t('A', '2015-01-01', '2017-12-31'), b = t('B', '2018-05-01', '2020-04-30');
    const tl = tenancyTimeline(dbWith({ properties: [p], units: [u], tenants: [a, b] }), u.id, NOW);
    expect(tl.map((e) => e.kind)).toEqual(['vacancy', 'tenant', 'vacancy', 'tenant']);
    expect(tl[0]).toMatchObject({ from: '2020-05-01', to: NOW });
    expect(tl[2]).toMatchObject({ from: '2018-01-01', to: '2018-04-30', months: 4 });
  });
  it('keine Lücke bei nahtlosem Wechsel; unbekannter Einzug bleibt ohne Dauer', () => {
    const a = t('A', '', '2019-12-31'), b = t('B', '2020-01-01');
    const tl = tenancyTimeline(dbWith({ properties: [p], units: [u], tenants: [a, b] }), u.id, NOW);
    expect(tl.map((e) => e.kind)).toEqual(['tenant', 'tenant']);
    expect(tl[1]).toMatchObject({ kind: 'tenant', months: null });
  });
  it('Einheit ohne Mieter und fremde Mieter ergeben nichts', () => {
    const other = unit(p.id, { name: 'W2' });
    expect(tenancyTimeline(dbWith({ properties: [p], units: [u, other], tenants: [tenant(other.id)] }), u.id, NOW)).toEqual([]);
  });
});
