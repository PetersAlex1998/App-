import { DB, Property, Unit } from './types';
import type { Settings } from './settingsDefaults';
import { eur, kindOf, rentNow, today } from './calc';
import { senderLines } from './company';
import { Block } from './letters';

/**
 * Vermietungs-Exposé für eine Einheit: Eckdaten, Beschreibung, Ausstattung, Energieausweis, Kontakt.
 * Es enthält keine Mieterdaten. Die Texte lassen sich vor dem Erstellen anpassen.
 */
export interface ExposeInput {
  title: string; rent: number; advance: number; deposit: number; availableFrom: string;
  description: string; location: string; features: string[]; hideHouseNo: boolean;
}

export interface ExposeModel {
  title: string; address: string; date: string; logo?: string;
  hero?: Uint8Array; gallery: Uint8Array[];
  headline: string; facts: [string, string][]; blocks: Block[]; energy: [string, string][]; contact: string[];
}

const KIND_WORD = { wohnung: 'Wohnung', gewerbe: 'Gewerbeeinheit', eigentum: 'Eigentumswohnung' } as const;
const num = (n: number) => String(n).replace('.', ',');

/** Straße ohne Hausnummer: „Langestr. 13“ → „Langestr.“ */
export const streetOnly = (street: string) => street.replace(/\s+\d+\s*[a-zA-Z]?(\s*[-–/]\s*\d+\s*[a-zA-Z]?)?\s*$/, '').trim();

export function exposeAddress(prop: Property, hideHouseNo: boolean): string {
  return `${hideHouseNo ? streetOnly(prop.street) : prop.street}, ${`${prop.zip} ${prop.city}`.trim()}`.replace(/^, /, '');
}

/** Beschreibende Eigenschaften aus den Stammdaten (nur Gefülltes). */
export function featuresOf(unit: Unit, prop: Property): string[] {
  const f: string[] = [];
  if (unit.balcony?.trim()) f.push(`Balkon/Terrasse: ${unit.balcony.trim()}`);
  if (unit.kitchen?.trim()) f.push(`Küche: ${unit.kitchen.trim()}`);
  if (unit.cellar?.trim()) f.push(`Keller: ${unit.cellar.trim()}`);
  if (unit.parking?.trim()) f.push(`Stellplatz: ${unit.parking.trim()}`);
  if (unit.equipment?.trim()) f.push(...unit.equipment.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean));
  if (prop.heatingType?.trim()) f.push(`Heizung: ${prop.heatingType.trim()}`);
  return f;
}

export function describeUnit(unit: Unit, prop: Property): string {
  const kind = KIND_WORD[kindOf(unit)];
  const rooms = unit.rooms > 0 ? `${num(unit.rooms)}-Zimmer-` : '';
  const where = [unit.floor?.trim(), unit.position?.trim()].filter(Boolean).join(', ');
  const built = prop.yearBuilt?.trim() ? ` Das Haus wurde ${prop.yearBuilt.trim()} errichtet.` : '';
  return `Zur Vermietung steht eine ${rooms}${kind} mit ca. ${num(unit.area)} m² Wohnfläche in ${prop.city || 'ruhiger Lage'}${where ? ` (${where})` : ''}.${built}`;
}

export function exposeDefaults(db: DB, unit: Unit, prop: Property, now = today()): ExposeInput {
  const t = rentNow(unit, now);
  return {
    title: `${unit.rooms > 0 ? `${num(unit.rooms)}-Zimmer-` : ''}${KIND_WORD[kindOf(unit)]}, ${unit.area} m², ${prop.city}`.replace(/, $/, ''),
    rent: t.coldRent, advance: t.advance, deposit: Math.round(t.coldRent * 3 * 100) / 100, availableFrom: '',
    description: describeUnit(unit, prop), location: '', features: featuresOf(unit, prop), hideHouseNo: true,
  };
}

/** Pflichtangaben zur Energie in Immobilienanzeigen (Gebäudeenergiegesetz): was fehlt noch? */
export function energyMissing(prop: Property): string[] {
  const m: string[] = [];
  if (!prop.eaType?.trim()) m.push('Art des Energieausweises');
  if (!prop.eaValue?.trim()) m.push('Energiekennwert');
  if (!prop.energySource?.trim()) m.push('wesentlicher Energieträger');
  if (!prop.yearBuilt?.trim()) m.push('Baujahr');
  if (!prop.eaClass?.trim()) m.push('Effizienzklasse');
  return m;
}

