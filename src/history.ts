import { DB, Tenant } from './types';
import { today } from './calc';

/**
 * Mieterhistorie einer Einheit als Zeitstrahl: alle Mieter (der aktuelle zuerst) und die Leerstände dazwischen.
 */
export type TimelineEntry =
  | { kind: 'tenant'; tenant: Tenant; from: string; to: string; months: number | null; current: boolean }
  | { kind: 'vacancy'; from: string; to: string; months: number };

const MS_DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);
const addOne = (iso: string) => new Date(Date.parse(iso) + MS_DAY).toISOString().slice(0, 10);

/** Volle Monate zwischen zwei Daten (Einzug bis Auszug, beide Tage eingeschlossen), mindestens 1. */
export function monthsBetween(from: string, to: string): number {
  const f = new Date(from + 'T00:00:00Z'), t = new Date(addOne(to) + 'T00:00:00Z');
  let m = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth());
  if (t.getUTCDate() < f.getUTCDate()) m--;
  return Math.max(1, m);
}

/** „4 Jahre 3 Monate“, „7 Monate“, „1 Monat“. */
export function durationText(months: number): string {
  const y = Math.floor(months / 12), m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} ${y === 1 ? 'Jahr' : 'Jahre'}`);
  if (m || !y) parts.push(`${m} ${m === 1 ? 'Monat' : 'Monate'}`);
  return parts.join(' ');
}

/** Zeitstrahl, neueste zuerst. Lücken von mehr als 31 Tagen zwischen Auszug und nächstem Einzug erscheinen als Leerstand. */
export function tenancyTimeline(db: DB, unitId: string, now = today()): TimelineEntry[] {
  const list = db.tenants.filter((t) => t.unitId === unitId);
  const key = (t: Tenant) => t.moveIn || t.moveOut || '9999';
  const asc = [...list].sort((a, b) => key(a).localeCompare(key(b)));
  const entries: TimelineEntry[] = asc.map((t) => {
    const current = !t.moveOut || t.moveOut >= now;
    const to = t.moveOut || now;
    return { kind: 'tenant' as const, tenant: t, from: t.moveIn, to: current && !t.moveOut ? now : to, months: t.moveIn ? monthsBetween(t.moveIn, current && !t.moveOut ? now : to) : null, current };
  });
  const out: TimelineEntry[] = [];
  entries.forEach((e, i) => {
    out.push(e);
    const next = entries[i + 1];
    if (e.kind === 'tenant' && next && next.kind === 'tenant' && e.tenant.moveOut && next.from && days(e.tenant.moveOut, next.from) > 31) {
      const from = addOne(e.tenant.moveOut), to = new Date(Date.parse(next.from) - MS_DAY).toISOString().slice(0, 10);
      out.push({ kind: 'vacancy', from, to, months: monthsBetween(from, to) });
    }
  });
  // Leerstand seit dem letzten Auszug bis heute
  const last = entries[entries.length - 1];
  if (last && last.kind === 'tenant' && last.tenant.moveOut && last.tenant.moveOut < now && days(last.tenant.moveOut, now) > 31) {
    const from = addOne(last.tenant.moveOut);
    out.push({ kind: 'vacancy', from, to: now, months: monthsBetween(from, now) });
  }
  return out.reverse();
}
