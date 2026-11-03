import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT, CalcInput, calculate, maxPrice, stress, verdict, GRUNDERWERBSTEUER } from '../../src/calculator';

const base = (o: Partial<CalcInput> = {}): CalcInput => ({ ...DEFAULT_INPUT, price: 300_000, area: 80, units: 1, rentMonth: 1_100, ...o });

describe('Immokalkulator: Kennzahlen', () => {
  it('Kaufnebenkosten, Gesamtinvestition, Faktor und Rendite', () => {
    const r = calculate(base({ renovation: 10_000 }));
    expect(r.purchaseCostsPct).toBe(12.07); // 6,5 + 2 + 3,57
    expect(r.purchaseCosts).toBe(36_210);
    expect(r.totalInvestment).toBe(346_210);
    expect(r.rentYear).toBe(13_200);
    expect(r.grossYield).toBe(4.4);
    expect(r.factor).toBe(22.73);
    expect(r.pricePerSqm).toBe(3_750);
    expect(r.rentPerSqm).toBe(13.75);
  });
  it('Reinertrag: Leerstand, Verwaltung und Instandhaltung', () => {
    const r = calculate(base());
    expect(r.effectiveRent).toBe(12_804); // 13.200 × 0,97
    expect(r.costsYear).toBe(1_260); // 300 + 12 × 80
    expect(r.noi).toBe(11_544);
    expect(r.netYield).toBe(r.noi > 0 ? Math.round((11_544 / r.totalInvestment) * 10000) / 100 : 0);
  });
  it('Finanzierung und Cashflow', () => {
    const r = calculate(base());
    expect(r.equity).toBe(67_242); // 20 % von 336.210
    expect(r.loan).toBe(268_968);
    expect(r.debtServiceYear).toBe(15_600.14); // 5,8 %
    expect(r.cashflowYear).toBe(-4_056.14);
    expect(r.cashflowMonth).toBe(-338.01);
    expect(r.dscr).toBe(0.74);
  });
  it('Eigenkapital 0 und Zins 0 erzeugen keine Fehlwerte', () => {
    const r = calculate(base({ equityPct: 0, interest: 0, amortization: 0 }));
    expect(r.equityReturn).toBeNull();
    expect(r.dscr).toBeNull();
    expect(r.cashflowYear).toBe(r.noi);
  });
  it('ohne Miete oder Fläche: keine Renditen, keine Abstürze', () => {
    const r = calculate(base({ rentMonth: 0, area: 0 }));
    expect(r.grossYield).toBeNull();
    expect(r.factor).toBeNull();
    expect(r.pricePerSqm).toBeNull();
    expect(Number.isFinite(r.cashflowMonth)).toBe(true);
  });
  it('Steuer: Verlust durch AfA und Zinsen wird erstattet (negativ)', () => {
    const r = calculate(base());
    expect(r.taxYear).toBeLessThan(0);
    expect(r.cashflowAfterTaxMonth).toBeGreaterThan(r.cashflowMonth);
  });
  it('Grunderwerbsteuer: alle 16 Länder, NRW 6,5 %', () => {
    expect(Object.keys(GRUNDERWERBSTEUER)).toHaveLength(16);
    expect(GRUNDERWERBSTEUER['Nordrhein-Westfalen']).toBe(6.5);
  });
});

describe('Immokalkulator: Maximalpreis', () => {
  it('bei genau dem Maximalpreis wird jedes aktive Ziel erreicht, das begrenzende genau', () => {
    const inp = base();
    const m = maxPrice(inp);
    expect(m.max).not.toBeNull();
    const at = calculate({ ...inp, price: m.max! });
    if (m.binding === 'rendite') expect(at.netYield!).toBeCloseTo(4.5, 1);
    if (m.binding === 'cashflow') expect(at.cashflowMonth).toBeCloseTo(0, 0);
    if (m.binding === 'faktor') expect(at.factor!).toBeCloseTo(20, 1);
    expect(at.netYield!).toBeGreaterThanOrEqual(4.49);
    expect(at.cashflowMonth).toBeGreaterThanOrEqual(-1);
    expect(at.factor!).toBeLessThanOrEqual(20.01);
  });
  it('Kriterien einzeln gerechnet', () => {
    const inp = base({ targetNetYield: 5, minCashflow: null, maxFactor: null });
    const m = maxPrice(inp);
    expect(m.binding).toBe('rendite');
    // 11.544 / 5 % = 230.880 Gesamtinvestition → /1,1207 = 205.99
    expect(m.max).toBeCloseTo(206_000, -3);
    expect(m.recommended).toBe(206_000);
    const f = maxPrice(base({ targetNetYield: null, minCashflow: null, maxFactor: 18 }));
    expect(f).toMatchObject({ binding: 'faktor', max: 237_600, recommended: 237_000 });
  });
  it('Cashflow-Kriterium berücksichtigt Mindest-Cashflow und Sanierung', () => {
    const a = maxPrice(base({ targetNetYield: null, maxFactor: null, minCashflow: 0 }));
    const b = maxPrice(base({ targetNetYield: null, maxFactor: null, minCashflow: 100 }));
    const c = maxPrice(base({ targetNetYield: null, maxFactor: null, minCashflow: 0, renovation: 20_000 }));
    expect(b.max!).toBeLessThan(a.max!);
    expect(c.max!).toBeLessThan(a.max!);
    expect(calculate({ ...base({ minCashflow: 100 }), price: b.max! }).cashflowMonth).toBeCloseTo(100, 0);
  });
  it('unerreichbar (Reinertrag ≤ 0) ergibt 0, kein Kriterium aktiv ergibt null', () => {
    expect(maxPrice(base({ rentMonth: 100 })).max).toBe(0);
    const none = maxPrice(base({ targetNetYield: null, minCashflow: null, maxFactor: null }));
    expect(none).toMatchObject({ max: null, binding: null, recommended: null });
  });
  it('ohne Fremdkapital begrenzt der Cashflow nicht', () => {
    const m = maxPrice(base({ equityPct: 100, targetNetYield: null, maxFactor: null }));
    expect(m.byCriterion.cashflow).toBe(Infinity);
    expect(m.max).toBeNull();
  });
});

describe('Immokalkulator: Ampel und Stresstest', () => {
  it('Ampel', () => {
    expect(verdict(200_000, 205_000)).toMatchObject({ verdict: 'gut', delta: -5_000 });
    expect(verdict(210_000, 205_000)).toMatchObject({ verdict: 'verhandeln', delta: 5_000 });
    expect(verdict(260_000, 205_000)).toMatchObject({ verdict: 'zu_teuer', delta: 55_000 });
    expect(verdict(260_000, 205_000).discountPct).toBeCloseTo(21.15, 1);
    expect(verdict(0, 205_000).verdict).toBe('offen');
    expect(verdict(300_000, null).verdict).toBe('offen');
  });
  it('Stresstest verschlechtert den Cashflow', () => {
    const i = base();
    const s = stress(i);
    expect(s.interestPlus1).toBeLessThan(calculate(i).cashflowMonth);
    expect(s.rentMinus10).toBeLessThan(calculate(i).cashflowMonth);
  });
});
