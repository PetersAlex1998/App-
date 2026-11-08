import { DB } from './types';

/** Beispieldaten: Einzug 1.1. des Vorjahres; Anna hat die letzten 2 Monate nicht gezahlt → Rückstand, Mahnung und NK-Abrechnung testbar. */
export function demoData(): DB {
  const now = new Date();
  const y = now.getFullYear() - 1;
  const moveIn = `${y}-01-01`;
  // alle Monate seit Einzug bis heute
  const months: string[] = [];
  for (let yy = y, m = 1; yy < now.getFullYear() || m <= now.getMonth() + 1; m++) {
    if (m > 12) { m = 1; yy++; }
    months.push(`${yy}-${String(m).padStart(2, '0')}`);
    if (yy === now.getFullYear() && m === now.getMonth() + 1) break;
  }
  const pay = (id: string, tenantId: string, list: string[], amount: number) =>
    list.map((mo) => ({ id: `${id}-${mo}`, tenantId, date: `${mo}-03`, month: mo, amount, kind: 'miete' as const, note: '' }));
  return {
    expenses: [], loans: [], issues: [], contractors: [], firmCosts: [], firmInvoices: [], checks: [], calculations: [],
    properties: [{ id: 'demo-p1', name: 'Haus Lindenstraße', street: 'Lindenstr. 12', zip: '50667', city: 'Köln', yearBuilt: '1998', notes: 'Beispielobjekt' }],
    units: [
      { id: 'demo-u1', propertyId: 'demo-p1', name: 'WE 1, EG links', area: 62, rooms: 2, coldRent: 640, advance: 160 },
      { id: 'demo-u2', propertyId: 'demo-p1', name: 'WE 2, 1. OG', area: 85, rooms: 3, coldRent: 890, advance: 210 },
    ],
    tenants: [
      { id: 'demo-t1', unitId: 'demo-u1', name: 'Anna Schmidt', email: 'anna@example.de', phone: '0171 1234567', moveIn, moveOut: '', deposit: 1920 },
      { id: 'demo-t2', unitId: 'demo-u2', name: 'Max Becker', email: 'max@example.de', phone: '0172 7654321', moveIn, moveOut: '', deposit: 2670 },
    ],
    payments: [
      ...pay('demo-a', 'demo-t1', months.slice(0, -2), 800), // Anna: letzte 2 Monate offen
      ...pay('demo-b', 'demo-t2', months, 1100),
      { id: 'demo-k1', tenantId: 'demo-t1', date: moveIn, month: moveIn.slice(0, 7), amount: 1920, kind: 'kaution' as const, note: '' },
    ],
    meters: [
      { id: 'demo-m1', propertyId: 'demo-p1', unitId: 'demo-u1', type: 'wasser_kalt', number: 'W-1001' },
      { id: 'demo-m2', propertyId: 'demo-p1', unitId: 'demo-u2', type: 'wasser_kalt', number: 'W-1002' },
    ],
    readings: [
      { id: 'demo-r1', meterId: 'demo-m1', date: `${y - 1}-12-31`, value: 410 }, { id: 'demo-r2', meterId: 'demo-m1', date: `${y}-12-31`, value: 462 },
      { id: 'demo-r3', meterId: 'demo-m2', date: `${y - 1}-12-31`, value: 880 }, { id: 'demo-r4', meterId: 'demo-m2', date: `${y}-12-31`, value: 1004 },
    ],
    documents: [],
    reminders: [],
    costs: [
      { id: 'demo-c1', propertyId: 'demo-p1', year: y, category: 'Müllabfuhr', amount: 1200, key: 'area' },
      { id: 'demo-c2', propertyId: 'demo-p1', year: y, category: 'Wasser/Abwasser', amount: 3100, key: 'consumption', meterType: 'wasser_kalt' },
      { id: 'demo-c3', propertyId: 'demo-p1', year: y, category: 'Grundsteuer', amount: 1850, key: 'area' },
    ],
  };
}
