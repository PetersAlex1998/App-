export type ID = string;

export interface Property {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
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
  landRegister?: string; parcel?: string; purchaseDate?: string; purchasePrice?: string; marketValue?: string;
  // Versicherung
  insurer?: string; policyNo?: string; premium?: string;
  // Begründung für Mieterhöhungen (§ 558a BGB): gibt es für den Ort einen Mietspiegel?
  rentBasis?: { kind: 'eigene' | 'andere' | 'keiner'; name?: string; gemeinde?: string; stand?: string; validUntil?: string; qualified?: boolean };
  // Ansprechpartner (Hausmeister, Verwalter)
  contactName?: string; contactPhone?: string;
}

/** Stand von Kaltmiete und NK-Vorauszahlung ab einem Datum (Mietverlauf). Die Felder der Einheit gelten vor dem ersten Eintrag. */
export interface RentTerm { from: string; coldRent: number; advance: number; reason?: string }
export type UnitKind = 'wohnung' | 'gewerbe' | 'eigentum';

export interface Unit {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
  kind?: UnitKind; // fehlt = Wohnung
  no?: number; // laufende Nummer im Haus („Wohnung 12“) -> Wohnungs-ID „H03-W12“
  vat?: number; // USt-Satz in % (nur Gewerbe mit Umsatzsteuer-Option)
  propertyId: ID;
  name: string; // z. B. "WE 3, 2. OG links"
  area: number; // m²
  rooms: number;
  mietspiegel?: { mean: number; upper?: number; lower?: number; note?: string; date: string }; // Einordnung dieser Wohnung im Mietspiegel (€ pro m²)
  terms?: RentTerm[]; // Mietverlauf: spätere Änderungen von Miete und Vorauszahlung (aufsteigend nach Datum)
  coldRent: number; // Kaltmiete / Monat (Stand vor dem ersten Eintrag in `terms`)
  advance: number; // NK-Vorauszahlung / Monat
  floor?: string; position?: string; balcony?: string; cellar?: string; parking?: string; kitchen?: string; equipment?: string; notes?: string;
}

export interface Tenant {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
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
  coldRent?: number; // Kaltmiete (netto) während der Mietzeit, für die Mieterhistorie der Wohnung
  rentChange?: { from: string; coldRent: number; kind: 'vergleich' | 'index' | 'staffel'; letterDate: string; consentUntil?: string }; // angekündigte Mieterhöhung
  advanceChange?: { from: string; amount: number; letterDate: string }; // angekündigte neue NK-Vorauszahlung (gilt ab `from`)
  depositInterest?: number; // aufgelaufene Zinsen auf die Kaution (gehören dem Mieter)
  depositPlaced?: string; // YYYY-MM-DD: getrennt vom Vermögen angelegt (§ 551 Abs. 3 BGB)
  depositReturned?: { date: string; amount: number; note?: string }; // Kaution zurückgezahlt
  moveSteps?: Record<string, string>; // Mieterwechsel: Schritt -> Datum, an dem er von Hand als erledigt markiert wurde
  trackFrom?: string; // YYYY-MM: erst ab diesem Monat zählen Mieten als offen (ältere Monate sind außerhalb der App erledigt)
}

export type PaymentKind = 'miete' | 'kaution' | 'nachzahlung';

export interface Payment {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
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
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
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
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
  propertyId: ID;
  unitId: ID; // '' = Allgemein (Haus)
  type: MeterType;
  number: string;
}
export interface Reading {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
  meterId: ID;
  date: string; // YYYY-MM-DD
  value: number;
}

/** Darlehen zu einem Haus: Grundlage für Zinsen (Anlage V), Restschuld und Zinsbindung. */
export interface Loan {
  id: ID;
  updatedAt?: string;
  propertyId: ID;
  name: string; // Bank oder Bezeichnung
  amount: number; // ursprünglicher Darlehensbetrag
  start: string; // YYYY-MM-DD: Datum der ersten Rate
  rate: number; // Sollzins in % pro Jahr
  repayment?: number; // anfängliche Tilgung in % pro Jahr (wenn keine feste Rate)
  payment?: number; // feste Rate pro Monat in € (hat Vorrang)
  fixedUntil?: string; // YYYY-MM-DD: Ende der Zinsbindung
  anchor?: { date: string; balance: number }; // Restschuld laut Bank an einem Stichtag (genauer als der Plan ab Start)
  specials?: { date: string; amount: number }[]; // Sondertilgungen
  notes?: string;
}

