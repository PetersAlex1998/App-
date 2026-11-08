import { Property } from './types';
import type { Settings } from './settingsDefaults';
import { footerLines, formatIban, fullName, validIban } from './company';
import { dateDE } from './calc';

/**
 * Eigentümer und Hauskonto. Die Häuser gehören Privatpersonen (zum Teil mehreren mit Anteilen), die Firma verwaltet sie in deren Namen.
 * Die Miete läuft auf das Konto des jeweiligen Hauses. Das Firmenkonto dient der Verwaltung (Verwaltung, Hausmeister) und steht nie in Zahlungsaufforderungen an Mieter.
 */
export interface Owner { name: string; share: number; address?: string; email?: string; phone?: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${String(r2(n)).replace('.', ',')} %`;

export const ownersOf = (p?: Pick<Property, 'owners'>): Owner[] => (p?.owners ?? []).filter((o) => o.name.trim());

/** Ein einzelner Eigentümer ohne Anteil gilt als 100 %. */
export const effectiveShare = (list: Owner[], o: Owner) => (list.length === 1 && !(o.share > 0) ? 100 : o.share);
export const shareSum = (p?: Pick<Property, 'owners'>) => { const l = ownersOf(p); return r2(l.reduce((a, o) => a + (effectiveShare(l, o) || 0), 0)); };

/** Passen die Anteile? Leere Eigentümerliste ist kein Fehler, nur unvollständig. */
export function shareProblem(p?: Pick<Property, 'owners'>): string | null {
  const l = ownersOf(p);
  if (l.length === 0) return null;
  if (l.some((o) => !(effectiveShare(l, o) > 0))) return 'Bitte bei jedem Eigentümer den Anteil in Prozent angeben.';
  if (l.some((o) => effectiveShare(l, o) > 100)) return 'Ein Anteil kann nicht über 100 % liegen.';
  const sum = shareSum(p);
  return Math.abs(sum - 100) > 0.01 ? `Die Anteile ergeben ${pct(sum)}. Sie müssen zusammen 100 % ergeben.` : null;
}

/** „Max Muster (50 %), Erika Muster (30 %), Paul Muster (20 %)“; bei einem Eigentümer nur der Name. */
export function ownersLine(p?: Pick<Property, 'owners'>): string {
  const l = ownersOf(p);
  return l.map((o) => (l.length > 1 ? `${o.name.trim()} (${pct(effectiveShare(l, o))})` : o.name.trim())).join(', ');
}
export const ownerNames = (p?: Pick<Property, 'owners'>) => ownersOf(p).map((o) => o.name.trim()).join(', ');

/** Eigentümer mit Anschrift, für Verträge: „Max Muster, Hauptstr. 1, 33098 Paderborn (50 %)“. */
export function ownersFull(p?: Pick<Property, 'owners'>): string {
  const l = ownersOf(p);
  return l.map((o) => `${o.name.trim()}${o.address?.trim() ? `, ${o.address.trim()}` : ''}${l.length > 1 ? ` (${pct(effectiveShare(l, o))})` : ''}`).join('; ');
}

/** Hinweis, dass die Firma im Namen der Eigentümer handelt (leer, wenn keine Eigentümer hinterlegt sind). */
export function onBehalfSentence(s: Settings, p?: Pick<Property, 'owners' | 'mandate'>): string {
  const line = ownersLine(p);
  if (!line) return '';
  const who = fullName(s);
  return `${who} handelt im Namen und mit Vollmacht der Eigentümer${p?.mandate ? ` (laut Verwaltungsvertrag/Vollmacht vom ${dateDE(p.mandate)})` : ''}: ${line}.`;
}

/** Vermieter-Angabe im Mietvertrag: die Eigentümer, vertreten durch die Firma. Ohne Eigentümer wie bisher die Firma. */
export function landlordText(s: Settings, p?: Pick<Property, 'owners' | 'mandate'>): string {
  const full = ownersFull(p);
  if (!full) return `**${fullName(s)}**, ${[s.street, `${s.zip} ${s.city}`.trim()].filter((x) => x && x.trim()).join(', ')}`;
  return `${full.split('; ').map((x) => `**${x}**`).join('; ')}, vertreten durch **${fullName(s)}**, ${[s.street, `${s.zip} ${s.city}`.trim()].filter((x) => x && x.trim()).join(', ')}`;
}

/* ───────── Hauskonto ───────── */

export interface HouseBank { holder: string; iban: string; bic: string; bank: string }

/** Konto des Hauses für Mietzahlungen. Fehlt es, gibt es kein Konto (nie ersatzweise das Firmenkonto). */
export function houseBank(p?: Pick<Property, 'bank' | 'owners'>): HouseBank | null {
  const b = p?.bank;
  if (!b || !b.iban?.trim()) return null;
  return { holder: b.holder?.trim() || ownerNames(p) || '', iban: b.iban.replace(/\s+/g, '').toUpperCase(), bic: b.bic?.trim() ?? '', bank: b.bank?.trim() ?? '' };
}
export const houseBankValid = (p?: Pick<Property, 'bank' | 'owners'>) => { const b = houseBank(p); return !!b && validIban(b.iban); };

/** Bankverbindung des Hauses als Zeilenpaare (Überweisungsblock im Brief an den Mieter). */
export function houseBankRows(p?: Pick<Property, 'bank' | 'owners'>): [string, string][] {
  const b = houseBank(p);
  if (!b) return [];
  const rows: [string, string][] = [];
  if (b.holder) rows.push(['Empfänger', b.holder]);
  rows.push(['IBAN', formatIban(b.iban)]);
  if (b.bic) rows.push(['BIC', b.bic]);
  if (b.bank) rows.push(['Bank', b.bank]);
  return rows;
}

/** Fußzeile eines Schreibens an einen Mieter: Steuer und Register der Firma, Hinweis auf die Vollmacht, Konto des Hauses. */
export function tenantFooter(s: Settings, p?: Pick<Property, 'owners' | 'bank' | 'mandate'>): string[] {
  const out = footerLines(s, { bank: false });
  const ob = onBehalfSentence(s, p);
  if (ob) out.push(ob);
  const b = houseBank(p);
  if (b) out.push(`Mietkonto: ${b.holder ? b.holder + ' · ' : ''}IBAN ${formatIban(b.iban)}${b.bic ? ' · BIC ' + b.bic : ''}${b.bank ? ' · ' + b.bank : ''}`);
  return out;
}
