export type ID = string;

export interface Property {
  id: ID;
  name: string;
  street: string;
  zip: string;
  city: string;
  yearBuilt: string;
  notes: string;
  houseNo?: number; // Haus-Nr. -> Haus-ID „H03“
  coverId?: string; // Dokument-ID des Titelbilds
  // Gebäude und Technik
  plotArea?: string; floors?: string; heatingType?: string; heatingYear?: string; energySource?: string;
  // Energieausweis
  eaType?: string; eaValue?: string; eaClass?: string; eaIssued?: string; eaValidUntil?: string;
  // Grundbuch und Kauf
  landRegister?: string; parcel?: string; purchaseDate?: string; purchasePrice?: string;
  // Versicherung
  insurer?: string; policyNo?: string; premium?: string;
  // Ansprechpartner (Hausmeister, Verwalter)
  contactName?: string; contactPhone?: string;
}

export type UnitKind = 'wohnung' | 'gewerbe' | 'eigentum';

export interface Unit {
  id: ID;
  kind?: UnitKind; // fehlt = Wohnung
  no?: number; // laufende Nummer im Haus („Wohnung 12“) -> Wohnungs-ID „H03-W12“
  vat?: number; // USt-Satz in % (nur Gewerbe mit Umsatzsteuer-Option)
  propertyId: ID;
  name: string; // z. B. "WE 3, 2. OG links"
  area: number; // m²
  rooms: number;
  coldRent: number; // Kaltmiete / Monat
  advance: number; // NK-Vorauszahlung / Monat
  floor?: string; position?: string; balcony?: string; cellar?: string; parking?: string; kitchen?: string; equipment?: string; notes?: string;
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
  salutation?: string; mobile?: string; postalAddress?: string; emergencyContact?: string;
  contractEnd?: string; noticeMonths?: string; rentAdjust?: string; nextAdjust?: string;
  depositType?: string; depositAccount?: string; notes?: string;
  nkDone?: Record<string, string>; // Jahr -> Datum, an dem die Nebenkostenabrechnung erstellt wurde
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
  // Herkunft der Buchung (Nachweis). Fehlt bei älteren Einträgen = manuell.
  source?: 'manuell' | 'import';
  createdAt?: string; // ISO-Zeitpunkt der Erfassung
  editedAt?: string; // ISO-Zeitpunkt der letzten Änderung
  payer?: string; // Absender laut Kontoauszug
  importId?: string; // gleiche ID = gleicher Import (für „Import rückgängig“)
  importLabel?: string; // z. B. „Kontoauszug-Import 03.11.2026 · auszug.csv“
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
  consumptionShare?: number; // % nach Verbrauch (Rest = Grundkosten nach Wohnfläche); fehlt = 100
}

export type DocOwner = 'property' | 'unit' | 'tenant';
export type DocCategory = 'energieausweis' | 'mietvertrag' | 'foto' | 'versicherung' | 'grundbuch' | 'rechnung' | 'protokoll' | 'brief' | 'sonstiges';
export interface Doc {
  id: ID;
  ownerKind: DocOwner;
  ownerId: ID;
  category: DocCategory;
  name: string;
  mime: string;
  size: number;
  added: string; // YYYY-MM-DD
  validUntil?: string; // z. B. Energieausweis, Versicherung
  note?: string;
  // Briefe (Kategorie 'brief'): Versandstatus
  status?: 'bereit' | 'versendet';
  sentAt?: string;
  channel?: string;
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
  documents: Doc[];
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
  documents: [],
};
