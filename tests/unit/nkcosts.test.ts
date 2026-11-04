import { describe, expect, it } from 'vitest';
import { applySuggestions, guessDistribution, kostenart, suggestCosts } from '../../src/nkCosts';
import { advanceProposal, effectiveFrom } from '../../src/advance';
import { advanceModel } from '../../src/letters';
import { defaultSettings } from '../../src/settingsDefaults';
import { Expense } from '../../src/types';
import { calculate } from '../../src/calculator';
import { dbWith, property, simple, tenant, unit } from '../helpers/builders';

const ex = (propertyId: string, o: Partial<Expense> = {}): Expense => ({ id: 'e' + Math.random(), propertyId, date: '2025-05-10', amount: 100, category: 'betriebskosten', vendor: '', description: '', allocatable: true, ...o });

describe('Betriebskosten aus Ausgaben', () => {
  it('nur umlagefähige Ausgaben des Hauses und Jahres, gruppiert nach Kostenart', () => {
    const { p, db } = simple({ moveIn: '2020-01-01' });
    const other = property({ houseNo: 2 });
    const full = { ...db, expenses: [
      ex(p.id, { amount: 60, description: 'Müllabfuhr Q1 2025' }), ex(p.id, { amount: 60, description: 'Müllabfuhr Q2' }), ex(p.id, { amount: 200, category: 'versicherung' }),
      ex(p.id, { amount: 999, allocatable: false }), ex(p.id, { amount: 50, date: '2024-12-31', description: 'Müllabfuhr' }), ex(other.id, { amount: 77, description: 'Müllabfuhr' }),
    ] };
    const s = suggestCosts(full, p.id, 2025);
    expect(s.map((x) => [x.category, x.amount])).toEqual([['Gebäudeversicherung', 200], ['Müllabfuhr', 120]]);
    expect(s[1].expenseIds).toHaveLength(2);
  });
  it('Kostenart und Verteilung nach Stichworten', () => {
    expect(kostenart(ex('p', { description: 'Wasser/Abwasser 2025' }))).toBe('Wasser/Abwasser');
    expect(kostenart(ex('p', { category: 'hausmeister' }))).toBe('Hausmeister und Reinigung');
    expect(guessDistribution('Wasser/Abwasser')).toMatchObject({ key: 'consumption', meterType: 'wasser_kalt', consumptionShare: 100 });
    expect(guessDistribution('Heizkosten Gas')).toMatchObject({ key: 'consumption', meterType: 'heizung', consumptionShare: 70 });
    expect(guessDistribution('Grundsteuer')).toEqual({ key: 'area' });
  });
  it('warnt bei Arten, die in der Regel nicht umlagefähig sind', () => {
    const { p, db } = simple();
    const s = suggestCosts({ ...db, expenses: [ex(p.id, { category: 'instandhaltung', amount: 500 })] }, p.id, 2025);
    expect(s[0].warning).toContain('nicht umlagefähig');
  });
  it('Übernehmen legt Positionen an, erneut Übernehmen aktualisiert statt zu verdoppeln', () => {
    const { p, db } = simple({ moveIn: '2020-01-01' });
    const e = ex(p.id, { amount: 120, description: 'Müllabfuhr' });
    let d = { ...db, expenses: [e] };
    let s = suggestCosts(d, p.id, 2025);
    d = applySuggestions(d, p.id, 2025, s.map((x) => ({ s: x, key: x.key })));
    expect(d.costs).toHaveLength(1);
    expect(d.costs[0]).toMatchObject({ category: 'Müllabfuhr', amount: 120, year: 2025, key: 'area', fromExpenses: true });
    // neue Ausgabe kommt dazu, Verteilung wurde inzwischen geändert und bleibt erhalten
    d = { ...d, costs: d.costs.map((c) => ({ ...c, key: 'units' as const })), expenses: [...d.expenses, ex(p.id, { amount: 30, description: 'Müllabfuhr Q3' })] };
    s = suggestCosts(d, p.id, 2025);
    expect(s[0].existing).toBeTruthy();
    d = applySuggestions(d, p.id, 2025, s.map((x) => ({ s: x, key: x.key })));
    expect(d.costs).toHaveLength(1);
    expect(d.costs[0]).toMatchObject({ amount: 150, key: 'units' });
  });
  it('manuell erfasste Position wird nur bewusst ersetzt', () => {
    const { p, db } = simple({ moveIn: '2020-01-01' });
    const d = { ...db, expenses: [ex(p.id, { amount: 120, description: 'Müllabfuhr' })], costs: [{ id: 'c1', propertyId: p.id, year: 2025, category: 'Müllabfuhr', amount: 100, key: 'units' as const }] };
    const s = suggestCosts(d, p.id, 2025);
    expect(s[0].existing?.id).toBe('c1');
    const out = applySuggestions(d, p.id, 2025, [{ s: s[0], key: 'area' }]);
    expect(out.costs).toHaveLength(1);
    expect(out.costs[0]).toMatchObject({ amount: 120, key: 'area', fromExpenses: true });
  });
  it('ergibt eine Nebenkostenabrechnung ohne weiteres Zutun', async () => {
    const { nkStatement } = await import('../../src/calc');
    const { p, u, t, db } = simple({ moveIn: '2020-01-01' }, { advance: 100 });
    let d = { ...db, expenses: [ex(p.id, { amount: 1500, description: 'Müllabfuhr' })] };
    d = applySuggestions(d, p.id, 2025, suggestCosts(d, p.id, 2025).map((x) => ({ s: x, key: x.key })));
    const r = nkStatement(d, t, u, 2025);
    expect(r.costs).toBe(1500); // einzige Einheit trägt alles
    expect(r.advances).toBe(1200);
    expect(r.balance).toBe(300);
  });
  void calculate; void tenant; void unit; void dbWith;
});

