export type ID = string;

export interface Property {
  id: ID;
  name: string;
  street: string;
  zip: string;
  city: string;
  yearBuilt: string;
  notes: string;
}

export type UnitKind = 'wohnung' | 'gewerbe' | 'eigentum';

export interface Unit {
  id: ID;
  kind?: UnitKind; // fehlt = Wohnung
  vat?: number; // USt-Satz in % (nur Gewerbe mit Umsatzsteuer-Option)
  propertyId: ID;
  name: string; // z. B. "WE 3, 2. OG links"
  area: number; // m²
  rooms: number;
  coldRent: number; // Kaltmiete / Monat
  advance: number; // NK-Vorauszahlung / Monat
}

export interface Tenant {
  id: ID;
  unitId: ID;
  name: string;
  email: string;
  phone: string;
  moveIn: string; // YYYY-MM-DD
  moveOut: string; // YYYY-MM-DD oder ''
  deposit: number;
  iban?: string; // für die automatische Zuordnung von Kontoauszügen
  trackFrom?: string; // YYYY-MM: erst ab diesem Monat zählen Mieten als offen (ältere Monate sind außerhalb der App erledigt)
}

export type PaymentKind = 'miete' | 'kaution' | 'nachzahlung';

export interface Payment {
  id: ID;
  tenantId: ID;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM (Zuordnung bei Miete)
  amount: number;
  kind: PaymentKind;
  note: string;
}

export interface Reminder {
  id: ID;
  tenantId: ID;
  date: string;
  level: 1 | 2 | 3; // Zahlungserinnerung, 1. Mahnung, 2. Mahnung
  amount: number; // offener Betrag
  fee: number; // Mahngebühr
  deadline: string;
  items?: { month: string; due: number; paid: number; open: number }[]; // Stand zum Zeitpunkt der Mahnung
}

export type CostKey = 'area' | 'units' | 'consumption';
export type MeterType = 'wasser_kalt' | 'wasser_warm' | 'heizung' | 'strom' | 'gas';

export interface Meter {
  id: ID;
  propertyId: ID;
  unitId: ID; // '' = Allgemein (Haus)
  type: MeterType;
  number: string;
}
export interface Reading {
  id: ID;
  meterId: ID;
  date: string; // YYYY-MM-DD
  value: number;
}

export interface Cost {
  id: ID;
  propertyId: ID;
  year: number;
  category: string;
  amount: number;
  key: CostKey; // Verteilerschlüssel
  meterType?: MeterType; // bei key = 'consumption'
}

export interface DB {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  payments: Payment[];
  reminders: Reminder[];
  costs: Cost[];
  meters: Meter[];
  readings: Reading[];
}

export type Kind = keyof DB;
export const emptyDB: DB = {
  properties: [],
  units: [],
  tenants: [],
  payments: [],
  reminders: [],
  costs: [],
  meters: [],
  readings: [],
};
