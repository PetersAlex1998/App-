import { DB, Property } from './types';
import { num, openItems, rentNow, today } from './calc';
import { expensesOf, inYear } from './expenses';
import { balanceAt, interestInYear, isPaidOff, loansOf, principalInYear } from './loans';
import { counts } from './checks';
import { potential } from './rentBasis';
import { isOpen } from './issues';
import { monthsToFixedEnd } from './loans';

/**
 * Portfolio-Controlling: Kennzahlen je Haus und für den Bestand.
 * Cashflow = Einnahmen (alle Zahlungen außer Kaution) − Ausgaben (ohne Abschreibung) − Zins und Tilgung.
 * Die Renditen sind Richtwerte auf Basis von Kaufpreis und Sollmiete.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null);

export interface Kpi {
  id: string; name: string; prop?: Property;
  units: number; rented: number; vacant: number; area: number; vacantArea: number;
  rentRented: number; // Jahreskaltmiete der vermieteten Einheiten (Soll)
  rentVacant: number; // entgangene Jahreskaltmiete der leeren Einheiten (zuletzt gültige Miete)
  income: number; expenses: number; interest: number; principal: number; cashflow: number;
  debt: number; price: number; marketValue: number; ltv: number | null; netWorth: number | null;
  grossYield: number | null; netYield: number | null; openRent: number;
  occupancy: number | null; // Vermietungsquote nach Fläche in %
}

const NOT_COST = new Set(['afa']);
const PASS_THROUGH = new Set(['schuldzinsen', 'afa', 'betriebskosten']);

function kpiFor(db: DB, year: number, now: string, props: Property[], id: string, name: string, prop?: Property): Kpi {
  const pIds = new Set(props.map((p) => p.id));
  const units = db.units.filter((u) => pIds.has(u.propertyId));
  const active = (uId: string) => db.tenants.some((t) => t.unitId === uId && (!t.moveOut || t.moveOut >= now));
  const rentedUnits = units.filter((u) => active(u.id));
  const vacantUnits = units.filter((u) => !active(u.id));
  const rentRented = r2(rentedUnits.reduce((a, u) => a + rentNow(u, now).coldRent, 0) * 12);
  const rentVacant = r2(vacantUnits.reduce((a, u) => a + rentNow(u, now).coldRent, 0) * 12);
  const area = units.reduce((a, u) => a + (u.area || 0), 0);
  const vacantArea = vacantUnits.reduce((a, u) => a + (u.area || 0), 0);

  const tenantIds = new Set(db.tenants.filter((t) => units.some((u) => u.id === t.unitId)).map((t) => t.id));
  const income = r2(db.payments.filter((p) => tenantIds.has(p.tenantId) && p.kind !== 'kaution' && inYear(p.date, year)).reduce((a, p) => a + p.amount, 0));
  const exps = expensesOf(db, { year }).filter((e) => pIds.has(e.propertyId));
  const expenses = r2(exps.filter((e) => !NOT_COST.has(e.category)).reduce((a, e) => a + e.amount, 0));

  let interest = 0, principal = 0;
  for (const p of props) {
    const hasInterestExpense = exps.some((e) => e.propertyId === p.id && e.category === 'schuldzinsen');
    for (const l of loansOf(db, p.id)) {
      if (!hasInterestExpense) interest += interestInYear(l, year);
      principal += principalInYear(l, year);
    }
  }
  interest = r2(interest); principal = r2(principal);
  const cashflow = r2(income - expenses - interest - principal);

  const debt = r2(props.reduce((a, p) => a + loansOf(db, p.id).filter((l) => !isPaidOff(l, now)).reduce((b, l) => b + balanceAt(l, now), 0), 0));
  const price = props.reduce((a, p) => a + num(p.purchasePrice ?? ''), 0);
  const marketValue = props.reduce((a, p) => a + num(p.marketValue ?? ''), 0);
  const nonAllocatable = r2(exps.filter((e) => !e.allocatable && !PASS_THROUGH.has(e.category)).reduce((a, e) => a + e.amount, 0));
  const openRent = r2([...tenantIds].reduce((a, id) => { const t = db.tenants.find((x) => x.id === id)!; return a + (!t.moveOut || t.moveOut >= now ? openItems(db, t).reduce((b, i) => b + i.open, 0) : 0); }, 0));
  return {
    id, name, prop, units: units.length, rented: rentedUnits.length, vacant: vacantUnits.length, area: r2(area), vacantArea: r2(vacantArea),
    rentRented, rentVacant, income, expenses, interest, principal, cashflow, debt, price, marketValue,
    ltv: marketValue > 0 ? pct(debt, marketValue) : null,
    netWorth: marketValue > 0 ? r2(marketValue - debt) : null,
    grossYield: price > 0 ? pct(rentRented + rentVacant, price) : null,
    netYield: price > 0 ? pct(rentRented - nonAllocatable, price) : null,
    openRent, occupancy: area > 0 ? r2(((area - vacantArea) / area) * 100) : null,
  };
}

export function portfolio(db: DB, year: number, now = today()): { total: Kpi; houses: Kpi[] } {
  const houses = db.properties.map((p) => kpiFor(db, year, now, [p], p.id, p.name, p));
  return { total: kpiFor(db, year, now, db.properties, 'alle', 'Gesamtbestand'), houses: houses.sort((a, b) => b.cashflow - a.cashflow) };
}

export interface Todo { id: string; icon: string; tone: 'danger' | 'warn' | 'neutral'; title: string; detail: string; screen: string; params?: Record<string, string> }

/** Handlungsfelder für den Bestand: wo lässt sich Geld holen oder Risiko senken? */
export function todos(db: DB, now = today()): Todo[] {
  const out: Todo[] = [];
  const k = portfolio(db, new Date(now).getFullYear(), now).total;
  if (k.vacant > 0) out.push({ id: 'leerstand', icon: 'key-outline', tone: 'warn', title: `${k.vacant} Einheit${k.vacant === 1 ? '' : 'en'} leer`, detail: `Entgangene Kaltmiete ca. ${Math.round(k.rentVacant).toLocaleString('de-DE')} € pro Jahr`, screen: 'Objekte' });
  if (k.openRent > 0) out.push({ id: 'rueckstand', icon: 'alert-circle-outline', tone: 'danger', title: 'Mietrückstände', detail: `${Math.round(k.openRent).toLocaleString('de-DE')} € offen`, screen: 'Mahnlauf' });
  const pot = potential(db, now).filter((x) => !x.blocked);
  if (pot.length) out.push({ id: 'potenzial', icon: 'trending-up', tone: 'neutral', title: `Mieterhöhung bei ${pot.length} Wohnung${pot.length === 1 ? '' : 'en'} möglich`, detail: `Bis zu ${Math.round(pot.reduce((a, x) => a + x.gainMonth, 0) * 12).toLocaleString('de-DE')} € mehr pro Jahr`, screen: 'Potenzial' });
  const soon = db.loans.filter((l) => !isPaidOff(l, now)).map((l) => ({ l, m: monthsToFixedEnd(l, now) })).filter((x) => x.m !== null && x.m <= 24).sort((a, b) => a.m! - b.m!);
  if (soon.length) out.push({ id: 'zinsbindung', icon: 'cash-outline', tone: soon[0].m! <= 6 ? 'danger' : 'warn', title: `Zinsbindung endet: ${soon[0].l.name || 'Darlehen'}`, detail: soon[0].m! < 0 ? 'Bereits abgelaufen' : `In ${soon[0].m} Monat${soon[0].m === 1 ? '' : 'en'}`, screen: 'Darlehen' });
  const c = counts(db, now);
  if (c.overdue) out.push({ id: 'wartung', icon: 'calendar-outline', tone: 'danger', title: `${c.overdue} Prüfung${c.overdue === 1 ? '' : 'en'} überfällig`, detail: 'Heizung, Rauchmelder, Schornsteinfeger …', screen: 'Wartung' });
  const open = db.issues.filter(isOpen).length;
  if (open) out.push({ id: 'schaeden', icon: 'construct-outline', tone: 'warn', title: `${open} Schaden${open === 1 ? '' : 'meldungen'} offen`, detail: 'Aufträge und Kosten', screen: 'Schaeden' });
  return out;
}

