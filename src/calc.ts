import { Cost, DB, Tenant, Unit, UnitKind } from './types';
import { consumption, fmtVal, meterTypeLabel, meterUnitLabel, yearRange } from './meters';

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
  const startMonth = t.trackFrom && t.trackFrom > ym(t.moveIn) ? t.trackFrom : ym(t.moveIn);
  const end = t.moveOut && t.moveOut < today() ? ym(t.moveOut) : ym(today());
  const out: string[] = [];
  let [y, m] = startMonth.split('-').map(Number);
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

// Zahlungen nach Mieter+Monat vorab summieren (bei 88 Einheiten und vielen Buchungen sonst zu langsam).
const paidCache = new WeakMap<object, Map<string, number>>();
function paidIndex(db: DB): Map<string, number> {
  let m = paidCache.get(db.payments);
  if (!m) {
    m = new Map();
    for (const p of db.payments) if (p.kind === 'miete') m.set(`${p.tenantId}|${p.month}`, (m.get(`${p.tenantId}|${p.month}`) ?? 0) + p.amount);
    paidCache.set(db.payments, m);
  }
  return m;
}

/** Ältester offener Mietmonat; `extra` = zusätzlich (noch nicht gebuchte) Zahlungen je „Mieter|Monat“. */
export function oldestOpenMonth(db: DB, t: Tenant, extra?: Map<string, number>): string | undefined {
  const unit = db.units.find((u) => u.id === t.unitId);
  if (!unit) return undefined;
  const idx = paidIndex(db);
  for (const month of dueMonths(t)) {
    const due = unitDueAt(unit, month);
    const key = `${t.id}|${month}`;
    const paid = (idx.get(key) ?? 0) + (extra?.get(key) ?? 0);
    if (Math.round((due - paid) * 100) / 100 > 0.005) return month;
  }
  return undefined;
}