describe('Anpassung der Vorauszahlung', () => {
  it('Vorschlag aus den tatsächlichen Kosten pro Monat, mit Puffer, auf 5 € aufgerundet', async () => {
    const { p, u, t, db } = simple({ moveIn: '2020-01-01' }, { advance: 100 });
    const d = { ...db, costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müll', amount: 1500, key: 'area' as const }] };
    const a = advanceProposal(d, t, u, 2025)!;
    expect(a).toMatchObject({ months: 12, costPerMonth: 125, current: 100, proposed: 135, diff: 35, change: true }); // 125 × 1,05 = 131,25 → 135
  });
  it('kaum Änderung oder keine Kosten: keine Anpassung', () => {
    const { p, u, t, db } = simple({ moveIn: '2020-01-01' }, { advance: 135 });
    const d = { ...db, costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müll', amount: 1500, key: 'area' as const }] };
    expect(advanceProposal(d, t, u, 2025)!.change).toBe(false); // Vorschlag 135 = bisher 135
    expect(advanceProposal(db, t, u, 2025)).toBeNull();
  });
  it('Teiljahr: Kosten pro Mietmonat', () => {
    const { p, u, t, db } = simple({ moveIn: '2025-07-01' }, { advance: 100 });
    const d = { ...db, costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müll', amount: 1200, key: 'area' as const }] };
    const a = advanceProposal(d, t, u, 2025)!;
    expect(a.months).toBe(6);
    expect(a.costPerMonth).toBe(100); // 600 € für 6 Monate
    expect(a.proposed).toBe(105);
  });
  it('Gewerbe mit USt: Vorschlag ohne USt, damit Soll stimmt', () => {
    const { p, u, t, db } = simple({ moveIn: '2020-01-01' }, { kind: 'gewerbe', vat: 19, advance: 100 });
    const d = { ...db, costs: [{ id: 'c', propertyId: p.id, year: 2025, category: 'Müll', amount: 1200, key: 'area' as const }] };
    expect(advanceProposal(d, t, u, 2025)!.costPerMonth).toBe(100); // netto
  });
  it('Wirksam ab dem übernächsten Monatsersten', () => {
    expect(effectiveFrom('2026-11-15')).toBe('2027-01-01');
    expect(effectiveFrom('2026-12-31')).toBe('2027-02-01');
  });
  it('Brief nennt alte und neue Vorauszahlung, Datum und neue Gesamtmiete', () => {
    const { p, u, t } = simple({ salutation: 'Frau' });
    const m = advanceModel(t, u, p, 2025, 100, 135, '2027-01-01', { ...defaultSettings, name: 'Muster' }, '2026-11-15');
    const kv = m.blocks.find((b) => b.t === 'kv') as { rows: [string, string][] };
    expect(Object.fromEntries(kv.rows)).toMatchObject({ 'Gültig ab': '01.01.2027', Erhöhung: expect.stringContaining('35,00') });
    expect(m.title).toContain('Anpassung der Nebenkostenvorauszahlung');
  });
});
