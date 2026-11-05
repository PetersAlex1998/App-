import { Contractor, DB, Expense, Issue } from './types';
import { addDays, dateDE, today } from './calc';

/** Schäden und Handwerker: Meldungen mit Status, Kosten aus den Ausgaben und Aufträge je Handwerker. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const diff = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);

export const STATUS_LABEL: Record<Issue['status'], string> = { offen: 'Offen', beauftragt: 'Beauftragt', erledigt: 'Erledigt' };
export const isOpen = (i: Issue) => i.status !== 'erledigt';
export const ageDays = (i: Issue, now = today()) => Math.max(0, diff(i.status === 'erledigt' && i.done ? i.done : now, i.reported));

/** Dringende zuerst, dann der älteste. Erledigte zuletzt, die jüngsten oben. */
export function sortIssues(list: Issue[]): Issue[] {
  return [...list].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a))
    || (isOpen(a) ? Number(!!b.urgent) - Number(!!a.urgent) || a.reported.localeCompare(b.reported) : (b.done ?? b.reported).localeCompare(a.done ?? a.reported)));
}

export const issueExpenses = (db: DB, i: Issue): Expense[] => db.expenses.filter((e) => e.issueId === i.id).sort((a, b) => b.date.localeCompare(a.date));
export const issueCost = (db: DB, i: Issue) => r2(issueExpenses(db, i).reduce((a, e) => a + e.amount, 0));

export interface ContractorStat { contractor: Contractor; jobs: number; open: number; cost: number }
export function contractorStats(db: DB): ContractorStat[] {
  return db.contractors.map((contractor) => {
    const mine = db.issues.filter((i) => i.contractorId === contractor.id);
    const cost = r2(mine.reduce((a, i) => a + issueCost(db, i), 0));
    return { contractor, jobs: mine.length, open: mine.filter(isOpen).length, cost };
  }).sort((a, b) => a.contractor.name.localeCompare(b.contractor.name));
}

/** Wo liegt der Schaden? „Haus · Wohnung“ oder „Haus · allgemein“. */
export function placeOf(db: DB, i: Issue): string {
  const p = db.properties.find((x) => x.id === i.propertyId);
  const u = i.unitId ? db.units.find((x) => x.id === i.unitId) : undefined;
  return `${p?.name ?? ''} · ${u ? u.name : 'allgemein'}`.replace(/^ · /, '');
}

/** Auftragsmail an den Handwerker: Ort, Beschreibung, Dringlichkeit. Mieterdaten werden bewusst nicht weitergegeben. */
export function orderMail(db: DB, i: Issue, c: Contractor, sender: string) {
  const p = db.properties.find((x) => x.id === i.propertyId);
  const u = i.unitId ? db.units.find((x) => x.id === i.unitId) : undefined;
  const addr = p ? `${p.street}, ${`${p.zip} ${p.city}`.trim()}` : '';
  const subject = `${i.urgent ? 'Dringend: ' : ''}${i.title}${p ? ` – ${p.street}` : ''}`;
  const body = [
    `Guten Tag${c.name ? ` ${c.name}` : ''},`, '',
    `bitte prüfen und beheben Sie folgenden Schaden:`, '',
    `Objekt: ${addr}${u ? `, ${u.name}${u.floor ? ` (${u.floor})` : ''}` : ' (allgemein)'}`,
    `Schaden: ${i.title}`, ...(i.description ? [`Details: ${i.description}`] : []),
    `Gemeldet am: ${dateDE(i.reported)}`, ...(i.urgent ? ['Das ist dringend.'] : []), '',
    'Bitte melden Sie sich zur Terminabsprache. Wir stimmen den Zugang mit dem Mieter ab.', '',
    'Vielen Dank und freundliche Grüße', sender,
  ].join('\n');
  return { subject, body, href: `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}

export const dueSoon = (now = today()) => addDays(now, -14);
