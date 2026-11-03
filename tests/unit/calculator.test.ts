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

import { equityScenarios, leverage, minEquityPct } from '../../src/calculator';

describe('Immokalkulator: Eigenkapital durchspielen', () => {
  it('Szenarien: mehr Eigenkapital senkt Rate und hebt den Cashflow', () => {
    const rows = equityScenarios(base());
    expect(rows.map((r) => r.pct)).toEqual([0, 10, 20, 30, 40, 50, 100]);
    for (let k = 1; k < rows.length; k++) {
      expect(rows[k].debtMonth).toBeLessThanOrEqual(rows[k - 1].debtMonth);
      expect(rows[k].cashflowMonth).toBeGreaterThanOrEqual(rows[k - 1].cashflowMonth);
      expect(rows[k].equity).toBeGreaterThan(rows[k - 1].equity);
    }
    const r20 = rows.find((r) => r.pct === 20)!;
    expect(r20).toMatchObject({ equity: 67_242, loan: 268_968, cashflowMonth: -338.01 });
    expect(rows[0].equityReturn).toBeNull(); // ohne Eigenkapital keine Eigenkapitalrendite
    const full = rows[rows.length - 1];
    expect(full.loan).toBe(0);
    expect(full.debtMonth).toBe(0);
  });
  it('Höchstpreis wächst mit dem Eigenkapital (Cashflow-Kriterium)', () => {
    const rows = equityScenarios(base({ targetNetYield: null, maxFactor: null, minCashflow: 0 }));
    for (let k = 1; k < rows.length - 1; k++) expect(rows[k].maxPrice!).toBeGreaterThanOrEqual(rows[k - 1].maxPrice!);
  });
  it('Mindest-Eigenkapital für Cashflow ≥ 0 trifft den Cashflow genau', () => {
    const inp = base();
    const m = minEquityPct(inp, 0);
    expect(m.pct).not.toBeNull();
    const at = calculate({ ...inp, equityPct: m.pct! });
    expect(at.cashflowMonth).toBeGreaterThanOrEqual(-0.5);
    expect(calculate({ ...inp, equityPct: Math.max(0, m.pct! - 1) }).cashflowMonth).toBeLessThan(0);
    expect(m.amount).toBeCloseTo(at.equity, 0);
  });
  it('Mindest-Eigenkapital: schon ohne Eigenkapital im Plus → 0 %; unerreichbar → null', () => {
    expect(minEquityPct(base({ rentMonth: 3000 }), 0).pct).toBe(0);
    expect(minEquityPct(base({ rentMonth: 100 }), 0)).toEqual({ pct: null, amount: null });
    expect(minEquityPct(base({ interest: 0, amortization: 0 }), 0).pct).toBe(0);
  });
  it('Hebel positiv, wenn Netto-Rendite über dem Zins liegt', () => {
    expect(leverage(base({ price: 150_000 })).positive).toBe(true);
    expect(leverage(base({ price: 400_000 })).positive).toBe(false);
  });
});
