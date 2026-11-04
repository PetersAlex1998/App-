import { Tenant, Unit } from './types';
import { rentNow, termsOn, today } from './calc';
import { monthsBetween } from './history';

/**
 * Mieterhöhung: Mietverlauf pflegen und Erhöhungen auf Zulässigkeit prüfen (§ 557b Indexmiete, § 558 Vergleichsmiete BGB).
 * Die Prüfung ist eine Hilfe für die üblichen Wohnraumfälle. Sie ersetzt keine Rechtsberatung.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Neuen Stand in den Mietverlauf eintragen (gleiches Datum wird ersetzt). Die Reihenfolge nach Datum bleibt. */
export function addTerm(u: Unit, from: string, patch: { coldRent?: number; advance?: number; reason?: string }): Unit {
  const base = termsOn(u, from);
  const term = { from, coldRent: patch.coldRent ?? base.coldRent, advance: patch.advance ?? base.advance, ...(patch.reason ? { reason: patch.reason } : {}) };
  const terms = [...(u.terms ?? []).filter((t) => t.from !== from), term].sort((a, b) => a.from.localeCompare(b.from));
  return { ...u, terms };
}

/** Monatserster, `add` Monate nach dem Monat von `iso`. */
export function monthStart(iso: string, add: number): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + add);
  return d.toISOString().slice(0, 10);
}
/** Letzter Tag des Monats, `add` Monate nach dem Monat von `iso`. */
export function monthEnd(iso: string, add: number): string {
  const d = new Date(`${monthStart(iso, add + 1)}T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
const minusYears = (iso: string, y: number) => `${Number(iso.slice(0, 4)) - y}${iso.slice(4)}`;

/** Zeitpunkt der letzten Änderung der Kaltmiete (letzter Eintrag im Verlauf, sonst Einzug). */
export function lastChange(u: Unit, t: Tenant | undefined, asOf: string): string {
  const last = [...(u.terms ?? [])].filter((x) => x.from <= asOf).pop();
  const fromTerms = last?.from ?? '';
  const start = t?.moveIn ?? '';
  return fromTerms > start ? fromTerms : start;
}

export type IncreaseKind = 'vergleich' | 'index';
export interface IncreaseInput {
  kind: IncreaseKind; unit: Unit; tenant?: Tenant; letterDate: string; newRent: number;
  capPct?: number; // Kappungsgrenze in 3 Jahren: 20 oder 15
  comparePerSqm?: number; // ortsübliche Vergleichsmiete laut Mietspiegel in € pro m²
  indexOld?: number; indexNew?: number; // Verbraucherpreisindex bei Indexmiete
}
export interface IncreaseCheck {
  errors: string[]; warnings: string[];
  currentRent: number; newRent: number; increase: number; increasePct: number; perSqm: number | null;
  effective: string; consentUntil?: string; lastChange: string;
  baseline3y: number; maxByCap: number; maxByCompare?: number; maxAllowed: number;
}

/** Neue Miete bei Indexmiete: bisherige Miete × neuer Index ÷ alter Index. */
export const indexRent = (current: number, oldIdx: number, newIdx: number) => (oldIdx > 0 && newIdx > 0 ? r2((current * newIdx) / oldIdx) : current);

export function checkIncrease(i: IncreaseInput): IncreaseCheck {
  const { unit, tenant } = i;
  const errors: string[] = [], warnings: string[] = [];
  const currentRent = termsOn(unit, i.letterDate).coldRent;
  const cap = i.capPct ?? 20;
  const effective = i.kind === 'index' ? monthStart(i.letterDate, 2) : monthStart(i.letterDate, 3);
  const consentUntil = i.kind === 'vergleich' ? monthEnd(i.letterDate, 2) : undefined;
  const last = lastChange(unit, tenant, i.letterDate);
  const newRent = i.kind === 'index' && i.indexOld && i.indexNew ? indexRent(currentRent, i.indexOld, i.indexNew) : i.newRent;
  const increase = r2(newRent - currentRent);
  const baselineDate = tenant?.moveIn && tenant.moveIn > minusYears(effective, 3) ? tenant.moveIn : minusYears(effective, 3);
  const baseline3y = termsOn(unit, baselineDate).coldRent;
  const maxByCap = r2(baseline3y * (1 + cap / 100));
  const maxByCompare = i.comparePerSqm && unit.area > 0 ? r2(i.comparePerSqm * unit.area) : undefined;
  const maxAllowed = i.kind === 'index' ? newRent : Math.min(maxByCap, maxByCompare ?? Infinity);

  if (unit.kind === 'gewerbe') warnings.push('Für Gewerbe gelten diese Wohnraumregeln nicht. Maßgeblich ist, was im Mietvertrag vereinbart ist.');
  if (!(newRent > 0)) errors.push('Bitte die neue Miete eingeben.');
  else if (newRent <= currentRent) errors.push(`Die neue Miete muss höher sein als die bisherige (${currentRent.toLocaleString('de-DE')} €).`);

  const sinceLetter = last ? monthsBetween(last, i.letterDate) : null;
  if (i.kind === 'vergleich') {
    if (last && sinceLetter !== null && sinceLetter < 12) errors.push(`Frühestens ein Jahr nach der letzten Änderung (${last.split('-').reverse().join('.')}) darf das Verlangen zugehen.`);
    else if (last && monthsBetween(last, effective) < 15) errors.push(`Zum Wirksamwerden (${effective.split('-').reverse().join('.')}) muss die Miete seit 15 Monaten unverändert sein (letzte Änderung ${last.split('-').reverse().join('.')}).`);
    if (newRent > maxByCap + 0.005) errors.push(`Kappungsgrenze: In drei Jahren sind höchstens ${cap} % erlaubt, das sind ${maxByCap.toLocaleString('de-DE')} € (Basis ${baseline3y.toLocaleString('de-DE')} €).`);
    if (maxByCompare !== undefined && newRent > maxByCompare + 0.005) errors.push(`Über der ortsüblichen Vergleichsmiete (${i.comparePerSqm!.toLocaleString('de-DE')} € × ${unit.area} m² = ${maxByCompare.toLocaleString('de-DE')} €).`);
    if (maxByCompare === undefined) warnings.push('Ohne Mietspiegelwert ist das Verlangen nicht begründet. Nenne die ortsübliche Vergleichsmiete (Mietspiegel, Gutachten oder drei Vergleichswohnungen).');
  } else {
    if (!(i.indexOld && i.indexNew)) errors.push('Bitte den Index bei der letzten Mietfestsetzung und den aktuellen Index eingeben.');
    else if (i.indexNew <= i.indexOld) errors.push('Der Index ist nicht gestiegen, eine Erhöhung ist nicht möglich.');
    if (last && sinceLetter !== null && sinceLetter < 12) errors.push(`Bei Indexmiete muss die Miete mindestens ein Jahr unverändert sein (letzte Änderung ${last.split('-').reverse().join('.')}).`);
    if (tenant && !/index/i.test(tenant.rentAdjust ?? '')) warnings.push('Beim Mieter ist keine Indexmiete vermerkt. Prüfe, ob der Mietvertrag eine Indexklausel (§ 557b BGB) enthält.');
  }
  return {
    errors, warnings, currentRent, newRent, increase, increasePct: currentRent > 0 ? r2((increase / currentRent) * 100) : 0,
    perSqm: unit.area > 0 && newRent > 0 ? r2(newRent / unit.area) : null, effective, consentUntil, lastChange: last, baseline3y, maxByCap, maxByCompare, maxAllowed: i.kind === 'index' ? newRent : r2(maxAllowed),
  };
}

export { rentNow, today };
