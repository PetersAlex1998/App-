import { Check, DB } from './types';
import { addDays, today } from './calc';
import { addMonths } from './loans';

/**
 * Prüf- und Wartungskalender: wiederkehrende Fristen je Haus. Die Intervalle der Vorlagen sind gängige Richtwerte.
 * Welche Pflichten für ein Haus gelten, hängt von Anlage, Baujahr und Bundesland ab. Frag im Zweifel den Fachbetrieb oder Schornsteinfeger.
 */
export interface Preset { key: string; title: string; months: number; hint: string }

export const PRESETS: Preset[] = [
  { key: 'heizung', title: 'Heizungswartung', months: 12, hint: 'Jährliche Wartung durch den Heizungsbauer' },
  { key: 'schornstein', title: 'Schornsteinfeger (Kehrung, Messung)', months: 12, hint: 'Termine nennt der Bezirksschornsteinfeger im Bescheid' },
  { key: 'rauchmelder', title: 'Rauchwarnmelder prüfen', months: 12, hint: 'Funktion jährlich prüfen. Wer dafür zuständig ist, regelt die Landesbauordnung und der Mietvertrag' },
  { key: 'legionellen', title: 'Trinkwasser (Legionellen)', months: 36, hint: 'Bei zentraler Warmwasserbereitung in vermieteten Häusern, Untersuchung alle drei Jahre (Trinkwasserverordnung)' },
  { key: 'elektro', title: 'Elektroanlage prüfen (E-Check)', months: 48, hint: 'Empfohlen etwa alle vier Jahre durch eine Elektrofachkraft' },
  { key: 'gas', title: 'Gasleitung und Gasgeräte prüfen', months: 144, hint: 'Dichtheitsprüfung der Gasleitung etwa alle zwölf Jahre empfohlen. Geräte jährlich beim Heizungsbauer' },
  { key: 'rueckstau', title: 'Rückstauklappe warten', months: 6, hint: 'Halbjährliche Wartung empfohlen' },
  { key: 'feuerloescher', title: 'Feuerlöscher prüfen', months: 24, hint: 'Alle zwei Jahre durch einen Fachbetrieb' },
  { key: 'aufzug', title: 'Aufzug (Prüfung)', months: 24, hint: 'Prüffristen nach Betriebssicherheitsverordnung, genaue Fristen nennt die Prüfstelle' },
  { key: 'dach', title: 'Dach und Dachrinnen kontrollieren', months: 12, hint: 'Sichtkontrolle, am besten nach dem Herbst' },
  { key: 'baeume', title: 'Bäume kontrollieren', months: 12, hint: 'Verkehrssicherungspflicht: Sichtprüfung auf Äste und Standsicherheit' },
];
export const presetOf = (key?: string) => PRESETS.find((p) => p.key === key);

/** Nächster Termin: festgelegter Termin, sonst letzte Erledigung plus Intervall. Ohne beides unbekannt. */
export function nextDue(c: Check): string | null {
  if (c.due) return c.due;
  if (c.last) {
    const d = c.last;
    const m = addMonths(d.slice(0, 7), c.intervalMonths);
    const day = Number(d.slice(8, 10));
    const [y, mo] = m.split('-').map(Number);
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return `${m}-${String(Math.min(day, dim)).padStart(2, '0')}`;
  }
  return null;
}

export type CheckStatus = 'ueberfaellig' | 'bald' | 'ok' | 'unbekannt';
export const SOON_DAYS = 60;
const diff = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);

export function checkState(c: Check, now = today()): { status: CheckStatus; due: string | null; days: number | null } {
  const due = nextDue(c);
  if (!due) return { status: 'unbekannt', due: null, days: null };
  const days = diff(due, now);
  return { status: days < 0 ? 'ueberfaellig' : days <= SOON_DAYS ? 'bald' : 'ok', due, days };
}

const ORDER: Record<CheckStatus, number> = { ueberfaellig: 0, bald: 1, unbekannt: 2, ok: 3 };
export function sortChecks(list: Check[], now = today()): Check[] {
  return [...list].sort((a, b) => {
    const x = checkState(a, now), y = checkState(b, now);
    return ORDER[x.status] - ORDER[y.status] || (x.due ?? '9999').localeCompare(y.due ?? '9999') || a.title.localeCompare(b.title);
  });
}

/** Erledigt am `date`: Merkt den Termin, löscht einen festen Termin und rechnet ab dann mit dem Intervall. */
export function markDone(c: Check, date = today()): Check {
  return { ...c, last: date, due: undefined, history: [...(c.history ?? []), ...(c.last && c.last !== date ? [c.last] : [])].filter((d, i, a) => a.indexOf(d) === i).sort() };
}

export function counts(db: DB, now = today(), propertyId?: string) {
  const list = db.checks.filter((c) => !propertyId || c.propertyId === propertyId);
  const st = list.map((c) => checkState(c, now).status);
  return { total: list.length, overdue: st.filter((s) => s === 'ueberfaellig').length, soon: st.filter((s) => s === 'bald').length, unknown: st.filter((s) => s === 'unbekannt').length };
}

/** Vorschläge für ein Haus: Vorlagen, die dort noch nicht angelegt sind. */
export const missingPresets = (db: DB, propertyId: string) => PRESETS.filter((p) => !db.checks.some((c) => c.propertyId === propertyId && c.preset === p.key));
export const dueSoonDate = (now = today()) => addDays(now, SOON_DAYS);
