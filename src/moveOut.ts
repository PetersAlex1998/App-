import { DB, Tenant, Unit } from './types';
import { eur, nkStatement, openItems, today } from './calc';

/**
 * Geführter Mieterwechsel: aus den vorhandenen Daten wird abgeleitet, welche Schritte beim Auszug und bei der
 * Neuvermietung schon erledigt sind. Was sich nicht erkennen lässt (z. B. Schlüsselübergabe), markiert man von Hand.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const days = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export type StepStatus = 'done' | 'open' | 'wait' | 'skip';
export interface Step {
  id: string; title: string; detail: string; status: StepStatus; auto?: boolean; manual?: boolean; optional?: boolean;
}
export interface Wechsel {
  unit: Unit; outgoing?: Tenant; incoming?: Tenant; steps: Step[]; open: number; done: number;
}

const isActive = (t: Tenant, now: string) => !t.moveOut || t.moveOut >= now;

/** Wer zieht aus? Der aktuelle Mieter (auch mit künftigem Auszug), sonst der zuletzt ausgezogene. Wer zieht ein? Ein Mieter mit Einzug nach dem Auszug. */
export function findParties(db: DB, unitId: string, now = today()): { outgoing?: Tenant; incoming?: Tenant } {
  const all = db.tenants.filter((t) => t.unitId === unitId).sort((a, b) => a.moveIn.localeCompare(b.moveIn));
  const active = all.filter((t) => isActive(t, now));
  const ended = all.filter((t) => !isActive(t, now));
  // Zwei aktive Mieter (alter mit Auszugsdatum, neuer ab Einzug): der mit Auszugsdatum zieht aus
  const leaving = active.find((t) => t.moveOut);
  if (leaving) return { outgoing: leaving, incoming: all.find((t) => t.id !== leaving.id && t.moveIn > leaving.moveOut) };
  if (active.length === 1 && ended.length && ended[ended.length - 1].moveOut && active[0].moveIn >= ended[ended.length - 1].moveOut) return { outgoing: ended[ended.length - 1], incoming: active[0] };
  if (active.length) return { outgoing: active[0] };
  return { outgoing: ended[ended.length - 1] };
}

const hasDoc = (db: DB, t: Tenant | undefined, note: string) => !!t && db.documents.some((d) => d.ownerKind === 'tenant' && d.ownerId === t.id && d.note === note);

/** Ergebnis der Kautionsabrechnung: was gezahlt wurde, was verrechnet wird und was zurückgezahlt werden kann. */
export function depositSettlement(db: DB, t: Tenant, unit: Unit) {
  const paid = r2(db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((a, p) => a + p.amount, 0));
  const openRent = r2(openItems(db, t).reduce((a, i) => a + i.open, 0));
  const year = t.moveOut ? Number(t.moveOut.slice(0, 4)) : new Date().getFullYear();
  const nk = nkStatement(db, t, unit, year);
  const nkKnown = nk.lines.length > 0;
  const nkClaim = nkKnown && nk.balance > 0 ? r2(nk.balance) : 0;
  const nkCredit = nkKnown && nk.balance < 0 ? r2(-nk.balance) : 0;
  const refund = r2(Math.max(0, paid - openRent - nkClaim));
  const shortfall = r2(Math.max(0, openRent + nkClaim - paid));
  return { paid, agreed: t.deposit || 0, openRent, nkKnown, nkClaim, nkCredit, year, refund, shortfall };
}

