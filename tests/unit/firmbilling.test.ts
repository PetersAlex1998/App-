import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildInvoice, expensesFromInvoice, feeOf, firmIssues, invoiceModel, invoiceNumber, openCosts, ownerAddress, planAll, planHouse, totals } from '../../src/firmBilling';
import { removeItem, restoreRemoved } from '../../src/dbops';
import { modelToPdf } from '../../src/pdfgen';
import { computeTasks } from '../../src/tasks';
import { defaultSettings } from '../../src/settingsDefaults';
import type { FirmCost } from '../../src/types';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const firm = { ...defaultSettings, name: 'Mustermann Verwaltung', legalForm: 'GmbH', street: 'Hauptstr. 1', zip: '33098', city: 'Paderborn', taxNo: '339/5800/1234', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bank: 'Commerzbank' };
const cost = (o: Partial<FirmCost> = {}): FirmCost => ({ id: 'c1', propertyId: 'p1', date: '2026-10-20', description: 'Hausmeister Oktober', vendor: 'Meier', net: 100, vat: 19, category: 'hausmeister', allocatable: true, ...o });

function house(units = 8, over = {}) {
  const p = property({ id: 'p1', name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', houseNo: 3, owners: [{ name: 'Max Muster', share: 50, address: 'Weg 1, 33100 Paderborn' }, { name: 'Erika Muster', share: 50 }], bank: { iban: 'DE02120300000000202051' }, ...over });
  const us = Array.from({ length: units }, (_, i) => unit(p.id, { name: `W${i + 1}`, no: i + 1 }));
  return { p, us, db: dbWith({ properties: [p], units: us, tenants: us.map((u) => tenant(u.id)) }) };
}

describe('Verwaltungsgebühr', () => {
  it('25 € netto je Einheit plus 19 % Umsatzsteuer', () => {
    const { p, db } = house(8);
    const h = planHouse(db, firm, p, '2026-11');
    expect(h).toMatchObject({ units: 8, fee: 25, net: 200, vatSum: 38, gross: 238 });
    expect(h.lines[0]).toMatchObject({ kind: 'verwaltung', category: 'verwaltung', allocatable: false, qty: 8, unit: 25, text: 'Verwaltungsgebühr November 2026' });
  });
  it('Betrag ist änderbar: Standard, Haus, einzelner Monat', () => {
    const { p, db } = house(8);
    expect(feeOf(firm, p)).toBe(25);
    expect(feeOf({ ...firm, mgmtFee: 30 }, p)).toBe(30);
    expect(feeOf(firm, { ...p, mgmtFee: 20 })).toBe(20);
    expect(feeOf(firm, { ...p, mgmtFee: 0 })).toBe(0);
    expect(planHouse(db, firm, { ...p, mgmtFee: 20 }, '2026-11').net).toBe(160);
    expect(planHouse(db, firm, p, '2026-11', { fee: 27.5, units: 6 })).toMatchObject({ net: 165, vatSum: 31.35, gross: 196.35 });
    expect(planHouse(db, { ...firm, vatRate: 0 }, p, '2026-11').gross).toBe(200);
  });
  it('leere Einheiten zählen mit', () => {
    const { p, us, db } = house(4);
    expect(planHouse({ ...db, tenants: [] }, firm, p, '2026-11').units).toBe(us.length);
  });
});

describe('Weiterbelastete Kosten', () => {
  it('offene Kosten bis zum Monat; spätere und schon abgerechnete nicht', () => {
    const { p, db } = house(2);
    const d = { ...db, firmCosts: [cost(), cost({ id: 'c2', date: '2026-12-02' }), cost({ id: 'c3', billedIn: 'x' }), cost({ id: 'c4', propertyId: 'anderes' })] };
    expect(openCosts(d, p.id, '2026-11').map((c) => c.id)).toEqual(['c1']);
    const h = planHouse(d, firm, p, '2026-11');
    expect(h.lines.map((l) => l.kind)).toEqual(['verwaltung', 'kosten']);
    expect(h.lines[1]).toMatchObject({ text: 'Hausmeister Oktober (Meier) vom 20.10.2026', net: 100, category: 'hausmeister', allocatable: true, costId: 'c1' });
    expect(h).toMatchObject({ net: 150, vatSum: 28.5, gross: 178.5 });
  });
  it('einzelne Kosten ausnehmen, weitere Position, gemischte Steuersätze', () => {
    const { p, db } = house(2);
    const d = { ...db, firmCosts: [cost(), cost({ id: 'c2', net: 50, vat: 0 })] };
    expect(planHouse(d, firm, p, '2026-11', { skipCosts: ['c1'] }).lines.some((l) => l.costId === 'c1')).toBe(false);
    const h = planHouse(d, firm, p, '2026-11', { extraText: 'Schlüsseldienst', extraNet: 40 });
    expect(h.lines.at(-1)).toMatchObject({ kind: 'sonstig', net: 40, vat: 19 });
    const t = totals(planHouse(d, firm, p, '2026-11').lines);
    expect(t.vats).toEqual([{ rate: 0, base: 50, vat: 0 }, { rate: 19, base: 150, vat: 28.5 }]);
    expect(t.gross).toBe(228.5);
  });
  it('Häuser ohne Einheiten und ohne offene Kosten werden nicht angeboten; vorhandene Rechnung wird erkannt', () => {
    const { p, db } = house(2);
    const leer = property({ id: 'p9', name: 'Leer' });
    const d = dbWith({ ...db, properties: [p, leer] });
    expect(planAll(d, firm, '2026-11').map((h) => h.prop.id)).toEqual(['p1']);
    const inv = buildInvoice(d, p, planHouse(d, firm, p, '2026-11'), 'i1', NOW);
    expect(planHouse({ ...d, firmInvoices: [inv] }, firm, p, '2026-11').already?.id).toBe('i1');
    expect(planHouse({ ...d, firmInvoices: [inv] }, firm, p, '2026-12').already).toBeUndefined();
  });
});

describe('Rechnung und Buchung', () => {
  it('Rechnungsnummer: Monat und Haus-ID, eindeutig', () => {
    const { p, db } = house(1);
    expect(invoiceNumber(db, p, '2026-11')).toBe('R-202611-H03');
    const d = { ...db, firmInvoices: [buildInvoice(db, p, planHouse(db, firm, p, '2026-11'), 'i1', NOW)] };
    expect(invoiceNumber(d, p, '2026-11')).toBe('R-202611-H03-2');
  });
  it('bucht beim Haus je Position eine Ausgabe in Brutto; Hausmeister umlagefähig, Verwaltung nicht', () => {
    const { p, db } = house(8);
    const d = { ...db, firmCosts: [cost()] };
    const inv = buildInvoice(d, p, planHouse(d, firm, p, '2026-11'), 'i1', '2026-11-30', 'doc1');
    let n = 0;
    const ex = expensesFromInvoice(inv, firm, () => `e${++n}`);
    expect(ex).toHaveLength(2);
    expect(ex[0]).toMatchObject({ category: 'verwaltung', amount: 238, allocatable: undefined, invoiceId: 'i1', receiptId: 'doc1', vendor: 'Mustermann Verwaltung', date: '2026-11-30' });
    expect(ex[1]).toMatchObject({ category: 'hausmeister', amount: 119, allocatable: true });
    expect(ex.reduce((a, e) => a + e.amount, 0)).toBe(inv.gross);
  });
  it('PDF: Eigentümer als Empfänger, Firmenkonto als Ziel, Hauskonto als Zahler, Zahlungsziel', async () => {
    const { p, db } = house(8);
    const inv = buildInvoice(db, p, planHouse(db, firm, p, '2026-11'), 'i1', '2026-11-30');
    const m = invoiceModel(firm, p, inv);
    expect(m.address).toEqual(['Eigentümer des Hauses Haus A', 'Max Muster', 'Erika Muster', 'Weg 1', '33100 Paderborn']);
    const txt = JSON.stringify(m.blocks);
    expect(txt).toContain('DE89 3704 0044 0532 0130 00'); // Firmenkonto als Empfänger
    expect(txt).toContain('DE02 1203 0000 0000 2020 51'); // Hauskonto als Zahler
    expect(txt).toContain('Rechnung R-202611-H03');
    expect(txt).toContain('14.12.2026'); // 14 Tage Zahlungsziel
    expect(txt).toMatch(/Umsatzsteuer 19 % auf/);
    expect(m.footer.join(' ')).toContain('Steuernummer 339/5800/1234');
    expect((await PDFDocument.load(await modelToPdf(m))).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(ownerAddress(property({ owners: undefined, name: 'X' }))).toEqual(['X']);
  });
  it('Hinweise: Steuernummer, Firmenkonto, Anschrift', () => {
    expect(firmIssues(firm)).toEqual([]);
    expect(firmIssues({ ...firm, taxNo: '', vatId: '' }).join(' ')).toMatch(/Steuernummer oder USt-IdNr/);
    expect(firmIssues({ ...firm, iban: '' }).join(' ')).toMatch(/Firmenkonto/);
    expect(firmIssues({ ...firm, name: '' }).join(' ')).toMatch(/Anschrift/);
  });
});

describe('Rechnung löschen und Erinnerung', () => {
  it('löscht Buchungen und Beleg, Kosten werden wieder offen, Rückgängig stellt alles her', () => {
    const { p, db } = house(8);
    const d0 = { ...db, firmCosts: [cost()] };
    const inv = buildInvoice(d0, p, planHouse(d0, firm, p, '2026-11'), 'i1', NOW, 'doc1');
    const ex = expensesFromInvoice(inv, firm, (() => { let n = 0; return () => `e${++n}`; })());
    const d1 = { ...d0, firmInvoices: [inv], expenses: ex, firmCosts: [{ ...cost(), billedIn: 'i1' }], documents: [{ id: 'doc1', ownerKind: 'property' as const, ownerId: p.id, category: 'brief' as const, name: 'R', mime: 'application/pdf', size: 1, added: NOW }] };
    const { db: after, goneDocs } = removeItem(d1, 'firmInvoices', 'i1');
    expect(after.firmInvoices).toEqual([]);
    expect(after.expenses).toEqual([]);
    expect(after.firmCosts[0].billedIn).toBeUndefined();
    expect(goneDocs.map((x) => x.id)).toEqual(['doc1']);
    const back = restoreRemoved(after, d1, after);
    expect(back.firmInvoices).toHaveLength(1);
    expect(back.expenses).toHaveLength(2);
    expect(back.firmCosts[0].billedIn).toBe('i1');
  });
  it('Aufgabe: Vormonat nicht abgerechnet (nur wenn die Funktion genutzt wird)', () => {
    const { p, db } = house(3);
    expect(computeTasks(db, { now: NOW }).some((t) => t.id.startsWith('firmabrechnung:'))).toBe(false);
    const used = { ...db, firmCosts: [cost()] };
    const t = computeTasks(used, { now: NOW }).find((x) => x.id.startsWith('firmabrechnung:'))!;
    expect(t.id).toBe('firmabrechnung:2026-10');
    expect(t.title).toMatch(/10\/2026: 1 Haus offen/);
    const inv = buildInvoice(used, p, planHouse(used, firm, p, '2026-10'), 'i1', '2026-10-31');
    expect(computeTasks({ ...used, firmInvoices: [inv] }, { now: NOW }).some((x) => x.id.startsWith('firmabrechnung:'))).toBe(false);
  });
});
