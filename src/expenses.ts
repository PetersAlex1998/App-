import { DB, Expense, ExpenseCategory } from './types';
import { loanInterest } from './loans';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['instandhaltung', 'betriebskosten', 'hausmeister', 'verwaltung', 'versicherung', 'grundsteuer', 'schuldzinsen', 'afa', 'fahrtkosten', 'sonstiges'];

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  instandhaltung: 'Reparatur und Instandhaltung', betriebskosten: 'Betriebskosten (Wasser, Müll, Heizung …)', hausmeister: 'Hausmeister und Reinigung',
  verwaltung: 'Verwaltung und Beratung', versicherung: 'Versicherungen', grundsteuer: 'Grundsteuer', schuldzinsen: 'Schuldzinsen',
  afa: 'Abschreibung (AfA)', fahrtkosten: 'Fahrtkosten', sonstiges: 'Sonstige Werbungskosten',
};
/** Kurzbezeichnung nach Zeilen der Anlage V (Vermietung und Verpachtung). */
export const ANLAGE_V_HINT: Record<ExpenseCategory, string> = {
  instandhaltung: 'Erhaltungsaufwendungen', betriebskosten: 'Umlagefähige und sonstige Betriebskosten', hausmeister: 'Hausmeister, Reinigung, Gartenpflege',
  verwaltung: 'Verwaltungskosten, Steuerberatung', versicherung: 'Gebäudeversicherung u. a.', grundsteuer: 'Grundsteuer', schuldzinsen: 'Schuldzinsen',
  afa: 'Absetzung für Abnutzung', fahrtkosten: 'Fahrten zum Objekt', sonstiges: 'Übrige Werbungskosten',
};

export const inYear = (iso: string, year: number) => iso.startsWith(`${year}-`);

export function expensesOf(db: DB, opts: { propertyId?: string; year?: number } = {}): Expense[] {
  return db.expenses
    .filter((e) => (!opts.propertyId || e.propertyId === opts.propertyId) && (opts.year === undefined || inYear(e.date, opts.year)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface AnlageV {
  year: number;
  income: number; // Mieteinnahmen inkl. Nebenkostenvorauszahlungen und Nachzahlungen (Zuflussprinzip)
  byCategory: { category: ExpenseCategory; amount: number }[];
  expenses: number;
  surplus: number; // Einnahmen minus Werbungskosten
  noReceipt: number; // Anzahl Ausgaben ohne Beleg
  fromLoans: number; // darin enthaltene, aus Darlehen berechnete Schuldzinsen
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Einnahmen und Werbungskosten eines Jahres, für ein Haus oder den gesamten Bestand. Kaution zählt nicht als Einnahme. */
export function anlageV(db: DB, year: number, propertyId?: string): AnlageV {
  const unitIds = new Set(db.units.filter((u) => !propertyId || u.propertyId === propertyId).map((u) => u.id));
  const tenantIds = new Set(db.tenants.filter((t) => unitIds.has(t.unitId)).map((t) => t.id));
  const income = db.payments.filter((p) => tenantIds.has(p.tenantId) && p.kind !== 'kaution' && inYear(p.date, year)).reduce((s, p) => s + p.amount, 0);
  const list = expensesOf(db, { propertyId, year });
  // Schuldzinsen aus Darlehen: nur für Häuser, für die in dem Jahr keine Schuldzinsen als Ausgabe erfasst wurden (keine doppelte Zählung)
  const fromLoans = round(db.properties.filter((p) => (!propertyId || p.id === propertyId) && !list.some((e) => e.propertyId === p.id && e.category === 'schuldzinsen')).reduce((s, p) => s + loanInterest(db, year, p.id), 0));
  const byCategory = EXPENSE_CATEGORIES.map((category) => ({ category, amount: round(list.filter((e) => e.category === category).reduce((s, e) => s + e.amount, 0) + (category === 'schuldzinsen' ? fromLoans : 0)) })).filter((x) => x.amount !== 0);
  const expenses = round(byCategory.reduce((s, x) => s + x.amount, 0));
  return { year, income: round(income), byCategory, expenses, surplus: round(income - expenses), noReceipt: list.filter((e) => !e.receiptId).length, fromLoans };
}

const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
/** CSV für den Steuerberater (Semikolon, deutsche Zahlen). */
export function expensesCsv(db: DB, year: number, propertyId?: string): string {
  const head = ['Datum', 'Haus', 'Kategorie', 'Lieferant', 'Beschreibung', 'Betrag', 'Umlagefähig', 'Beleg'];
  const rows = expensesOf(db, { propertyId, year }).slice().reverse().map((e) => {
    const p = db.properties.find((x) => x.id === e.propertyId);
    const [y, m, d] = e.date.split('-');
    return [`${d}.${m}.${y}`, p?.name ?? '', EXPENSE_LABEL[e.category], e.vendor, e.description, e.amount.toFixed(2).replace('.', ','), e.allocatable ? 'ja' : 'nein', e.receiptId ? 'ja' : 'nein'].map(q).join(';');
  });
  return [head.map(q).join(';'), ...rows].join('\r\n');
}
