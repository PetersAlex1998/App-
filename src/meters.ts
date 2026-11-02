import { DB, Meter, MeterType, Reading } from './types';
import { addDays } from './calc';

export const METER_TYPES: MeterType[] = ['wasser_kalt', 'wasser_warm', 'heizung', 'strom', 'gas'];
export const meterTypeLabel = (t: MeterType) => ({ wasser_kalt: 'Kaltwasser', wasser_warm: 'Warmwasser', heizung: 'Heizung', strom: 'Allgemeinstrom', gas: 'Gas' })[t];
export const meterUnitLabel = (t: MeterType) => ({ wasser_kalt: 'm³', wasser_warm: 'm³', heizung: 'kWh', strom: 'kWh', gas: 'm³' })[t];
export const meterIcon = (t: MeterType) => ({ wasser_kalt: 'water', wasser_warm: 'thermometer', heizung: 'flame', strom: 'flash', gas: 'speedometer' })[t] as 'water';

export const readingsOf = (db: DB, meterId: string): Reading[] =>
  db.readings.filter((r) => r.meterId === meterId).sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);
export const latestReading = (db: DB, meterId: string) => readingsOf(db, meterId).slice(-1)[0];

export const fmtVal = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Stand am Stichtag: letzter Stand an oder vor dem Datum. */
function valueAt(list: Reading[], date: string): number | null {
  let v: number | null = null;
  for (const r of list) if (r.date <= date) v = r.value;
  return v;
}

export interface Consumption { value: number | null; estimatedStart: boolean }

/** Verbrauch aller Zähler eines Typs in einer Einheit im Zeitraum (from, to]. Fehlt der Anfangsstand, dient die erste Ablesung im Zeitraum (geschätzt). */
export function consumption(db: DB, unitId: string, type: MeterType, from: string, to: string): Consumption {
  const meters = db.meters.filter((m) => m.unitId === unitId && m.type === type);
  let total = 0;
  let any = false;
  let est = false;
  for (const m of meters) {
    const list = readingsOf(db, m.id);
    const end = valueAt(list, to);
    if (end === null) continue;
    let start = valueAt(list, from);
    if (start === null) {
      const first = list.find((r) => r.date > from && r.date <= to);
      if (!first || first.value === end) continue;
      start = first.value;
      est = true;
    }
    total += Math.max(0, end - start);
    any = true;
  }
  return { value: any ? Math.round(total * 1000) / 1000 : null, estimatedStart: est };
}

/** Verbrauch pro Jahr (31.12. Vorjahr bis 31.12.). */
export const yearRange = (year: number) => ({ from: `${year - 1}-12-31`, to: `${year}-12-31` });

export const meterLabel = (db: DB, m: Meter) => `${m.unitId ? db.units.find((u) => u.id === m.unitId)?.name ?? 'Einheit' : 'Haus allgemein'} · ${meterTypeLabel(m.type)}`;
export { addDays };
