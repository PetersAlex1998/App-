import { Cost, CostKey, DB, Expense, ExpenseCategory, MeterType } from './types';
import { uid } from './uid';

/**
 * Betriebskosten aus den Ausgaben: Ausgaben mit „umlagefähig“ werden je Haus und Jahr zu Kostenpositionen der Nebenkostenabrechnung.
 */
const LABEL: Record<ExpenseCategory, string> = {
  betriebskosten: 'Betriebskosten', hausmeister: 'Hausmeister und Reinigung', versicherung: 'Gebäudeversicherung', grundsteuer: 'Grundsteuer', verwaltung: 'Verwaltung',
  instandhaltung: 'Instandhaltung', schuldzinsen: 'Schuldzinsen', afa: 'Abschreibung', fahrtkosten: 'Fahrtkosten', sonstiges: 'Sonstige Betriebskosten',
};
/** Gegen die Abrechnung nach Betriebskostenverordnung sprechen diese Arten, auch wenn sie als umlagefähig markiert sind. */
const NOT_ALLOCATABLE: ExpenseCategory[] = ['instandhaltung', 'verwaltung', 'schuldzinsen', 'afa', 'fahrtkosten'];

export interface CostSuggestion {
  id: string; // stabiler Schlüssel der Gruppe
  category: string; // Kostenart in der Abrechnung
  amount: number;
  expenseIds: string[];
  key: CostKey; meterType?: MeterType; consumptionShare?: number; // vorgeschlagene Verteilung
  existing?: Cost; // gleiche Kostenart im Haus und Jahr schon vorhanden
  warning?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\b(q[1-4]|[0-9][0-9./-]*)\b/g, '').replace(/[^a-z]+/g, ' ').trim();
const clean = (s: string) => s.replace(/\s*\b(Q[1-4]|[0-9][0-9./-]*)\b/gi, '').replace(/[\s,–-]+$/g, '').trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Kostenart eines Belegs: bei „Betriebskosten“ der Beschreibungstext (ohne Zahlen und Quartale), sonst die Kategorie. */
export function kostenart(e: Expense): string {
  if (e.category === 'betriebskosten' || e.category === 'sonstiges') {
    const d = clean((e.description || e.vendor || '').trim());
    if (d) return cap(d.slice(0, 40));
  }
  return LABEL[e.category];
}

/** Vorgeschlagene Verteilung nach Stichworten: Wasser und Heizung nach Verbrauch, alles andere nach Fläche. */
export function guessDistribution(name: string): { key: CostKey; meterType?: MeterType; consumptionShare?: number } {
  const n = name.toLowerCase();
  if (/heiz|gas\b|erdgas|öl\b|oel|fernwärme|fernwaerme|brennstoff|wärme|waerme/.test(n)) return { key: 'consumption', meterType: 'heizung', consumptionShare: 70 };
  if (/wasser/.test(n)) return { key: 'consumption', meterType: 'wasser_kalt', consumptionShare: 100 };
  return { key: 'area' };
}

export function suggestCosts(db: DB, propertyId: string, year: number): CostSuggestion[] {
  const list = db.expenses.filter((e) => e.propertyId === propertyId && e.allocatable && e.date.startsWith(`${year}-`));
  const groups = new Map<string, { name: string; items: Expense[] }>();
  for (const e of list) {
    const name = kostenart(e);
    const k = norm(name) || norm(LABEL[e.category]) || e.category;
    const g = groups.get(k) ?? { name, items: [] };
    g.items.push(e);
    groups.set(k, g);
  }
  const existing = db.costs.filter((c) => c.propertyId === propertyId && c.year === year);
  return [...groups.entries()].map(([k, g]) => {
    const dist = guessDistribution(g.name);
    const ex = existing.find((c) => norm(c.category) === k);
    const bad = g.items.find((e) => NOT_ALLOCATABLE.includes(e.category));
    return {
      id: k, category: g.name, amount: Math.round(g.items.reduce((s, e) => s + e.amount, 0) * 100) / 100, expenseIds: g.items.map((e) => e.id), ...dist, existing: ex,
      warning: bad ? `${LABEL[bad.category]} ist in der Regel nicht umlagefähig (Betriebskostenverordnung). Bitte prüfen.` : undefined,
    };
  }).sort((a, b) => b.amount - a.amount);
}

export interface Chosen { s: CostSuggestion; key: CostKey; meterType?: MeterType; consumptionShare?: number }

/** Gewählte Vorschläge als Kostenpositionen anlegen oder aktualisieren. Eine bereits aus Ausgaben stammende Position behält ihre Verteilung. */
export function applySuggestions(db: DB, propertyId: string, year: number, chosen: Chosen[], now = new Date().toISOString()): DB {
  let costs = [...db.costs];
  for (const { s, key, meterType, consumptionShare } of chosen) {
    const ex = s.existing && costs.find((c) => c.id === s.existing!.id);
    if (ex) {
      const keep = !!ex.fromExpenses;
      costs = costs.map((c) => (c.id === ex.id ? { ...c, amount: s.amount, fromExpenses: true, updatedAt: now, ...(keep ? {} : { key, meterType: key === 'consumption' ? meterType : undefined, consumptionShare: key === 'consumption' && (consumptionShare ?? 100) < 100 ? consumptionShare : undefined }) } : c));
    } else {
      costs.push({ id: uid(), updatedAt: now, propertyId, year, category: s.category, amount: s.amount, key, meterType: key === 'consumption' ? meterType : undefined, consumptionShare: key === 'consumption' && (consumptionShare ?? 100) < 100 ? consumptionShare : undefined, fromExpenses: true });
    }
  }
  return { ...db, costs };
}