export function wechsel(db: DB, unitId: string, now = today()): Wechsel | null {
  const unit = db.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const { outgoing: t, incoming } = findParties(db, unitId, now);
  const steps: Step[] = [];
  const mark = (id: string) => !!t?.moveSteps?.[id];

  if (t) {
    const date = t.moveOut;
    steps.push({ id: 'termin', title: 'Auszugstermin festhalten', detail: date ? `Auszug zum ${date.split('-').reverse().join('.')}.` : 'Noch kein Auszugsdatum eingetragen.', status: date ? 'done' : 'open', auto: true });
    steps.push({ id: 'kuendigung', title: 'Kündigung bestätigen', detail: 'Schriftliche Bestätigung mit Mietende und den nächsten Schritten.', status: hasDoc(db, t, 'Kündigungsbestätigung') || mark('kuendigung') ? 'done' : 'open', optional: true, manual: true });
    steps.push({ id: 'protokoll', title: 'Wohnung abnehmen (Übergabeprotokoll)', detail: 'Zustand, Mängel, Zählerstände und Schlüssel festhalten.', status: hasDoc(db, t, 'Übergabeprotokoll') || mark('protokoll') ? 'done' : 'open', manual: true });

    const meters = db.meters.filter((m) => m.unitId === unit.id);
    if (meters.length === 0) steps.push({ id: 'zaehler', title: 'Zählerstände ablesen', detail: 'Für diese Wohnung sind keine Zähler angelegt.', status: 'skip' });
    else if (!date) steps.push({ id: 'zaehler', title: 'Zählerstände ablesen', detail: `${meters.length} Zähler. Zuerst den Auszugstermin festhalten.`, status: 'wait' });
    else {
      const from = days(date, -14), to = days(date, 45);
      const have = meters.filter((m) => db.readings.some((r) => r.meterId === m.id && r.date >= from && r.date <= to)).length;
      steps.push({ id: 'zaehler', title: 'Zählerstände ablesen', detail: `${have} von ${meters.length} Zählern zum Auszug abgelesen.`, status: have === meters.length ? 'done' : 'open', auto: true });
    }

    const year = date ? Number(date.slice(0, 4)) : 0;
    const nkDone = !!t.nkDone?.[String(year)];
    const haveCosts = year ? db.costs.some((c) => c.propertyId === unit.propertyId && c.year === year) : false;
    steps.push({ id: 'nk', title: `Nebenkosten bis zum Auszug${year ? ` (${year})` : ''}`, detail: nkDone ? 'Abrechnung erstellt.' : haveCosts ? 'Betriebskosten sind erfasst, die Abrechnung kann erstellt werden.' : 'Die Betriebskosten stehen meist erst nach Jahresende fest. Bis dahin Rückbehalt in der Kaution einplanen.', status: nkDone ? 'done' : haveCosts && date ? 'open' : 'wait', auto: true });

    const d = depositSettlement(db, t, unit);
    const kautionDetail = d.paid || d.agreed
      ? `Kaution ${eur(d.paid)} gezahlt · offene Mieten ${eur(d.openRent)}${d.nkKnown ? ` · Nachzahlung Nebenkosten ${eur(d.nkClaim)}` : ''} → rückzahlbar ${eur(d.refund)}${d.shortfall ? `, Rest offen ${eur(d.shortfall)}` : ''}.`
      : 'Es ist keine Kaution erfasst.';
    steps.push({ id: 'kaution', title: 'Kaution abrechnen und zurückzahlen', detail: kautionDetail, status: !d.paid && !d.agreed ? 'skip' : mark('kaution') ? 'done' : 'open', manual: true });
  }

  const newest = incoming;
  steps.push({ id: 'neu', title: 'Neuen Mieter anlegen', detail: newest ? `${newest.name}, Einzug ${newest.moveIn.split('-').reverse().join('.')}.` : 'Noch kein Nachmieter eingetragen.', status: newest ? 'done' : 'open', auto: true });
  if (newest) {
    steps.push({ id: 'vertrag', title: 'Mietvertrag erstellen', detail: 'Mit den Konditionen der Wohnung und der Wohnungs-ID.', status: hasDoc(db, newest, 'Mietvertrag Wohnraum') || mark2(newest, 'vertrag') ? 'done' : 'open', manual: true });
    steps.push({ id: 'geber', title: 'Wohnungsgeberbestätigung', detail: 'Für die Anmeldung beim Einwohnermeldeamt (§ 19 BMG), spätestens zwei Wochen nach Einzug.', status: hasDoc(db, newest, 'Wohnungsgeberbestätigung') || mark2(newest, 'geber') ? 'done' : 'open', manual: true });
    steps.push({ id: 'einzug', title: 'Einzug übergeben (Protokoll)', detail: 'Zustand, Zählerstände und Schlüssel bei Einzug.', status: hasDoc(db, newest, 'Übergabeprotokoll') || mark2(newest, 'einzug') ? 'done' : 'open', manual: true });
    steps.push({ id: 'kautionNeu', title: 'Kaution quittieren', detail: newest.deposit ? `Vereinbart ${eur(newest.deposit)}.` : 'Noch keine Kaution vereinbart.', status: hasDoc(db, newest, 'Kautionsquittung') || mark2(newest, 'kautionNeu') ? 'done' : 'open', optional: true, manual: true });
  }
  const counted = steps.filter((s) => s.status !== 'skip' && !s.optional);
  return { unit, outgoing: t, incoming, steps, done: counted.filter((s) => s.status === 'done').length, open: counted.filter((s) => s.status === 'open').length };
}

function mark2(t: Tenant, id: string) { return !!t.moveSteps?.[id]; }

/** Schritte, die zum Nachmieter gehören (die Markierung wird beim Nachmieter gespeichert). */
export const INCOMING = new Set(['vertrag', 'geber', 'einzug', 'kautionNeu']);
