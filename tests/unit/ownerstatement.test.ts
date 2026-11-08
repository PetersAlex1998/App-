import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { byPerson, ownerStatement, ownerStatementModel, splitByShare } from '../../src/ownerStatement';
import { portfolio } from '../../src/portfolio';
import { anlageV } from '../../src/expenses';
import { interestInYear, principalInYear } from '../../src/loans';
import { modelToPdf } from '../../src/pdfgen';
import { defaultSettings } from '../../src/settingsDefaults';
import type { Expense, Loan } from '../../src/types';
import { dbWith, payment, property, tenant, unit } from '../helpers/builders';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

const exp = (o: Partial<Expense>): Expense => ({ id: Math.random().toString(36), propertyId: 'p1', date: '2025-06-01', amount: 0, category: 'instandhaltung', vendor: '', description: '', ...o });
const firm = { ...defaultSettings, name: 'Mustermann Verwaltung', street: 'Hauptstr. 1', zip: '33098', city: 'Paderborn', iban: 'DE89370400440532013000' };

function setup(owners = [{ name: 'Max Muster', share: 50, address: 'Weg 1, 33100 Paderborn' }, { name: 'Erika Muster', share: 30 }, { name: 'Paul Muster', share: 20 }]) {
  const p = property({ id: 'p1', name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', owners });
  const u = unit(p.id, { coldRent: 500 });
  const t = tenant(u.id, { moveIn: '2024-01-01', trackFrom: '2099-01' });
  const loan: Loan = { id: 'l', propertyId: p.id, name: 'Bank', amount: 100000, start: '2025-01-01', rate: 3.6, repayment: 2.4 };
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
  const db = dbWith({
    properties: [p], units: [u], tenants: [t], loans: [loan],
    payments: [...months.map((m) => payment(t.id, m, 600)), payment(t.id, '2024-01', 1500, { kind: 'kaution' }), payment(t.id, '2025-05', 120, { kind: 'nachzahlung' })],
    expenses: [exp({ amount: 1000 }), exp({ amount: 800, category: 'betriebskosten' }), exp({ amount: 3000, category: 'afa' }), exp({ amount: 238, category: 'verwaltung' })],
  });
  return { p, db };
}

describe('Aufteilung nach Anteil', () => {
  it('Rundung geht an den größten Anteil, Summe stimmt immer', () => {
    expect(splitByShare(100, [50, 30, 20])).toEqual([50, 30, 20]);
    const t = splitByShare(100.01, [1, 1, 1]);
    expect(Math.round(t.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100.01);
    expect(splitByShare(-600, [50, 30, 20])).toEqual([-300, -180, -120]);
    expect(splitByShare(0, [100])).toEqual([0]);
    expect(splitByShare(10, [])).toEqual([]);
  });
});

describe('Eigentümerabrechnung', () => {
  it('Überschuss: Einnahmen ohne Kaution, Ausgaben ohne Abschreibung, Zins und Tilgung', () => {
    const { db } = setup();
    const st = ownerStatement(db, 'p1', 2025)!;
    expect(st.income.map((x) => x.total)).toEqual([7200, 120]); // Kaution zählt nicht
    expect(st.incomeTotal).toBe(7320);
    expect(st.expensesTotal).toBe(2038); // 1000 + 800 + 238, ohne AfA
    expect(st.interest + st.principal).toBe(6000);
    expect(st.surplus).toBe(-718); // 7320 − 2038 − 6000
    expect(st.problems).toEqual([]);
  });
  it('stimmt mit dem Cashflow im Portfolio überein', () => {
    const { db } = setup();
    expect(ownerStatement(db, 'p1', 2025)!.surplus).toBe(portfolio(db, 2025).houses[0].cashflow);
  });
  it('verteilt den Überschuss nach Anteil (50/30/20)', () => {
    const st = ownerStatement(setup().db, 'p1', 2025)!;
    expect(st.owners.map((o) => [o.owner.name, o.share, o.amount])).toEqual([['Max Muster', 50, -359], ['Erika Muster', 30, -215.4], ['Paul Muster', 20, -143.6]]);
    expect(Math.round(st.owners.reduce((a, o) => a + o.amount, 0) * 100) / 100).toBe(st.surplus);
  });
  it('steuerlich: Anlage V mit Abschreibung und Schuldzinsen, ohne Tilgung', () => {
    const { db } = setup();
    const st = ownerStatement(db, 'p1', 2025)!;
    const a = anlageV(db, 2025, 'p1');
    expect(st.tax).toEqual({ income: a.income, expenses: a.expenses, surplus: a.surplus });
    const zins = interestInYear(db.loans[0], 2025);
    expect(st.tax.expenses).toBe(Math.round((1000 + 800 + 238 + 3000 + zins) * 100) / 100);
    expect(principalInYear(db.loans[0], 2025)).toBeGreaterThan(0);
  });
  it('erfasste Schuldzinsen ersetzen die Zinsen aus dem Darlehen', () => {
    const { db } = setup();
    const own = { ...db, expenses: [...db.expenses, exp({ amount: 3500, category: 'schuldzinsen' })] };
    const st = ownerStatement(own, 'p1', 2025)!;
    expect(st.interest).toBe(0);
    expect(st.expenses.find((x) => x.label === 'Schuldzinsen')?.total).toBe(3500);
  });
  it('ohne Eigentümer oder mit falschen Anteilen: Hinweise statt Verteilung', () => {
    expect(ownerStatement(setup([]).db, 'p1', 2025)!.problems).toEqual(['Keine Eigentümer hinterlegt.']);
    const bad = ownerStatement(setup([{ name: 'A', share: 60 }, { name: 'B', share: 30 }]).db, 'p1', 2025)!;
    expect(bad.problems.join(' ')).toMatch(/ergeben 90 %/);
    expect(ownerStatement(setup().db, 'unbekannt', 2025)).toBeNull();
  });
  it('ein Eigentümer ohne Anteil bekommt 100 %', () => {
    const st = ownerStatement(setup([{ name: 'Max Muster', share: 0 }]).db, 'p1', 2025)!;
    expect(st.owners[0]).toMatchObject({ share: 100, amount: st.surplus });
  });
});

describe('Je Person und PDF', () => {
  it('dieselbe Person in zwei Häusern wird zusammengezählt', () => {
    const a = setup([{ name: 'Max Muster', share: 100 }]).db;
    const p2 = property({ id: 'p2', name: 'Haus B', owners: [{ name: 'max muster', share: 50 }, { name: 'Erika Muster', share: 50 }] });
    const u2 = unit(p2.id); const t2 = tenant(u2.id, { trackFrom: '2099-01' });
    const db = dbWith({ ...a, properties: [...a.properties, p2], units: [...a.units, u2], tenants: [...a.tenants, t2], payments: [...a.payments, payment(t2.id, '2025-03', 1000)] });
    const r = byPerson(db, 2025);
    const max = r.find((x) => x.name === 'Max Muster')!;
    expect(max.houses.map((h) => h.prop.name)).toEqual(['Haus A', 'Haus B']);
    expect(max.amount).toBe(Math.round((ownerStatement(db, 'p1', 2025)!.surplus + 500) * 100) / 100);
    expect(r.map((x) => x.name)).toEqual(['Erika Muster', 'Max Muster']);
  });
  it('PDF je Eigentümer: Empfänger, Anteil, Posten, Steuerhinweis', async () => {
    const st = ownerStatement(setup().db, 'p1', 2025)!;
    const m = ownerStatementModel(firm, st, 0, '2026-03-01');
    expect(m.address).toEqual(['Max Muster', 'Weg 1', '33100 Paderborn']);
    expect(m.title).toBe('Eigentümerabrechnung 2025 – Haus A – Max Muster');
    const txt = JSON.stringify(m.blocks);
    expect(txt).toContain('Ihr Anteil (50 %)');
    expect(txt).toContain('Mieteinnahmen');
    expect(txt).toContain('Tilgung von Darlehen');
    expect(txt).toContain('Anlage V');
    expect(txt).toContain('ersetzt keine Steuerberatung');
    expect((await PDFDocument.load(await modelToPdf(m))).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(ownerStatementModel(firm, st, 1).address).toEqual(['Erika Muster']);
  });
});
