import { describe, expect, it } from 'vitest';
import { csvSafe, csvText } from '../../src/csvSafe';
import { BIG_MONEY, MAX_NUMBER_CHARS, cleanNumeric, tooBig } from '../../src/inputs';
import { expensesCsv } from '../../src/expenses';
import { dbWith, property } from '../helpers/builders';

describe('CSV-Schutz', () => {
  it('Formelzeichen am Anfang werden entschärft', () => {
    for (const bad of ['=SUMME(A1)', '+1+1', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://böse","klick")']) expect(csvSafe(bad)).toBe(`'${bad}`);
  });
  it('normale Texte und Zahlen im Text bleiben unverändert', () => {
    for (const ok of ['Sanitär Meier', '250,00', '01.02.2026', 'a=b', 'Rechnung -5 %', '']) expect(csvSafe(ok)).toBe(ok);
  });
  it('Zelle wird gequotet, Anführungszeichen verdoppelt', () => {
    expect(csvText('Er sagte "hi"')).toBe('"Er sagte ""hi"""');
    expect(csvText('=1+1')).toBe(`"'=1+1"`);
  });
  it('Ausgaben-Export enthält keine ungeschützte Formel', () => {
    const p = property({ name: '=Haus' });
    const db = dbWith({ properties: [p], expenses: [{ id: 'e', propertyId: p.id, date: '2026-05-01', amount: 100, category: 'instandhaltung', vendor: '=cmd|"/c calc"!A1', description: '@SUM(1)' }] });
    const csv = expensesCsv(db, 2026);
    const cells = csv.split('\r\n')[1].split(';');
    expect(cells.every((c) => !/^"[=+\-@]/.test(c))).toBe(true);
    expect(cells[1]).toBe(`"'=Haus"`);
    expect(cells[3]).toContain(`"'=cmd`);
    expect(cells[4]).toBe(`"'@SUM(1)"`);
    expect(cells[5]).toBe('"100,00"');
  });
});

describe('Eingabegrenzen', () => {
  it('Zahlenfelder lassen nur Zahlzeichen zu und sind begrenzt', () => {
    expect(cleanNumeric('12a3,5€')).toBe('123,5');
    expect(cleanNumeric('1.234,56')).toBe('1.234,56');
    expect(cleanNumeric('=1+1')).toBe('11');
    expect(cleanNumeric('1'.repeat(40))).toHaveLength(MAX_NUMBER_CHARS);
  });
  it('Obergrenzen für Beträge', () => {
    expect(tooBig(250000)).toBe(false);
    expect(tooBig(10_000_000)).toBe(false);
    expect(tooBig(10_000_001)).toBe(true);
    expect(tooBig(-20_000_000)).toBe(true);
    expect(tooBig(15_000, 10_000)).toBe(true);
    expect(BIG_MONEY).toMatch(/zu groß/);
  });
});
