import { DB, Loan } from './types';
import { rentNow, today } from './calc';

/**
 * Darlehen: Tilgungsplan nach der in Deutschland üblichen Monatsrate (Zins = Restschuld × Sollzins ÷ 12).
 * Das ist eine Berechnung der App. Maßgeblich sind immer die Angaben der Bank (Jahreskontoauszug, Zinsbescheinigung).
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const ym = (iso: string) => iso.slice(0, 7);
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Monatliche Rate: feste Rate, sonst aus Tilgung und Zins berechnet. */
export function monthlyPayment(l: Loan): number {
  if (l.payment && l.payment > 0) return r2(l.payment);
  return r2((l.amount * ((l.rate || 0) + (l.repayment || 0))) / 100 / 12);
}

export interface Row { month: string; interest: number; principal: number; special: number; balance: number }

/** Tilgungsplan bis zur vollständigen Tilgung (höchstens 50 Jahre). */
export function schedule(l: Loan): Row[] {
  const rows: Row[] = [];
  if (!(l.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(l.start)) return rows;
  const pay = monthlyPayment(l);
  let balance = l.amount;
  let first = ym(l.start);
  if (l.anchor && /^\d{4}-\d{2}-\d{2}$/.test(l.anchor.date)) { balance = l.anchor.balance; first = addMonths(ym(l.anchor.date), 1); }
  const specials = new Map<string, number>();
  for (const s of l.specials ?? []) specials.set(ym(s.date), (specials.get(ym(s.date)) ?? 0) + s.amount);
  for (let i = 0; i < 600 && balance > 0.005; i++) {
    const month = addMonths(first, i);
    const interest = r2((balance * (l.rate || 0)) / 100 / 12);
    let principal = Math.max(0, Math.min(balance, r2(pay - interest)));
    balance = r2(balance - principal);
    const special = Math.min(balance, specials.get(month) ?? 0);
    balance = r2(balance - special);
    rows.push({ month, interest, principal, special, balance });
    if (pay - interest <= 0 && !special && i > 600) break;
  }
  return rows;
}

/** Restschuld nach der Rate des angegebenen Monats (vor der ersten Rate: der Darlehensbetrag). */
export function balanceAt(l: Loan, date = today()): number {
  const m = ym(date);
  let bal = l.anchor && ym(l.anchor.date) <= m ? l.anchor.balance : l.amount;
  for (const r of schedule(l)) { if (r.month > m) break; bal = r.balance; }
  return r2(bal);
}

export const interestInYear = (l: Loan, year: number) => r2(schedule(l).filter((r) => r.month.startsWith(`${year}-`)).reduce((a, r) => a + r.interest, 0));
export const principalInYear = (l: Loan, year: number) => r2(schedule(l).filter((r) => r.month.startsWith(`${year}-`)).reduce((a, r) => a + r.principal + r.special, 0));
export const paidInYear = (l: Loan, year: number) => r2(schedule(l).filter((r) => r.month.startsWith(`${year}-`)).reduce((a, r) => a + r.interest + r.principal, 0));

/** Monat der letzten Rate (voraussichtlich) oder null, wenn das Darlehen mit dieser Rate nie getilgt wird. */
export function payoffMonth(l: Loan): string | null {
  const rows = schedule(l);
  const last = rows[rows.length - 1];
  return last && last.balance <= 0.005 ? last.month : null;
}

/** Restschuld am Ende der Zinsbindung: so viel muss neu finanziert werden. */
export const balanceAtFixedEnd = (l: Loan) => (l.fixedUntil ? balanceAt(l, l.fixedUntil) : null);

/** Monate bis zum Ende der Zinsbindung (negativ: abgelaufen). */
export function monthsToFixedEnd(l: Loan, now = today()): number | null {
  if (!l.fixedUntil) return null;
  const [y1, m1] = ym(now).split('-').map(Number); const [y2, m2] = ym(l.fixedUntil).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export const isPaidOff = (l: Loan, now = today()) => balanceAt(l, now) <= 0.005 && ym(now) >= ym(l.start);

export const loansOf = (db: DB, propertyId?: string) => db.loans.filter((l) => !propertyId || l.propertyId === propertyId);

/** Schuldzinsen eines Jahres für Anlage V (nur Darlehen dieses Hauses). */
export const loanInterest = (db: DB, year: number, propertyId?: string) => r2(loansOf(db, propertyId).reduce((a, l) => a + interestInYear(l, year), 0));

/** Kennzahlen je Haus: Restschuld, Kapitaldienst, Deckung durch die Kaltmiete. */
export function propertyDebt(db: DB, propertyId: string, now = today()) {
  const loans = loansOf(db, propertyId).filter((l) => !isPaidOff(l, now));
  const debt = r2(loans.reduce((a, l) => a + balanceAt(l, now), 0));
  const service = r2(loans.reduce((a, l) => a + monthlyPayment(l), 0) * 12);
  const units = db.units.filter((u) => u.propertyId === propertyId && db.tenants.some((t) => t.unitId === u.id && (!t.moveOut || t.moveOut >= now)));
  const rentYear = r2(units.reduce((a, u) => a + rentNow(u, now).coldRent, 0) * 12);
  return { debt, service, rentYear, coverage: service > 0 ? r2(rentYear / service) : null, loans };
}
