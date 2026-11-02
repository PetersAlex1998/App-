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

export interface Unit {
  id: ID;
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
}

export type CostKey = 'area' | 'units';

export interface Cost {
  id: ID;
  propertyId: ID;
  year: number;
  category: string;
  amount: number;
  key: CostKey; // Verteilerschlüssel
}

export interface DB {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  payments: Payment[];
  reminders: Reminder[];
  costs: Cost[];
}

export type Kind = keyof DB;
export const emptyDB: DB = {
  properties: [],
  units: [],
  tenants: [],
  payments: [],
  reminders: [],
  costs: [],
};