export interface Cost {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
  propertyId: ID;
  year: number;
  category: string;
  amount: number;
  key: CostKey; // Verteilerschlüssel
  meterType?: MeterType; // bei key = 'consumption'
  consumptionShare?: number; // % nach Verbrauch (Rest = Grundkosten nach Wohnfläche); fehlt = 100
  fromExpenses?: boolean; // aus den Ausgaben (umlagefähig) übernommen; wird bei erneutem Übernehmen aktualisiert
}

export type ExpenseCategory = 'schuldzinsen' | 'grundsteuer' | 'versicherung' | 'instandhaltung' | 'verwaltung' | 'betriebskosten' | 'hausmeister' | 'fahrtkosten' | 'afa' | 'sonstiges';
export interface Expense {
  id: ID;
  updatedAt?: string;
  propertyId: ID;
  date: string; // YYYY-MM-DD (Zahlungsdatum, maßgeblich für die Steuer)
  amount: number; // brutto, immer positiv
  category: ExpenseCategory;
  vendor: string; // Lieferant / Handwerker
  description: string;
  receiptId?: ID; // Dokument-ID des Belegs
  allocatable?: boolean; // umlagefähig auf Mieter (Hinweis für die Nebenkosten)
  issueId?: ID; // gehört zu einer Schadensmeldung
}

/** Handwerker und Dienstleister. */
export interface Contractor {
  id: ID;
  updatedAt?: string;
  name: string;
  trade: string; // Gewerk, z. B. Sanitär, Elektro
  phone: string;
  email: string;
  notes?: string;
}

export type IssueStatus = 'offen' | 'beauftragt' | 'erledigt';
/** Schadensmeldung oder Auftrag an einem Haus oder einer Wohnung. */
export interface Issue {
  id: ID;
  updatedAt?: string;
  propertyId: ID;
  unitId?: ID; // fehlt = Haus allgemein (Treppenhaus, Dach, Heizung …)
  tenantId?: ID; // gemeldet von
  title: string;
  description?: string;
  reported: string; // YYYY-MM-DD
  urgent?: boolean;
  status: IssueStatus;
  contractorId?: ID;
  ordered?: string; // Datum der Beauftragung
  done?: string; // Datum der Erledigung
}

/** Wiederkehrende Prüfung oder Wartung an einem Haus (Heizung, Rauchmelder, Schornsteinfeger, Legionellen …). */
export interface Check {
  id: ID;
  updatedAt?: string;
  propertyId: ID;
  title: string;
  preset?: string; // Schlüssel der Vorlage
  intervalMonths: number;
  last?: string; // YYYY-MM-DD: zuletzt erledigt
  due?: string; // YYYY-MM-DD: nächster Termin, wenn abweichend oder noch nie erledigt
  history?: string[]; // frühere Erledigungen
  contractorId?: ID;
  notes?: string;
}

export interface Calculation {
  id: ID;
  updatedAt?: string;
  name: string; // Adresse oder Bezeichnung des Kaufobjekts
  createdAt: string; // ISO
  input: import('./calculator').CalcInput;
}

export type DocOwner = 'property' | 'unit' | 'tenant';
export type DocCategory = 'energieausweis' | 'mietvertrag' | 'foto' | 'versicherung' | 'grundbuch' | 'rechnung' | 'protokoll' | 'brief' | 'sonstiges';
export interface Doc {
  id: ID;
  updatedAt?: string; // letzte Änderung (Grundlage für den späteren Cloud-Abgleich)
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
  expenses: Expense[];
  loans: Loan[];
  issues: Issue[];
  contractors: Contractor[];
  checks: Check[];
  calculations: Calculation[];
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
  expenses: [],
  loans: [],
  issues: [],
  contractors: [],
  checks: [],
  calculations: [],
  meters: [],
  readings: [],
  documents: [],
};