export function openItems(db: DB, t: Tenant): OpenItem[] {
  const unit = db.units.find((u) => u.id === t.unitId);
  if (!unit) return [];
  const idx = paidIndex(db);
  return dueMonths(t)
    .map((month) => {
      const due = unitDueAt(unit, month);
      const paid = idx.get(`${t.id}|${month}`) ?? 0;
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
  warnings: string[];
}

/** Nebenkostenabrechnung für einen Mieter und ein Jahr (anteilig nach Mietmonaten, Verbrauch nach Zählerständen). */
export function nkStatement(db: DB, tenant: Tenant, unit: Unit, year: number): NkResult {
  const propUnits = db.units.filter((u) => u.propertyId === unit.propertyId);
  const totalArea = propUnits.reduce((s, u) => s + u.area, 0) || 1;
  const costs: Cost[] = db.costs.filter((c) => c.propertyId === unit.propertyId && c.year === year);
  const start = tenant.moveIn > `${year}-01-01` ? Number(tenant.moveIn.slice(5, 7)) : 1;
  const endIso = tenant.moveOut && tenant.moveOut.startsWith(String(year)) ? tenant.moveOut : '';
  const end = endIso ? Number(endIso.slice(5, 7)) : 12;
  const months = tenant.moveIn.slice(0, 4) > String(year) ? 0 : Math.max(0, end - start + 1);
  const f = months / 12;
  const warnings: string[] = [];
  const { from: yFrom, to: yTo } = yearRange(year);
  // Zeitraum des Mieters für Verbrauch
  const tFrom = tenant.moveIn > yFrom ? new Date(new Date(tenant.moveIn).getTime() - 86400000).toISOString().slice(0, 10) : yFrom;
  const tTo = endIso || yTo;

  const lines = costs.map((c) => {
    const v = vatFactor(unit);
    if (c.key === 'consumption' && c.meterType) {
      const type = c.meterType;
      const mine = consumption(db, unit.id, type, tFrom, tTo);
      const all = propUnits.map((u) => ({ u, c: consumption(db, u.id, type, yFrom, yTo) }));
      const total = all.reduce((s, x) => s + (x.c.value ?? 0), 0);
      const missing = all.filter((x) => x.c.value === null).map((x) => x.u.name);
      if (total <= 0) warnings.push(`${c.category}: Für ${year} sind keine Zählerstände (${meterTypeLabel(type)}) erfasst.`);
      else {
        if (mine.value === null) warnings.push(`${c.category}: Für ${unit.name} fehlt der Verbrauch (${meterTypeLabel(type)}). Der Anteil ist 0 €.`);
        if (mine.estimatedStart) warnings.push(`${c.category}: Anfangsstand für ${unit.name} geschätzt (erste Ablesung im Jahr).`);
        if (missing.length) warnings.push(`${c.category}: Kein Verbrauch erfasst für ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` und ${missing.length - 4} weitere` : ''}.`);
      }
      const cs = Math.min(100, Math.max(0, c.consumptionShare ?? 100)) / 100;
      if ((type === 'heizung' || type === 'wasser_warm') && (cs < 0.5 || cs > 0.7) && cs !== 1) warnings.push(`${c.category}: Nach der Heizkostenverordnung sollen 50–70 % der Kosten nach Verbrauch verteilt werden (hier ${Math.round(cs * 100)} %).`);
      const consumptionPart = total > 0 && mine.value ? (c.amount * cs * mine.value) / total : 0;
      const basePart = cs < 1 ? c.amount * (1 - cs) * (unit.area / totalArea) * f : 0;
      const share = consumptionPart + basePart;
      const u = meterUnitLabel(type);
      const label = `nach Verbrauch: ${fmtVal(mine.value ?? 0)} von ${fmtVal(total)} ${u}`;
      return { category: c.category, total: c.amount, key: cs < 1 ? `${Math.round(cs * 100)} % ${label}; ${Math.round((1 - cs) * 100)} % nach m²` : label, share: Math.round(share * v * 100) / 100 };
    }
    const base = c.key === 'area' ? unit.area / totalArea : 1 / (propUnits.length || 1);
    return { category: c.category, total: c.amount, key: c.key === 'area' ? 'nach m²' : 'je Einheit', share: Math.round(c.amount * base * f * v * 100) / 100 };
  });
  const costSum = lines.reduce((s, l) => s + l.share, 0);
  let advances = 0;
  for (let m = start; m < start + months; m++) advances += termsOn(unit, `${year}-${String(m).padStart(2, '0')}-01`).advance * vatFactor(unit);
  advances = Math.round(advances * 100) / 100;
  return { lines, costs: costSum, advances, balance: Math.round((costSum - advances) * 100) / 100, months, warnings };
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
  return { month: today().slice(0, 7), amount: unitDue(u) };
}

export const kindOf = (u?: Unit): UnitKind => u?.kind ?? 'wohnung';
export const kindLabel = (k: UnitKind) => ({ wohnung: 'Wohnung', gewerbe: 'Gewerbe', eigentum: 'Eigentumswohnung' })[k];
/** Faktor für Umsatzsteuer (Gewerbe mit USt-Option), sonst 1. */
export const vatFactor = (u?: Unit) => 1 + (kindOf(u) === 'gewerbe' ? u?.vat ?? 0 : 0) / 100;
/** Monatlich fällige Gesamtmiete (inkl. USt, falls Gewerbe mit USt). */
/** Kaltmiete und Vorauszahlung, die an einem Datum gelten (berücksichtigt den Mietverlauf). */
export function termsOn(u: Unit, iso: string): { coldRent: number; advance: number } {
  let cur = { coldRent: u.coldRent, advance: u.advance };
  for (const t of u.terms ?? []) if (t.from <= iso) cur = { coldRent: t.coldRent, advance: t.advance };
  return cur;
}
/** Aktuell geltende Kaltmiete und Vorauszahlung. */
export const rentNow = (u: Unit, now = today()) => termsOn(u, now);
/** Gesamtmiete (inkl. USt bei Gewerbe) für einen Monat „YYYY-MM“. */
export const unitDueAt = (u: Unit | undefined, month: string) => { if (!u) return 0; const r = termsOn(u, `${month}-01`); return Math.round((r.coldRent + r.advance) * vatFactor(u) * 100) / 100; };
/** Monatlich fällige Gesamtmiete heute (inkl. USt, falls Gewerbe mit USt). */
export const unitDue = (u?: Unit) => (u ? unitDueAt(u, today().slice(0, 7)) : 0);
