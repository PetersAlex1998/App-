import { Cost, DB, Tenant, Unit } from './types';

export const eur = (n: number) =>
  (isFinite(n) ? n : 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const num = (s: string) => {
  const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
export const dateDE = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '–');
const ym = (iso: string) => iso.slice(0, 7);

/** Alle Monate (YYYY-MM), für die Miete fällig ist (Einzug bis Auszug/heute). */
export function dueMonths(t: Tenant): string[] {
  if (!t.moveIn) return [];
  const end = t.moveOut && t.moveOut < today() ? ym(t.moveOut) : ym(today());
  const out: string[] = [];
  let [y, m] = ym(t.moveIn).split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= end) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface OpenItem {
  month: string;
  due: number;
  paid: number;
  open: number;
}

export function openItems(db: DB, t: Tenant): OpenItem[] {
  const unit = db.units.find((u) => u.id === t.unitId);
  if (!unit) return [];
  const due = unit.coldRent + unit.advance;
  return dueMonths(t)
    .map((month) => {
      const paid = db.payments
        .filter((p) => p.tenantId === t.id && p.kind === 'miete' && p.month === month)
        .reduce((s, p) => s + p.amount, 0);
      return { month, due, paid, open: Math.round((due - paid) * 100) / 100 };
    })
    .filter((i) => i.open > 0.005);
}

export const totalOpen = (db: DB, t: Tenant) => openItems(db, t).reduce((s, i) => s + i.open, 0);

export interface NkLine {
  category: string;
  total: number;
  key: string;
  share: number;
}
export interface NkResult {
  lines: NkLine[];
  costs: number;
  advances: number;
  balance: number; // >0 Nachzahlung, <0 Guthaben
  months: number;
}

/** Nebenkostenabrechnung für einen Mieter und ein Jahr (anteilig nach Mietmonaten). */
export function nkStatement(db: DB, tenant: Tenant, unit: Unit, year: number): NkResult {
  const propUnits = db.units.filter((u) => u.propertyId === unit.propertyId);
  const totalArea = propUnits.reduce((s, u) => s + u.area, 0) || 1;
  const costs: Cost[] = db.costs.filter((c) => c.propertyId === unit.propertyId && c.year === year);
  const start = tenant.moveIn > `${year}-01-01` ? Number(tenant.moveIn.slice(5, 7)) : 1;
  const endIso = tenant.moveOut && tenant.moveOut.startsWith(String(year)) ? tenant.moveOut : '';
  const end = endIso ? Number(endIso.slice(5, 7)) : 12;
  const months = tenant.moveIn.slice(0, 4) > String(year) ? 0 : Math.max(0, end - start + 1);
  const f = months / 12;
  const lines = costs.map((c) => {
    const base = c.key === 'area' ? (unit.area / totalArea) : 1 / (propUnits.length || 1);
    return {
      category: c.category,
      total: c.amount,
      key: c.key === 'area' ? 'nach m²' : 'je Einheit',
      share: Math.round(c.amount * base * f * 100) / 100,
    };
  });
  const costSum = lines.reduce((s, l) => s + l.share, 0);
  const advances = unit.advance * months;
  return { lines, costs: costSum, advances, balance: Math.round((costSum - advances) * 100) / 100, months };
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** '2026-10' → 'Okt 2026' */
export const monthLabel = (m: string) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ''} ${m.slice(0, 4)}` : '–');
/** '2026-10' → 'Oktober 2026' */
export const monthLong = (m: string) => (m ? `${MONTHS_LONG[Number(m.slice(5, 7)) - 1] ?? ''} ${m.slice(0, 4)}` : '–');
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
export const reminderLabel = (level: number) => ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung'][level] ?? '';
/** Vorbelegung für „Zahlung erfassen“: ältester offener Monat und dessen offener Betrag. */
export function suggestPayment(db: DB, t: Tenant): { month: string; amount: number } {
  const first = openItems(db, t)[0];
  if (first) return { month: first.month, amount: first.open };
  const u = db.units.find((x) => x.id === t.unitId);
  return { month: today().slice(0, 7), amount: u ? u.coldRent + u.advance : 0 };
}
