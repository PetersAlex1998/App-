import { DB, Payment, Property, Tenant, Unit, emptyDB } from '../../src/types';

let n = 0;
export const resetIds = () => { n = 0; };
const id = (p: string) => `${p}${++n}`;

export const property = (o: Partial<Property> = {}): Property => ({ id: id('p'), name: 'Haus A', street: 'Lindenstr. 12', zip: '50667', city: 'Köln', yearBuilt: '', notes: '', ...o });
export const unit = (propertyId: string, o: Partial<Unit> = {}): Unit => ({ id: id('u'), propertyId, name: 'Wohnung 1', area: 60, rooms: 2, coldRent: 640, advance: 160, ...o });
export const tenant = (unitId: string, o: Partial<Tenant> = {}): Tenant => ({ id: id('t'), unitId, name: 'Anna Schmidt', email: '', phone: '', moveIn: '2024-01-01', moveOut: '', deposit: 0, ...o });
export const payment = (tenantId: string, month: string, amount: number, o: Partial<Payment> = {}): Payment => ({ id: id('z'), tenantId, date: `${month}-03`, month, amount, kind: 'miete', note: '', ...o });
export const dbWith = (o: Partial<DB>): DB => ({ ...emptyDB, ...o });

/** Ein Haus mit einer Wohnung und einem Mieter (Standardfall). */
export function simple(tenantOver: Partial<Tenant> = {}, unitOver: Partial<Unit> = {}) {
  const p = property({ houseNo: 1 });
  const u = unit(p.id, { no: 1, ...unitOver });
  const t = tenant(u.id, tenantOver);
  return { p, u, t, db: dbWith({ properties: [p], units: [u], tenants: [t] }) };
}

/** Realistischer Großbestand: 7 Häuser, 88 Einheiten, ~2.000 Zahlungen (für Mengen- und Geschwindigkeitstests). */
export function bigDb(): DB {
  const first = ['Anna', 'Max', 'Lena', 'Jonas', 'Sophie', 'Paul', 'Emma', 'Felix', 'Mia', 'Lukas', 'Hannah', 'Leon', 'Marie', 'Tim', 'Laura', 'Jan', 'Julia', 'Ben', 'Lisa', 'Noah'];
  const last = ['Schmidt', 'Becker', 'Wolf', 'Klein', 'Meier', 'Fischer', 'Weber', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Bauer', 'Schulz', 'Neumann', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lange', 'Werner'];
  const db = { ...emptyDB, properties: [] as Property[], units: [] as Unit[], tenants: [] as Tenant[], payments: [] as Payment[], reminders: [] as DB['reminders'], costs: [] as DB['costs'], meters: [] as DB['meters'], readings: [] as DB['readings'], documents: [] as DB['documents'] };
  const months: string[] = [];
  for (let y = 2024, m = 11; ; m++) { if (m > 12) { m = 1; y++; } months.push(`${y}-${String(m).padStart(2, '0')}`); if (y === 2026 && m === 11) break; }
  let gewerbeLeft = 17, k = 0, seq = 0;
  [12, 12, 12, 12, 12, 12, 16].forEach((count, h) => {
    const p: Property = { id: 'bp' + (h + 1), name: `Haus ${h + 1}`, street: 'Str. ' + (h + 1), zip: '50667', city: 'Köln', yearBuilt: '1990', notes: '', houseNo: h + 1 };
    db.properties.push(p);
    let w = 0, g = 0;
    for (let i = 0; i < count; i++) {
      const gew = gewerbeLeft > 0 && (i % 4 === 3 || (h === 6 && i > 11));
      if (gew) gewerbeLeft--;
      const no = gew ? ++g : ++w;
      k++;
      const u: Unit = { id: 'bu' + k, propertyId: p.id, kind: gew ? 'gewerbe' : k === 40 ? 'eigentum' : 'wohnung', vat: gew ? 19 : 0, no, name: `${gew ? 'Gewerbe' : 'Wohnung'} ${no}`, area: 45 + (k * 7) % 60, rooms: 2, coldRent: 500 + (k * 37) % 600, advance: 120 + (k * 11) % 100 };
      db.units.push(u);
      db.meters.push({ id: 'bm' + k, propertyId: p.id, unitId: u.id, type: 'wasser_kalt', number: 'W' + (1000 + k) });
      [['2024-12-31', 100], ['2025-12-31', 160]].forEach(([d, v]) => db.readings.push({ id: 'br' + ++seq, meterId: 'bm' + k, date: d as string, value: (v as number) + (k % 9) * 5 }));
      if (k % 11 === 0) continue; // Leerstand
      const t: Tenant = { id: 'bt' + k, unitId: u.id, name: `${first[k % 20]} ${last[(k * 3) % 20]}`, salutation: k % 2 ? 'Frau' : 'Herr', email: '', phone: '', moveIn: '2022-03-01', moveOut: '', deposit: 0, trackFrom: '2024-11', iban: 'DE' + String(10000000000000000000 + k) };
      db.tenants.push(t);
      const due = Math.round((u.coldRent + u.advance) * (gew ? 1.19 : 1) * 100) / 100;
      months.forEach((mo, i) => {
        if ((k % 10 === 0 && i >= months.length - 3) || (k % 7 === 0 && i >= months.length - 1)) return; // Rückstände
        db.payments.push({ id: 'bz' + ++seq, tenantId: t.id, date: mo + '-03', month: mo, amount: due, kind: 'miete', note: '' });
      });
    }
  });
  return db;
}
