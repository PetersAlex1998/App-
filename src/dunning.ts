import { DB, Property, Reminder, Tenant, Unit } from './types';
import { OpenItem, addDays, openItems, today } from './calc';
import type { Settings } from './settings';

/** Überfällige Posten: Die Miete des laufenden Monats gilt erst nach Fälligkeitstag + Karenz als überfällig. */
export function overdueItems(db: DB, t: Tenant, s: Settings, now = today()): OpenItem[] {
  const cur = now.slice(0, 7);
  const day = Number(now.slice(8, 10));
  return openItems(db, t).filter((i) => i.month < cur || (i.month === cur && day > s.rentDueDay + s.graceDays));
}

/** Nur Mahnungen zum aktuellen Rückstand zählen (nicht Altfälle aus längst bezahlten Monaten). */
export function relevantReminders(db: DB, t: Tenant, items: OpenItem[]): Reminder[] {
  if (items.length === 0) return [];
  const since = `${items[0].month}-01`;
  return db.reminders.filter((r) => r.tenantId === t.id && r.date >= since).sort((a, b) => a.date.localeCompare(b.date));
}

export type PlanStatus = 'faellig' | 'wartet' | 'max';
export interface DunningPlan {
  tenant: Tenant; unit: Unit; prop: Property; items: OpenItem[]; open: number;
  level: 1 | 2 | 3; fee: number; status: PlanStatus; last?: Reminder;
}

export const feeFor = (level: number, s: Settings) => (level === 2 ? s.fee2 : level === 3 ? s.fee3 : 0);

export function dunningPlans(db: DB, s: Settings, now = today()): DunningPlan[] {
  const out: DunningPlan[] = [];
  for (const tenant of db.tenants) {
    if (tenant.moveOut && tenant.moveOut < now) continue; // Ausgezogene: nicht im Lauf
    const unit = db.units.find((u) => u.id === tenant.unitId);
    const prop = db.properties.find((p) => p.id === unit?.propertyId);
    if (!unit || !prop) continue;
    const items = overdueItems(db, tenant, s, now);
    const open = Math.round(items.reduce((a, i) => a + i.open, 0) * 100) / 100;
    if (open <= 0.5) continue;
    const rel = relevantReminders(db, tenant, items);
    const last = rel[rel.length - 1];
    const level = Math.min(3, rel.length + 1) as 1 | 2 | 3;
    const status: PlanStatus = rel.length >= 3 ? 'max' : last && now <= last.deadline ? 'wartet' : 'faellig';
    out.push({ tenant, unit, prop, items, open, level, fee: feeFor(level, s), status, last });
  }
  // älteste Rückstände zuerst, dann höchster Betrag
  return out.sort((a, b) => a.items[0].month.localeCompare(b.items[0].month) || b.open - a.open);
}

export const makeReminder = (id: string, p: DunningPlan, s: Settings, now = today()): Reminder => ({
  id, tenantId: p.tenant.id, date: now, level: p.level, amount: p.open, fee: p.fee, deadline: addDays(now, s.deadlineDays), items: p.items,
});
