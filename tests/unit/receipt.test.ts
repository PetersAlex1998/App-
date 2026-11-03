import { describe, expect, it } from 'vitest';
import { fillFromReceipt, normalizeReceipt, ExpenseFields } from '../../src/receipt';

const NOW = '2026-11-03';
const form = (o: Partial<ExpenseFields> = {}): ExpenseFields => ({ amount: '', date: NOW, vendor: '', description: '', category: 'instandhaltung', categoryTouched: false, dateTouched: false, ...o });

describe('Beleg-Auslesen: Antwort prüfen', () => {
  it('übernimmt plausible Werte', () => {
    expect(normalizeReceipt({ vendor: ' Sanitär Meier ', date: '2026-10-12', amount: 1234.5, category: 'instandhaltung', description: 'Rohrbruch', readable: true }, NOW))
      .toEqual({ vendor: 'Sanitär Meier', date: '2026-10-12', amount: 1234.5, category: 'instandhaltung', description: 'Rohrbruch' });
  });
  it('unlesbar oder leer → null', () => {
    expect(normalizeReceipt({ readable: false, amount: 5 }, NOW)).toBeNull();
    expect(normalizeReceipt({ vendor: null, date: null, amount: null, description: null, category: 'sonstiges', readable: true }, NOW)).toBeNull();
    expect(normalizeReceipt('Quatsch', NOW)).toBeNull();
    expect(normalizeReceipt(null, NOW)).toBeNull();
  });
  it('verwirft unplausible Angaben einzeln, behält den Rest', () => {
    const r = normalizeReceipt({ vendor: 'X', date: '1999-01-01', amount: -20, category: 'quatsch', readable: true }, NOW)!;
    expect(r.date).toBeUndefined();
    expect(r.amount).toBe(20); // Vorzeichen egal (Rückerstattung/Minus-Schreibweise), Betrag positiv
    expect(r.category).toBe('sonstiges');
    expect(normalizeReceipt({ vendor: 'X', date: '2031-01-01', amount: 0, readable: true }, NOW)!.date).toBeUndefined();
    expect(normalizeReceipt({ vendor: 'X', amount: 99_999_999, readable: true }, NOW)!.amount).toBeUndefined();
    expect(normalizeReceipt({ vendor: 'X', date: '2026-02-30x', readable: true }, NOW)!.date).toBeUndefined();
  });
  it('rundet auf Cent und kürzt lange Texte', () => {
    const r = normalizeReceipt({ vendor: 'A'.repeat(200), amount: 12.3456, description: 'B'.repeat(300), readable: true }, NOW)!;
    expect(r.amount).toBe(12.35);
    expect(r.vendor).toHaveLength(80);
    expect(r.description).toHaveLength(100);
  });
});

describe('Beleg-Auslesen: Formular füllen', () => {
  const data = { vendor: 'Meier', date: '2026-10-12', amount: 1234.5, category: 'versicherung' as const, description: 'Police' };
  it('füllt leere Felder', () => {
    const { fields, filled } = fillFromReceipt(form(), data);
    expect(fields).toMatchObject({ amount: '1234,5', vendor: 'Meier', description: 'Police', date: '2026-10-12', category: 'versicherung' });
    expect(filled).toEqual(['Betrag', 'Lieferant', 'Beschreibung', 'Datum', 'Kategorie']);
  });
  it('überschreibt nie, was schon eingegeben wurde', () => {
    const { fields, filled } = fillFromReceipt(form({ amount: '5', vendor: 'Eigen', description: 'Mein Text', dateTouched: true, date: '2026-01-01', categoryTouched: true, category: 'hausmeister' }), data);
    expect(fields).toMatchObject({ amount: '5', vendor: 'Eigen', description: 'Mein Text', date: '2026-01-01', category: 'hausmeister' });
    expect(filled).toEqual([]);
  });
});
