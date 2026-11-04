import { DB, Tenant, Unit } from './types';
import { nkStatement, rentNow, vatFactor } from './calc';

/**
 * Anpassung der Nebenkostenvorauszahlung nach einer Abrechnung (§ 560 Abs. 4 BGB):
 * Vorschlag aus den tatsächlichen Kosten pro Monat, mit kleinem Puffer, aufgerundet auf volle 5 €.
 */
export interface AdvanceProposal { year: number; months: number; costPerMonth: number; current: number; proposed: number; diff: number; change: boolean }

const ceil5 = (n: number) => Math.ceil(n / 5 - 1e-9) * 5;

export function advanceProposal(db: DB, tenant: Tenant, unit: Unit, year: number, buffer = 5): AdvanceProposal | null {
  const r = nkStatement(db, tenant, unit, year);
  if (r.months <= 0 || r.lines.length === 0) return null;
  const perMonthNet = r.costs / vatFactor(unit) / r.months; // Kosten pro Monat ohne USt
  const proposed = ceil5(perMonthNet * (1 + buffer / 100));
  const current = rentNow(unit).advance;
  return { year, months: r.months, costPerMonth: Math.round(perMonthNet * 100) / 100, current, proposed, diff: proposed - current, change: Math.abs(proposed - current) >= 5 };
}

/** Wirksam ab dem ersten Tag des übernächsten Monats nach der Mitteilung (vorsichtig: spätere Fälligkeit nach Zugang). */
export function effectiveFrom(letterDate: string): string {
  const d = new Date(`${letterDate.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 2);
  return d.toISOString().slice(0, 10);
}