export function exposeWarnings(db: DB, unit: Unit, prop: Property, i: ExposeInput, s: Settings, photos: number, now = today()): string[] {
  const w: string[] = [];
  const miss = energyMissing(prop);
  if (miss.length) w.push(`Energieangaben fehlen: ${miss.join(', ')}. In Immobilienanzeigen sind sie gesetzlich vorgeschrieben (Gebäudeenergiegesetz). Ergänze sie beim Haus unter „Energieausweis“.`);
  if (prop.eaValidUntil && prop.eaValidUntil < now) w.push('Der Energieausweis ist abgelaufen.');
  if (!(i.rent > 0)) w.push('Die Kaltmiete fehlt.');
  if (i.rent > 0 && i.deposit > i.rent * 3 + 0.005) w.push(`Die Kaution liegt über drei Nettokaltmieten (${eur(i.rent * 3)}). Das ist nach § 551 BGB unzulässig.`);
  if (photos === 0) w.push('Ohne Foto wirkt das Exposé schwach. Lege Fotos bei der Wohnung oder dem Haus unter Dokumente ab (Kategorie Foto).');
  if (!s.email.trim() && !s.phone.trim()) w.push('Für den Kontakt fehlen Telefon oder E-Mail in den Unternehmensdaten.');
  if (!(unit.area > 0)) w.push('Die Wohnfläche fehlt.');
  return w;
}

export function buildExpose(db: DB, unit: Unit, prop: Property, s: Settings, i: ExposeInput, now = today()): Omit<ExposeModel, 'hero' | 'gallery'> {
  const sqm = unit.area > 0 && i.rent > 0 ? ` (${eur(i.rent / unit.area)} pro m²)` : '';
  const facts: [string, string][] = [
    ['Kaltmiete', `${eur(i.rent)}${sqm}`],
    ['Nebenkosten-Vorauszahlung', eur(i.advance)],
    ['Warmmiete', eur(i.rent + i.advance)],
    ['Kaution', i.deposit > 0 ? eur(i.deposit) : 'nach Vereinbarung'],
    ['Wohnfläche', `ca. ${num(unit.area)} m²`],
    ...(unit.rooms > 0 ? [['Zimmer', num(unit.rooms)] as [string, string]] : []),
    ...(unit.floor?.trim() ? [['Etage', unit.floor.trim()] as [string, string]] : []),
    ['Verfügbar ab', i.availableFrom ? i.availableFrom.split('-').reverse().join('.') : 'nach Absprache'],
  ];
  const blocks: Block[] = [];
  if (i.description.trim()) blocks.push({ t: 'h1', text: 'Die Wohnung' }, ...i.description.trim().split(/\n{2,}/).map((p) => ({ t: 'p' as const, text: p.replace(/\n/g, ' ') })));
  if (i.features.length) blocks.push({ t: 'h1', text: 'Ausstattung' }, ...i.features.map((f) => ({ t: 'p' as const, text: `•  ${f}` })));
  if (i.location.trim()) blocks.push({ t: 'h1', text: 'Lage' }, ...i.location.trim().split(/\n{2,}/).map((p) => ({ t: 'p' as const, text: p.replace(/\n/g, ' ') })));
  const energy: [string, string][] = [];
  const push = (k: string, v?: string) => { if (v?.trim()) energy.push([k, v.trim()]); };
  push('Art des Energieausweises', prop.eaType);
  push('Energiekennwert', prop.eaValue ? `${prop.eaValue.trim()} kWh/(m²·a)` : '');
  push('Effizienzklasse', prop.eaClass);
  push('Wesentlicher Energieträger', prop.energySource);
  push('Baujahr', prop.yearBuilt);
  push('Heizungsart', prop.heatingType);
  push('Ausweis gültig bis', prop.eaValidUntil ? prop.eaValidUntil.split('-').reverse().join('.') : '');
  return {
    title: i.title.trim() || 'Wohnungsangebot', address: exposeAddress(prop, i.hideHouseNo), date: now, logo: s.logo || undefined,
    headline: `${eur(i.rent)} Kaltmiete · ${num(unit.area)} m²${unit.rooms > 0 ? ` · ${num(unit.rooms)} Zimmer` : ''}`,
    facts, blocks, energy, contact: senderLines(s),
  };
}
