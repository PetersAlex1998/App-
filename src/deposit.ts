import { DB, Tenant, Unit } from './types';
import { addDays, rentNow, today } from './calc';

/**
 * Kautionsverwaltung: Was ist vereinbart, gezahlt, angelegt, verzinst – und bei Ausgezogenen: was ist noch zurückzuzahlen?
 * § 551 BGB: höchstens drei Nettokaltmieten, Zahlung in drei Raten möglich, getrennte Anlage, Zinsen gehören dem Mieter.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export type DepositStatus = 'fehlt' | 'teilweise' | 'gehalten' | 'rueckzahlung' | 'zurueck';
export interface DepositRow {
  tenant: Tenant; unit?: Unit; agreed: number; paid: number; interest: number; held: number; status: DepositStatus;
  ended: boolean; daysSinceMoveOut: number; tooHigh: boolean; notPlaced: boolean; maxAllowed: number;
}

export const paidDeposit = (db: DB, t: Tenant) => r2(db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((a, p) => a + p.amount, 0));

const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);

export function depositRow(db: DB, t: Tenant, now = today()): DepositRow | null {
  const unit = db.units.find((u) => u.id === t.unitId);
  const paid = paidDeposit(db, t);
  const agreed = t.deposit || 0;
  const ended = !!t.moveOut && t.moveOut < now;
  const returned = !!t.depositReturned;
  if (!agreed && !paid && !returned) return null;
  if (ended && !paid && !returned) return null;
  const interest = t.depositInterest || 0;
  let status: DepositStatus;
  if (returned) status = 'zurueck';
  else if (ended) status = 'rueckzahlung';
  else if (paid <= 0.005) status = 'fehlt';
  else if (paid < agreed - 0.005) status = 'teilweise';
  else status = 'gehalten';
  const coldRent = unit ? (t.coldRent && ended ? t.coldRent : rentNow(unit, now).coldRent) : 0;
  const maxAllowed = r2(coldRent * 3);
  return {
    tenant: t, unit, agreed, paid, interest, held: returned ? 0 : r2(paid + interest), status, ended,
    daysSinceMoveOut: ended ? dayDiff(now, t.moveOut) : 0,
    tooHigh: maxAllowed > 0 && agreed > maxAllowed + 0.005,
    notPlaced: !ended && paid > 0 && !t.depositPlaced && t.depositType !== 'Bürgschaft',
    maxAllowed,
  };
}

export function depositOverview(db: DB, now = today()) {
  const rows = db.tenants.map((t) => depositRow(db, t, now)).filter((r): r is DepositRow => !!r);
  const held = r2(rows.filter((r) => r.status !== 'zurueck').reduce((a, r) => a + r.held, 0));
  return {
    rows, held,
    toReturn: rows.filter((r) => r.status === 'rueckzahlung'),
    missing: rows.filter((r) => r.status === 'fehlt' || r.status === 'teilweise'),
    notPlaced: rows.filter((r) => r.notPlaced),
  };
}

/** Wie lange nach dem Auszug man sich mit der Rückzahlung Zeit lassen darf: üblich sind bis zu sechs Monate (Rechtsprechung, keine feste Frist). */
export const RETURN_USUAL_DAYS = 180;
export const returnDeadline = (t: Tenant) => (t.moveOut ? addDays(t.moveOut, RETURN_USUAL_DAYS) : '');
