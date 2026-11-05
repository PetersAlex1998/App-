import { DB, Property } from './types';
import { energyMissing } from './expose';
import { kindOf, today } from './calc';

/**
 * „Haus fertig einrichten“: Checkliste der Angaben, die für Abrechnung, Mieterhöhung, Exposé, Rendite und Erinnerungen gebraucht werden.
 * Schritte, die für ein Haus nicht passen (z. B. kein Darlehen), lassen sich als „nicht nötig“ abhaken.
 */
export interface SetupItem {
  id: string; title: string; detail: string; done: boolean; skipped: boolean;
  core?: boolean; // ohne diese Angabe sind Briefe und Abrechnungen unvollständig
  skippable?: boolean;
  screen: string; params: Record<string, string>;
}
export interface Setup { items: SetupItem[]; done: number; total: number; coreOpen: number; open: SetupItem[] }

export function houseSetup(db: DB, p: Property, now = today()): Setup {
  const units = db.units.filter((u) => u.propertyId === p.id);
  const living = units.filter((u) => kindOf(u) !== 'gewerbe');
  const noArea = units.filter((u) => !(u.area > 0));
  const skip = new Set(p.setupSkip ?? []);
  const miss = energyMissing(p);
  const expired = !!p.eaValidUntil && p.eaValidUntil < now;
  const edit = { screen: 'PropertyForm', params: { id: p.id } };
  const raw: Omit<SetupItem, 'skipped'>[] = [
    { id: 'adresse', title: 'Adresse', core: true, done: !!(p.street.trim() && p.zip.trim() && p.city.trim()), detail: p.street.trim() && p.zip.trim() && p.city.trim() ? `${p.street}, ${p.zip} ${p.city}` : `Es fehlt: ${[!p.street.trim() && 'Straße', !p.zip.trim() && 'PLZ', !p.city.trim() && 'Ort'].filter(Boolean).join(', ')}. Steht in Briefen und im Exposé.`, ...edit },
    { id: 'einheiten', title: 'Wohnungen und Gewerbe', core: true, done: units.length > 0, detail: units.length ? `${units.length} Einheit${units.length === 1 ? '' : 'en'} angelegt` : 'Noch keine Einheit angelegt.', screen: units.length ? 'PropertyDetail' : 'UnitForm', params: units.length ? { id: p.id } : { propertyId: p.id } },
    { id: 'flaechen', title: 'Flächen', core: true, done: units.length > 0 && noArea.length === 0, detail: units.length === 0 ? 'Zuerst Einheiten anlegen.' : noArea.length ? `${noArea.length} Einheit${noArea.length === 1 ? '' : 'en'} ohne Fläche (${noArea.slice(0, 3).map((u) => u.name).join(', ')}${noArea.length > 3 ? ' …' : ''}). Nötig für die Nebenkostenabrechnung.` : 'Alle Flächen eingetragen.', screen: noArea.length ? 'UnitDetail' : 'PropertyDetail', params: { id: noArea[0]?.id ?? p.id } },
    { id: 'kauf', title: 'Kaufpreis und Marktwert', skippable: true, done: !!(p.purchasePrice?.trim() && p.marketValue?.trim()), detail: p.purchasePrice?.trim() && p.marketValue?.trim() ? 'Für Rendite und Beleihung eingetragen.' : `Für Rendite und Beleihung im Portfolio. Es fehlt: ${[!p.purchasePrice?.trim() && 'Kaufpreis', !p.marketValue?.trim() && 'Marktwert'].filter(Boolean).join(', ')}.`, ...edit },
    { id: 'energie', title: 'Energieausweis', skippable: true, done: miss.length === 0 && !expired, detail: miss.length ? `Es fehlt: ${miss.join(', ')}. Pflicht in Anzeigen und Exposés.` : expired ? 'Der Energieausweis ist abgelaufen.' : 'Angaben vollständig.', ...edit },
    { id: 'mietspiegel', title: 'Mietspiegel', done: !!p.rentBasis || living.length === 0, detail: p.rentBasis || living.length === 0 ? (living.length === 0 ? 'Nur Gewerbe, kein Mietspiegel nötig.' : 'Festgelegt.') : 'Gibt es für den Ort einen Mietspiegel? Grundlage für Mieterhöhungen.', screen: 'Mietspiegel', params: { propertyId: p.id } },
    { id: 'zaehler', title: 'Zähler', skippable: true, done: db.meters.some((m) => m.propertyId === p.id), detail: db.meters.some((m) => m.propertyId === p.id) ? `${db.meters.filter((m) => m.propertyId === p.id).length} Zähler angelegt` : 'Heizung, Wasser und Strom für die Abrechnung nach Verbrauch.', screen: 'MeterForm', params: { propertyId: p.id } },
    { id: 'darlehen', title: 'Darlehen', skippable: true, done: db.loans.some((l) => l.propertyId === p.id), detail: db.loans.some((l) => l.propertyId === p.id) ? `${db.loans.filter((l) => l.propertyId === p.id).length} erfasst` : 'Für Zinsen in der Steuer, Restschuld und Zinsbindung. Ohne Darlehen: „Nicht nötig“.', screen: 'LoanForm', params: { propertyId: p.id } },
    { id: 'versicherung', title: 'Gebäudeversicherung', skippable: true, done: !!p.insurer?.trim(), detail: p.insurer?.trim() ? p.insurer : 'Versicherer, Police und Prämie.', ...edit },
    { id: 'wartung', title: 'Prüfungen und Wartung', skippable: true, done: db.checks.some((c) => c.propertyId === p.id), detail: db.checks.some((c) => c.propertyId === p.id) ? `${db.checks.filter((c) => c.propertyId === p.id).length} Prüfungen angelegt` : 'Heizung, Rauchmelder, Schornsteinfeger. Die App macht Vorschläge.', screen: 'Wartung', params: { propertyId: p.id } },
    { id: 'kontakt', title: 'Ansprechpartner', skippable: true, done: !!(p.contactName?.trim() || p.contactPhone?.trim()), detail: p.contactName?.trim() ? `${p.contactName}${p.contactPhone ? ` · ${p.contactPhone}` : ''}` : 'Hausmeister oder Verwalter für Rückfragen.', ...edit },
  ];
  const items: SetupItem[] = raw.map((i) => ({ ...i, skipped: !i.done && !!i.skippable && skip.has(i.id) }));
  const counted = items.filter((i) => !i.skipped);
  const open = counted.filter((i) => !i.done);
  return { items, done: counted.length - open.length, total: counted.length, coreOpen: open.filter((i) => i.core).length, open };
}
