import { DB, Property, Tenant, Unit } from './types';
import { kindOf, rentNow, today } from './calc';
import { checkIncrease } from './rent';
import { unitRef } from './ids';

/**
 * Begründung von Mieterhöhungen nach § 558a BGB, möglichst gut belegt:
 *  1. Mietspiegel der Gemeinde (oder einer vergleichbaren Gemeinde, § 558a Abs. 4 Satz 2 BGB)
 *  2. mindestens drei Vergleichswohnungen, auch aus dem eigenen Bestand
 *  3. Gutachten oder Mietdatenbank
 * Das Modul schlägt passende Vergleichswohnungen vor, bildet die Obergrenze und zeigt, wo eine Erhöhung möglich ist.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Basis = 'mietspiegel' | 'vergleich' | 'gutachten';

/** Welche Begründungsart ist für ein Haus die Vorgabe? Mit Mietspiegel der Gemeinde: Mietspiegel, sonst Vergleichswohnungen. */
export function defaultBasis(prop?: Property): Basis {
  const k = prop?.rentBasis?.kind;
  return k === 'eigene' || k === 'andere' ? 'mietspiegel' : 'vergleich';
}

/** Hinweise zum hinterlegten Mietspiegel eines Hauses. */
export function basisNotes(prop: Property | undefined, now = today()): string[] {
  const b = prop?.rentBasis;
  const out: string[] = [];
  if (!b) return ['Für dieses Haus ist noch nicht hinterlegt, ob es einen Mietspiegel gibt (Haus → Mietspiegel).'];
  if (b.kind === 'andere') out.push(`Ihr Ort hat keinen eigenen Mietspiegel. Der Mietspiegel einer vergleichbaren Gemeinde (${b.gemeinde || 'bitte nennen'}) ist zulässig. Begründe im Schreiben, warum die Gemeinden vergleichbar sind (§ 558a Abs. 4 Satz 2 BGB).`);
  if (b.kind === 'keiner') out.push('Ohne Mietspiegel brauchst du mindestens drei Vergleichswohnungen, ein Gutachten oder eine Mietdatenbank.');
  if (b.validUntil && b.validUntil < now) out.push(`Der Mietspiegel „${b.name || ''}“ war nur bis ${b.validUntil.split('-').reverse().join('.')} gültig. Nutze die aktuelle Fassung.`);
  return out;
}

/* ───────── Vergleichswohnungen aus dem eigenen Bestand ───────── */

export interface Comparable { unitId: string; label: string; street: string; position: string; area: number; rent: number; perSqm: number; sameHouse: boolean; sameCity: boolean; areaDiffPct: number }

const city = (p?: Property) => (p?.city ?? '').trim().toLowerCase();

/** Passende Wohnungen mit aktuellem Mieter: gleiche Art, ähnliche Größe (±30 %), derselbe Ort. Die ähnlichsten zuerst. */
export function findComparables(db: DB, unit: Unit, limit = 8): Comparable[] {
  const prop = db.properties.find((p) => p.id === unit.propertyId);
  const act = (t: Tenant) => !t.moveOut || t.moveOut >= today();
  const out: Comparable[] = [];
  for (const u of db.units) {
    if (u.id === unit.id || kindOf(u) !== kindOf(unit) || !(u.area > 0)) continue;
    if (!db.tenants.some((t) => t.unitId === u.id && act(t))) continue;
    const p = db.properties.find((x) => x.id === u.propertyId);
    const sameCity = city(p) !== '' && city(p) === city(prop);
    if (!sameCity && p?.id !== prop?.id) continue;
    const diff = unit.area > 0 ? Math.abs(u.area - unit.area) / unit.area : 0;
    if (diff > 0.3) continue;
    const rent = rentNow(u).coldRent;
    if (!(rent > 0)) continue;
    out.push({ unitId: u.id, label: `${p?.name ?? ''} · ${u.name}`, street: [p?.street, `${p?.zip ?? ''} ${p?.city ?? ''}`.trim()].filter(Boolean).join(', '), position: [u.floor, u.position].filter(Boolean).join(' '), area: u.area, rent, perSqm: r2(rent / u.area), sameHouse: p?.id === prop?.id, sameCity, areaDiffPct: Math.round(diff * 100) });
  }
  const score = (c: Comparable) => (c.sameHouse ? 0 : 5) + c.areaDiffPct / 10;
  return out.sort((a, b) => score(a) - score(b)).slice(0, limit);
}

/** Obergrenze aus den gewählten Vergleichswohnungen: der Durchschnitt (sicher), daneben der höchste Wert. Mindestens drei nötig. */
export function comparablesCap(sel: Comparable[]): { ok: boolean; avg: number; max: number; min: number; count: number } {
  if (!sel.length) return { ok: false, avg: 0, max: 0, min: 0, count: 0 };
  const v = sel.map((c) => c.perSqm);
  return { ok: sel.length >= 3, avg: r2(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v), min: Math.min(...v), count: sel.length };
}

/* ───────── Wo ist eine Erhöhung möglich? ───────── */

export interface Potential {
  unit: Unit; tenant: Tenant; prop?: Property; current: number; perSqm: number; benchmark: number; basis: Basis; target: number; gainMonth: number; blocked?: string; count?: number;
}

/**
 * Für jede vermietete Wohnung: Richtwert (eigener Mietspiegelwert der Wohnung oder Durchschnitt passender Vergleichswohnungen),
 * daraus die mögliche neue Miete unter Beachtung von Kappung und Sperrfrist. Größter Gewinn zuerst.
 */
export function potential(db: DB, now = today(), capPct = 20): Potential[] {
  const out: Potential[] = [];
  for (const unit of db.units) {
    if (kindOf(unit) === 'gewerbe' || !(unit.area > 0)) continue;
    const tenant = db.tenants.find((t) => t.unitId === unit.id && (!t.moveOut || t.moveOut >= now));
    if (!tenant) continue;
    const prop = db.properties.find((p) => p.id === unit.propertyId);
    const current = rentNow(unit, now).coldRent;
    const perSqm = r2(current / unit.area);
    let benchmark = 0, basis: Basis = 'vergleich', count: number | undefined;
    if (unit.mietspiegel?.mean) { benchmark = unit.mietspiegel.upper ?? unit.mietspiegel.mean; basis = 'mietspiegel'; }
    else { const comps = findComparables(db, unit, 6); if (comps.length >= 3) { benchmark = comparablesCap(comps).avg; count = comps.length; } }
    if (!(benchmark > perSqm + 0.005)) continue;
    const wanted = r2(benchmark * unit.area);
    const chk = checkIncrease({ kind: 'vergleich', unit, tenant, letterDate: now, newRent: wanted, capPct, comparePerSqm: benchmark });
    const blockers = chk.errors.filter((e) => !e.startsWith('Kappungsgrenze') && !e.startsWith('Über der ortsüblichen'));
    const target = Math.floor(Math.min(wanted, chk.maxByCap) * 100) / 100;
    if (!(target > current)) continue;
    out.push({ unit, tenant, prop, current, perSqm, benchmark, basis, target, gainMonth: r2(target - current), blocked: blockers[0], count });
  }
  return out.sort((a, b) => (a.blocked ? 1 : 0) - (b.blocked ? 1 : 0) || b.gainMonth - a.gainMonth);
}

export const labelOf = (db: DB, u: Unit) => `${db.properties.find((p) => p.id === u.propertyId)?.name ?? ''} · ${u.name}`;
export { unitRef };
