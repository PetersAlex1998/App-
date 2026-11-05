import { checkState } from './checks';
import { DB, Tenant, Unit } from './types';
import { Settings } from './settingsDefaults';
import { dueMonths, today, totalOpen, unitDue, unitDueAt } from './calc';
import { anlageV, AnlageV } from './expenses';
import { dunningPlans } from './dunning';
import { computeTasks } from './tasks';
import { dueStatements } from './nk';
import { daysUntil } from './docs';
import { completeness } from './company';

/**
 * Kennzahlen und Handlungsfelder für das Cockpit (Übersicht). Reine Berechnungen, damit sie testbar bleiben.
 */
const isActive = (t: { moveOut: string }, now: string) => !t.moveOut || t.moveOut >= now;
const round = (n: number) => Math.round(n * 100) / 100;

export interface MonthStat { month: string; soll: number; ist: number }
export interface HouseStat { id: string; name: string; units: number; vacant: number; occupancy: number; soll: number; open: number }
export interface Cockpit {
  rentRoll: number; // Soll-Miete pro Monat aller aktuellen Mieter
  vacantLoss: number; // entgangene Soll-Miete der leeren Einheiten pro Monat
  occupancy: number; // % vermietet
  vacantUnits: Unit[];
  activeTenants: number;
  month: string; sollMonth: number; istMonth: number; rate: number | null; // Mieteingang des laufenden Monats
  openTotal: number; arrears: { tenant: Tenant; open: number }[];
  months: MonthStat[]; // letzte 6 Monate, älteste zuerst
  houses: HouseStat[];
  ytd: AnlageV; // Einnahmen und Ausgaben des laufenden Jahres
}

export function cockpit(db: DB, now = today()): Cockpit {
  const active = db.tenants.filter((t) => isActive(t, now));
  const unitOf = new Map(db.units.map((u) => [u.id, u]));
  const occupied = new Set(active.map((t) => t.unitId));
  const vacantUnits = db.units.filter((u) => !occupied.has(u.id));
  const rentRoll = round(active.reduce((s, t) => s + unitDue(unitOf.get(t.unitId)), 0));
  const vacantLoss = round(vacantUnits.reduce((s, u) => s + unitDue(u), 0));

  // Soll und Ist je Monat (Ist = auf den Monat gebuchte Mieten)
  const month = now.slice(0, 7);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const soll = new Map(months.map((m) => [m, 0]));
  for (const t of db.tenants) {
    const unit = unitOf.get(t.unitId);
    const set = new Set(dueMonths(t));
    for (const m of months) if (set.has(m)) soll.set(m, soll.get(m)! + unitDueAt(unit, m));
  }
  const ist = new Map(months.map((m) => [m, 0]));
  for (const p of db.payments) if (p.kind === 'miete' && ist.has(p.month)) ist.set(p.month, ist.get(p.month)! + p.amount);
  const stats = months.map((m) => ({ month: m, soll: round(soll.get(m)!), ist: round(ist.get(m)!) }));
  const cur = stats[stats.length - 1];

  const arrears = active.map((t) => ({ tenant: t, open: totalOpen(db, t) })).filter((x) => x.open > 0).sort((a, b) => b.open - a.open);

  const houses: HouseStat[] = db.properties.map((p) => {
    const us = db.units.filter((u) => u.propertyId === p.id);
    const vac = us.filter((u) => !occupied.has(u.id));
    const ts = active.filter((t) => us.some((u) => u.id === t.unitId));
    return {
      id: p.id, name: p.name, units: us.length, vacant: vac.length,
      occupancy: us.length ? Math.round(((us.length - vac.length) / us.length) * 100) : 0,
      soll: round(ts.reduce((s, t) => s + unitDue(unitOf.get(t.unitId)), 0)),
      open: round(arrears.filter((a) => us.some((u) => u.id === a.tenant.unitId)).reduce((s, a) => s + a.open, 0)),
    };
  });

  return {
    rentRoll, vacantLoss, vacantUnits, activeTenants: active.length,
    occupancy: db.units.length ? Math.round(((db.units.length - vacantUnits.length) / db.units.length) * 100) : 0,
    month, sollMonth: cur.soll, istMonth: cur.ist, rate: cur.soll > 0 ? Math.round((cur.ist / cur.soll) * 100) : null,
    openTotal: round(arrears.reduce((s, a) => s + a.open, 0)), arrears, months: stats, houses,
    ytd: anlageV(db, Number(now.slice(0, 4))),
  };
}

/* ───────── Handlungsfelder: was jetzt zu tun ist ───────── */

export type Tone = 'danger' | 'warn' | 'neutral';
export interface Action { key: string; icon: string; tone: Tone; title: string; subtitle: string; screen: string; params?: Record<string, string>; count?: number }

