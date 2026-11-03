/**
 * Immokalkulator: schnelle Wirtschaftlichkeitsrechnung für ein Kaufobjekt samt Empfehlung für den maximalen Kaufpreis.
 * Alle Funktionen sind reine Berechnungen. Die Steuerrechnung ist bewusst vereinfacht (Näherung, keine Steuerberatung).
 */

/** Grunderwerbsteuer je Bundesland in % (Stand 2025; ändert sich gelegentlich, deshalb im Formular überschreibbar). */
export const GRUNDERWERBSTEUER: Record<string, number> = {
  'Baden-Württemberg': 5, Bayern: 3.5, Berlin: 6, Brandenburg: 6.5, Bremen: 5, Hamburg: 5.5, Hessen: 6, 'Mecklenburg-Vorpommern': 6,
  Niedersachsen: 5, 'Nordrhein-Westfalen': 6.5, 'Rheinland-Pfalz': 5, Saarland: 6.5, Sachsen: 5.5, 'Sachsen-Anhalt': 5, 'Schleswig-Holstein': 6.5, Thüringen: 5,
};

export interface CalcInput {
  price: number; // Kaufpreis
  area: number; // m² (Wohn-/Nutzfläche)
  units: number; // Anzahl Einheiten (für Verwaltungskosten)
  rentMonth: number; // Kaltmiete pro Monat (Ist oder Plan), alle Einheiten
  renovation: number; // einmalige Sanierung / Anschaffungsnebenkosten in €
  // Kaufnebenkosten in % des Kaufpreises
  landTax: number; notary: number; broker: number;
  // laufende Kosten und Ausfall
  vacancy: number; // % der Jahresmiete (Leerstand und Mietausfall)
  managementPerUnit: number; // € pro Einheit und Jahr (nicht umlagefähig)
  maintenancePerSqm: number; // € pro m² und Jahr (Instandhaltungsrücklage)
  // Finanzierung
  equityPct: number; // % der Gesamtinvestition
  interest: number; // % Sollzins
  amortization: number; // % anfängliche Tilgung
  // Steuer (vereinfacht)
  taxRate: number; // persönlicher Grenzsteuersatz in %
  buildingShare: number; // % des Kaufpreises auf das Gebäude
  afaRate: number; // % Absetzung für Abnutzung
  // Zielwerte für den Maximalpreis (null = Kriterium aus)
  targetNetYield: number | null; // % Netto-Mietrendite
  minCashflow: number | null; // € pro Monat nach Kapitaldienst
  maxFactor: number | null; // Kaufpreisfaktor (Kaufpreis / Jahreskaltmiete)
}

export const DEFAULT_INPUT: CalcInput = {
  price: 0, area: 0, units: 1, rentMonth: 0, renovation: 0,
  landTax: GRUNDERWERBSTEUER['Nordrhein-Westfalen'], notary: 2, broker: 3.57,
  vacancy: 3, managementPerUnit: 300, maintenancePerSqm: 12,
  equityPct: 20, interest: 3.8, amortization: 2,
  taxRate: 35, buildingShare: 80, afaRate: 2,
  targetNetYield: 4.5, minCashflow: 0, maxFactor: 20,
};

