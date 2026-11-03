import { ExpenseCategory } from './types';
import { EXPENSE_CATEGORIES } from './expenses';

/** Vom Auslesen eines Belegs (KI) erkannte Angaben, geprüft und bereinigt. Fehlende Angaben sind undefined. */
export interface ReceiptData {
  vendor?: string; date?: string; amount?: number; category?: ExpenseCategory; description?: string;
}

const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const addYear = (iso: string) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;

/**
 * Antwort der KI prüfen: nur plausible Werte übernehmen. Eine KI kann sich irren, deshalb nie ungeprüft in die Daten schreiben.
 * Unplausibel: Datum in ferner Zukunft oder vor 2000, Betrag ≤ 0 oder über 10 Mio. €, unbekannte Kategorie (→ „sonstiges“).
 */
export function normalizeReceipt(raw: unknown, now = new Date().toISOString().slice(0, 10)): ReceiptData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.readable === false) return null;
  const out: ReceiptData = {};
  if (typeof r.vendor === 'string' && r.vendor.trim()) out.vendor = r.vendor.trim().slice(0, 80);
  if (isIsoDate(r.date) && r.date >= '2000-01-01' && r.date <= addYear(now)) out.date = r.date;
  const amt = typeof r.amount === 'number' ? Math.abs(r.amount) : NaN;
  if (isFinite(amt) && amt > 0 && amt < 10_000_000) out.amount = Math.round(amt * 100) / 100;
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim().slice(0, 100);
  out.category = EXPENSE_CATEGORIES.includes(r.category as ExpenseCategory) ? (r.category as ExpenseCategory) : 'sonstiges';
  const filled = out.vendor || out.date || out.amount !== undefined || out.description;
  return filled ? out : null;
}

export interface ExpenseFields { amount: string; date: string; vendor: string; description: string; category: ExpenseCategory; categoryTouched: boolean; dateTouched: boolean }

/** Erkannte Werte in das Formular übernehmen, ohne etwas zu überschreiben, das schon eingegeben wurde. Liefert die Namen der ausgefüllten Felder. */
export function fillFromReceipt(f: ExpenseFields, d: ReceiptData): { fields: ExpenseFields; filled: string[] } {
  const next = { ...f };
  const filled: string[] = [];
  if (d.amount !== undefined && !f.amount.trim()) { next.amount = String(d.amount).replace('.', ','); filled.push('Betrag'); }
  if (d.vendor && !f.vendor.trim()) { next.vendor = d.vendor; filled.push('Lieferant'); }
  if (d.description && !f.description.trim()) { next.description = d.description; filled.push('Beschreibung'); }
  if (d.date && !f.dateTouched) { next.date = d.date; filled.push('Datum'); }
  if (d.category && !f.categoryTouched) { next.category = d.category; filled.push('Kategorie'); }
  return { fields: next, filled };
}

const toBase64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

/** Beleg (Foto oder PDF) von der KI auslesen lassen. Wirft einen verständlichen Fehler, wenn es nicht klappt. */
export async function readReceipt(file: Blob): Promise<ReceiptData | null> {
  const { callFunction } = await import('./cloud');
  const res = await callFunction<{ data: unknown }>('beleg-lesen', { image: await toBase64(file), mediaType: file.type || 'image/jpeg' });
  return normalizeReceipt(res.data);
}