export function actions(db: DB, cfg: Settings, now = today()): Action[] {
  const out: Action[] = [];
  const plans = dunningPlans(db, cfg, now).filter((p) => p.status === 'faellig');
  if (plans.length) out.push({ key: 'mahnlauf', icon: 'mail-unread', tone: 'danger', title: `Mahnlauf starten (${plans.length})`, subtitle: `${plans.length} Mieter mit überfälliger Miete`, screen: 'Mahnlauf', count: plans.length });
  const letters = db.documents.filter((d) => d.category === 'brief' && (d.status ?? 'bereit') === 'bereit').length;
  if (letters) out.push({ key: 'briefe', icon: 'mail', tone: 'warn', title: `Briefausgang (${letters})`, subtitle: 'Briefe sind bereit zum Versand', screen: 'Outbox', count: letters });
  for (const d of dueStatements(db, now)) {
    const left = daysUntil(d.deadline, now);
    out.push({ key: 'nk' + d.prop.id, icon: 'calculator', tone: left <= 90 ? 'danger' : 'warn', title: `Nebenkosten ${d.year}: ${d.prop.name}`, subtitle: `${d.open} von ${d.total} Abrechnungen offen`, screen: 'NkLauf', params: { propertyId: d.prop.id } });
  }
  const tasks = computeTasks(db, { dismissed: cfg.dismissedTasks, now });
  if (tasks.length) out.push({ key: 'aufgaben', icon: 'checkmark-done-circle-outline', tone: tasks.some((t) => t.level === 'hoch') ? 'danger' : 'warn', title: `Datenprüfung (${tasks.length})`, subtitle: tasks[0].title, screen: 'Aufgaben', count: tasks.length });
  if (db.tenants.length > 0) {
    const need = completeness(cfg).missing.filter((m) => m.needed === 'brief' || m.needed === 'zahlung');
    if (need.length) out.push({ key: 'unternehmen', icon: 'business-outline', tone: 'warn', title: 'Unternehmensdaten ergänzen', subtitle: `Für Briefe fehlt: ${need.map((m) => m.label).join(', ')}`, screen: 'Unternehmen' });
  }
  const last = cfg.lastBackupAt ? Date.parse(cfg.lastBackupAt) : 0;
  const days = last ? Math.floor((Date.parse(now) - last) / 86400000) : null;
  if (cfg.backupRemindDays > 0 && db.properties.length > 0 && (days === null || days >= cfg.backupRemindDays)) {
    out.push({ key: 'backup', icon: 'cloud-upload', tone: days === null || days >= cfg.backupRemindDays * 2 ? 'danger' : 'warn', title: 'Sicherung fällig', subtitle: days === null ? 'Noch nie gesichert' : `Zuletzt vor ${days} Tagen`, screen: 'Daten' });
  }
  const rank = { danger: 0, warn: 1, neutral: 2 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/* ───────── Fristen der nächsten Monate ───────── */

export interface Deadline { key: string; icon: string; tone: 'danger' | 'warn'; title: string; subtitle: string; date: string; screen: string; params?: Record<string, string> }

/** Anstehende und überfällige Termine: Energieausweis, Dokumente, Befristungen, Mietanpassungen. Nach Datum sortiert. */
export function deadlines(db: DB, now = today(), horizon = 90): Deadline[] {
  const out: Deadline[] = [];
  const within = (iso: string | undefined, h = horizon): iso is string => !!iso && daysUntil(iso, now) <= h;
  const rel = (iso: string) => { const d = daysUntil(iso, now); return d < 0 ? `seit ${-d} Tagen überfällig` : d === 0 ? 'heute' : `in ${d} Tagen`; };
  const tone = (iso: string): 'danger' | 'warn' => (daysUntil(iso, now) < 0 ? 'danger' : 'warn');
  for (const p of db.properties) if (within(p.eaValidUntil)) out.push({ key: 'ea' + p.id, icon: 'leaf', tone: tone(p.eaValidUntil), title: `Energieausweis: ${p.name}`, subtitle: rel(p.eaValidUntil), date: p.eaValidUntil, screen: 'PropertyDetail', params: { id: p.id } });
  for (const d of db.documents) if (d.category !== 'energieausweis' && within(d.validUntil)) out.push({ key: 'doc' + d.id, icon: 'document-text', tone: tone(d.validUntil), title: d.name, subtitle: rel(d.validUntil), date: d.validUntil, screen: 'DocumentViewer', params: { id: d.id } });
  for (const t of db.tenants) {
    if (!isActive(t, now)) continue;
    if (within(t.contractEnd)) out.push({ key: 'ce' + t.id, icon: 'calendar', tone: tone(t.contractEnd), title: `Befristung endet: ${t.name}`, subtitle: rel(t.contractEnd), date: t.contractEnd, screen: 'TenantDetail', params: { id: t.id } });
    if (within(t.nextAdjust, 60)) out.push({ key: 'na' + t.id, icon: 'trending-up', tone: tone(t.nextAdjust), title: `Mietanpassung: ${t.name}`, subtitle: `${t.rentAdjust ?? 'Anpassung'} ${rel(t.nextAdjust)}`, date: t.nextAdjust, screen: 'TenantDetail', params: { id: t.id } });
  }
  for (const x of db.checks) {
    const st = checkState(x, now);
    if (st.due && st.days !== null && st.days <= 60) out.push({ key: 'chk' + x.id, icon: 'calendar-outline', tone: st.days < 0 ? 'danger' : 'warn', title: x.title, subtitle: `${db.properties.find((p) => p.id === x.propertyId)?.name ?? ''} · ${rel(st.due)}`, date: st.due, screen: 'CheckDetail', params: { id: x.id } });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

