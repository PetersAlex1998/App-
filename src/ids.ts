import { DB, Property, Unit, UnitKind } from './types';

/**
 * Eindeutige Kennungen:
 *  Haus-ID      H03        (laufende Haus-Nr.)
 *  Wohnungs-ID  H03-W12    (Haus + W für Wohnung/Eigentum, G für Gewerbe + Nummer wie im Namen „Wohnung 12“)
 * Die Wohnungs-ID ist der Verwendungszweck, den Mieter bei jeder Zahlung angeben.
 */
export const pad = (n: number) => String(n).padStart(2, '0');
export const houseId = (p?: Pick<Property, 'houseNo'>) => (p?.houseNo ? `H${pad(p.houseNo)}` : '');
export const unitLetter = (kind?: UnitKind) => (kind === 'gewerbe' ? 'G' : 'W');
export const unitPrefix = (kind?: UnitKind) => (kind === 'gewerbe' ? 'Gewerbe' : 'Wohnung');
export const unitRef = (p?: Pick<Property, 'houseNo'>, u?: Pick<Unit, 'kind' | 'no'>) => (houseId(p) && u?.no ? `${houseId(p)}-${unitLetter(u.kind)}${pad(u.no)}` : '');
export const defaultUnitName = (kind: UnitKind | undefined, no: number) => `${unitPrefix(kind)} ${no}`;

export const nextHouseNo = (db: DB, exceptId?: string) => Math.max(0, ...db.properties.filter((p) => p.id !== exceptId).map((p) => p.houseNo ?? 0)) + 1;
export const nextUnitNo = (db: DB, propertyId: string, kind?: UnitKind, exceptId?: string) =>
  Math.max(0, ...db.units.filter((u) => u.propertyId === propertyId && unitLetter(u.kind) === unitLetter(kind) && u.id !== exceptId).map((u) => u.no ?? 0)) + 1;

/** Nummer aus dem Namen lesen: „Wohnung 12“ -> 12, „WE 3, 1. OG“ -> 3. */
export function numberFromName(name: string): number | undefined {
  const m = name.match(/(?:wohnung|gewerbe|einheit|we|ge|app(?:artement)?)\D{0,3}(\d{1,3})/i) ?? name.match(/^\D*(\d{1,3})\D*$/);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : undefined;
}

/** Ergänzt fehlende IDs und löst Doppelungen auf. Gibt dasselbe Objekt zurück, wenn nichts zu tun ist. */
export function normalizeIds(db: DB): DB {
  let changed = false;
  // Feste Haus-Nummern behalten (erste gewinnt), alle anderen füllen die niedrigsten freien Nummern auf
  const used = new Set<number>();
  const fixed = db.properties.map((p) => (p.houseNo && !used.has(p.houseNo) ? (used.add(p.houseNo), true) : false));
  const properties = db.properties.map((p, i) => {
    if (fixed[i]) return p;
    let n = 1;
    while (used.has(n)) n++;
    used.add(n); changed = true;
    return { ...p, houseNo: n };
  });
  const taken = new Map<string, Set<number>>();
  const key = (u: Unit) => `${u.propertyId}|${unitLetter(u.kind)}`;
  const claim = (u: Unit, n: number) => { const k = key(u); if (!taken.has(k)) taken.set(k, new Set()); taken.get(k)!.add(n); };
  // Erst feste Nummern reservieren (erste gewinnt), dann Lücken füllen
  const keep = db.units.map((u) => {
    if (u.no && !(taken.get(key(u))?.has(u.no))) { claim(u, u.no); return true; }
    return false;
  });
  const units = db.units.map((u, i) => {
    if (keep[i]) return u;
    const k = key(u);
    const set = taken.get(k) ?? new Set<number>();
    const parsed = numberFromName(u.name);
    let n = parsed && !set.has(parsed) ? parsed : Math.max(0, ...set) + 1;
    while (set.has(n)) n++;
    claim(u, n); changed = true;
    return { ...u, no: n };
  });
  return changed ? { ...db, properties, units } : db;
}