const pos = (n: number) => (isFinite(n) ? n : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CalcResult {
  purchaseCostsPct: number; purchaseCosts: number; totalInvestment: number;
  rentYear: number; effectiveRent: number; costsYear: number; noi: number; // noi = Reinertrag vor Finanzierung
  pricePerSqm: number | null; rentPerSqm: number | null;
  grossYield: number | null; netYield: number | null; factor: number | null; // Rendite in %
  equity: number; loan: number; debtServiceYear: number; cashflowYear: number; cashflowMonth: number;
  equityReturn: number | null; dscr: number | null;
  taxYear: number; cashflowAfterTaxMonth: number; // erstes Jahr, vereinfacht
}

export function calculate(i: CalcInput): CalcResult {
  const pct = i.landTax + i.notary + i.broker;
  const purchaseCosts = i.price * (pct / 100);
  const total = i.price + purchaseCosts + i.renovation;
  const rentYear = i.rentMonth * 12;
  const effective = rentYear * (1 - i.vacancy / 100);
  const costs = i.managementPerUnit * Math.max(1, i.units) + i.maintenancePerSqm * i.area;
  const noi = effective - costs;
  const equity = total * (i.equityPct / 100);
  const loan = total - equity;
  const debt = loan * ((i.interest + i.amortization) / 100);
  const cf = noi - debt;
  const interestYear = loan * (i.interest / 100);
  const afa = i.price * (1 + pct / 100) * (i.buildingShare / 100) * (i.afaRate / 100);
  const taxable = effective - costs - interestYear - afa;
  const tax = taxable * (i.taxRate / 100);
  return {
    purchaseCostsPct: r2(pct), purchaseCosts: r2(purchaseCosts), totalInvestment: r2(total),
    rentYear: r2(rentYear), effectiveRent: r2(effective), costsYear: r2(costs), noi: r2(noi),
    pricePerSqm: i.area > 0 && i.price > 0 ? r2(i.price / i.area) : null,
    rentPerSqm: i.area > 0 && i.rentMonth > 0 ? r2(i.rentMonth / i.area) : null,
    grossYield: i.price > 0 && rentYear > 0 ? r2((rentYear / i.price) * 100) : null,
    netYield: total > 0 && rentYear > 0 ? r2((noi / total) * 100) : null,
    factor: rentYear > 0 && i.price > 0 ? r2(i.price / rentYear) : null,
    equity: r2(equity), loan: r2(loan), debtServiceYear: r2(debt), cashflowYear: r2(cf), cashflowMonth: r2(cf / 12),
    equityReturn: equity > 0 ? r2((cf / equity) * 100) : null,
    dscr: debt > 0 ? r2(noi / debt) : null,
    taxYear: r2(tax), cashflowAfterTaxMonth: r2((cf - tax) / 12),
  };
}

export type Criterion = 'rendite' | 'cashflow' | 'faktor';
export const CRITERION_LABEL: Record<Criterion, string> = { rendite: 'Netto-Mietrendite', cashflow: 'Cashflow', faktor: 'Kaufpreisfaktor' };

export interface MaxPrice {
  byCriterion: Partial<Record<Criterion, number>>; // Maximalpreis je aktivem Kriterium (0 = nicht erreichbar)
  max: number | null; // der niedrigste Wert, null wenn kein Kriterium aktiv
  binding: Criterion | null; // welches Kriterium den Preis begrenzt
  recommended: number | null; // abgerundet auf volle 1.000 €
}

/** Höchster Kaufpreis, bei dem alle aktiven Zielwerte noch erreicht werden. Der Reinertrag hängt nicht vom Preis ab, deshalb lässt sich jedes Kriterium direkt auflösen. */
export function maxPrice(i: CalcInput): MaxPrice {
  const base = calculate({ ...i, price: 0 });
  const noi = base.noi;
  const nk = 1 + (i.landTax + i.notary + i.broker) / 100;
  const out: Partial<Record<Criterion, number>> = {};
  const fromTotal = (g: number) => Math.max(0, (g - i.renovation) / nk);
  if (i.targetNetYield && i.targetNetYield > 0) out.rendite = noi > 0 ? fromTotal(noi / (i.targetNetYield / 100)) : 0;
  if (i.minCashflow !== null && i.minCashflow !== undefined) {
    const k = (1 - i.equityPct / 100) * ((i.interest + i.amortization) / 100); // Kapitaldienst je € Gesamtinvestition
    const room = noi - i.minCashflow * 12; // verfügbarer Kapitaldienst pro Jahr
    out.cashflow = room <= 0 ? 0 : k > 0 ? fromTotal(room / k) : Infinity;
  }
  if (i.maxFactor && i.maxFactor > 0) out.faktor = pos(i.maxFactor * i.rentMonth * 12);
  const entries = (Object.entries(out) as [Criterion, number][]).filter(([, v]) => isFinite(v));
  if (!entries.length) return { byCriterion: out, max: null, binding: null, recommended: null };
  const [binding, max] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { byCriterion: out, max: r2(max), binding, recommended: Math.floor(max / 1000) * 1000 };
}

export type Verdict = 'gut' | 'verhandeln' | 'zu_teuer' | 'offen';
/** Ampel: Angebotspreis gegen Maximalpreis. Bis 5 % darüber lohnt Verhandeln. */
export function verdict(price: number, max: number | null): { verdict: Verdict; delta: number; discountPct: number } {
  if (max === null || !(price > 0)) return { verdict: 'offen', delta: 0, discountPct: 0 };
  const delta = r2(price - max);
  if (delta <= 0) return { verdict: 'gut', delta, discountPct: 0 };
  return { verdict: delta <= max * 0.05 ? 'verhandeln' : 'zu_teuer', delta, discountPct: r2((delta / price) * 100) };
}

/** Zwei Stresstests: Zins +1 Prozentpunkt und Miete −10 %. Gibt den monatlichen Cashflow vor Steuern zurück. */
export function stress(i: CalcInput) {
  return {
    interestPlus1: calculate({ ...i, interest: i.interest + 1 }).cashflowMonth,
    rentMinus10: calculate({ ...i, rentMonth: i.rentMonth * 0.9 }).cashflowMonth,
  };
}
