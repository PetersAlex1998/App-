import { DB, Expense, FirmCost, FirmInvoice, FirmInvoiceLine, Property } from './types';
import type { Settings } from './settingsDefaults';
import type { LetterModel } from './letters';
import { addDays, dateDE, eur } from './calc';
import { bankHolder, footerLines, formatIban, returnLine, senderLines, signatureLines, validIban } from './company';
import { houseId } from './ids';
import { houseBank, ownersOf } from './owners';
import { splitByShare } from './ownerStatement';

/**
 * Monatliche Rechnung der Firma an die Eigentümer eines Hauses: Verwaltungsgebühr pro Einheit (netto plus Umsatzsteuer, änderbar)
 * und Kosten, die die Firma für das Haus bezahlt hat (z. B. Hausmeister) und weiterbelastet. Die Rechnung wird beim Haus als Ausgaben gebucht,
 * Hausmeisterkosten als umlagefähig. Die Zahlung geht vom Hauskonto auf das Firmenkonto.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface HouseOverride { fee?: number; units?: number; extraText?: string; extraNet?: number; skipCosts?: string[]; skip?: boolean }
export interface HousePlan {
  prop: Property; month: string; fee: number; units: number; lines: FirmInvoiceLine[]; net: number; vatSum: number; gross: number;
  openCosts: FirmCost[]; already?: FirmInvoice; warnings: string[];
}

export const feeOf = (s: Pick<Settings, 'mgmtFee'>, p: Pick<Property, 'mgmtFee'>) => (p.mgmtFee !== undefined && p.mgmtFee >= 0 ? p.mgmtFee : s.mgmtFee);

/** Alle Einheiten des Hauses zählen (auch leere): die Gebühr fällt je Einheit an. */
export const unitCount = (db: DB, p: Property) => db.units.filter((u) => u.propertyId === p.id).length;

/** Noch nicht weiterbelastete Kosten eines Hauses bis einschließlich des Monats. */
export const openCosts = (db: DB, propertyId: string, month: string) =>
  db.firmCosts.filter((c) => c.propertyId === propertyId && !c.billedIn && c.date.slice(0, 7) <= month).sort((a, b) => a.date.localeCompare(b.date));

export function totals(lines: FirmInvoiceLine[]) {
  const net = r2(lines.reduce((a, l) => a + l.net, 0));
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vat, r2((byRate.get(l.vat) ?? 0) + l.net));
  const vats = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, base]) => ({ rate, base, vat: r2((base * rate) / 100) }));
  const vatSum = r2(vats.reduce((a, v) => a + v.vat, 0));
  return { net, vats, vatSum, gross: r2(net + vatSum) };
}

const FULL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** „November 2026“ (ausgeschrieben, für die Rechnung). */
export const monthName = (month: string) => `${FULL[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`.trim();

export function planHouse(db: DB, s: Settings, p: Property, month: string, o: HouseOverride = {}): HousePlan {
  const fee = o.fee !== undefined ? o.fee : feeOf(s, p);
  const units = o.units !== undefined ? o.units : unitCount(db, p);
  const open = openCosts(db, p.id, month);
  const lines: FirmInvoiceLine[] = [];
  if (units * fee > 0) lines.push({ text: `Verwaltungsgebühr ${monthName(month)}`, qty: units, unit: fee, net: r2(units * fee), vat: s.vatRate, kind: 'verwaltung', category: 'verwaltung', allocatable: false });
  for (const c of open.filter((x) => !(o.skipCosts ?? []).includes(x.id))) {
    lines.push({ text: `${c.description}${c.vendor ? ` (${c.vendor})` : ''} vom ${dateDE(c.date)}`, qty: 1, unit: c.net, net: c.net, vat: c.vat, kind: 'kosten', category: c.category, allocatable: c.allocatable, costId: c.id });
  }
  if (o.extraNet && o.extraText?.trim()) lines.push({ text: o.extraText.trim(), qty: 1, unit: o.extraNet, net: r2(o.extraNet), vat: s.vatRate, kind: 'sonstig', category: 'sonstiges', allocatable: false });
  const t = totals(lines);
  const warnings: string[] = [];
  if (ownersOf(p).length === 0) warnings.push('Keine Eigentümer hinterlegt: Die Rechnung hat keinen Empfänger.');
  if (!houseBank(p)) warnings.push('Kein Hauskonto hinterlegt.');
  return { prop: p, month, fee, units, lines, net: t.net, vatSum: t.vatSum, gross: t.gross, openCosts: open, already: db.firmInvoices.find((i) => i.propertyId === p.id && i.month === month), warnings };
}

export const planAll = (db: DB, s: Settings, month: string, overrides: Record<string, HouseOverride> = {}) =>
  db.properties.map((p) => planHouse(db, s, p, month, overrides[p.id])).filter((h) => h.units > 0 || h.openCosts.length > 0);

/** Fehlende Angaben der Firma, die auf einer Rechnung stehen müssen. */
export function firmIssues(s: Settings): string[] {
  const w: string[] = [];
  if (!s.name.trim() || !s.street.trim() || !s.city.trim()) w.push('Name und Anschrift der Firma fehlen (Unternehmensdaten).');
  if (!s.taxNo.trim() && !s.vatId.trim()) w.push('Steuernummer oder USt-IdNr. fehlt. Beides gehört auf eine Rechnung mit Umsatzsteuer.');
  if (!validIban(s.iban)) w.push('Das Firmenkonto (IBAN) fehlt, die Eigentümer wüssten nicht, wohin sie zahlen sollen.');
  return w;
}

/** Rechnungsnummer: Monat und Haus-ID, bei Doppelungen mit Zusatz. */
export function invoiceNumber(db: DB, p: Property, month: string): string {
  const base = `R-${month.replace('-', '')}-${houseId(p) || p.id.slice(0, 4)}`;
  const used = new Set(db.firmInvoices.map((i) => i.number));
  let n = base, k = 1;
  while (used.has(n)) n = `${base}-${++k}`;
  return n;
}

export function buildInvoice(db: DB, p: Property, hp: HousePlan, id: string, date: string, docId?: string): FirmInvoice {
  return { id, propertyId: p.id, month: hp.month, number: invoiceNumber(db, p, hp.month), date, lines: hp.lines, net: hp.net, vatSum: hp.vatSum, gross: hp.gross, ...(docId ? { docId } : {}) };
}

/** Buchung beim Haus: je Position eine Ausgabe (brutto). Hausmeisterkosten umlagefähig, Verwaltung nicht. Beleg ist das PDF der Rechnung. */
export function expensesFromInvoice(inv: FirmInvoice, s: Settings, newId: () => string): Expense[] {
  return inv.lines.map((l) => ({
    id: newId(), propertyId: inv.propertyId, date: inv.date, amount: r2(l.net + (l.net * l.vat) / 100), category: l.category,
    vendor: s.name.trim() || 'Hausverwaltung', description: `${l.text} (Rechnung ${inv.number})`, receiptId: inv.docId, allocatable: l.allocatable || undefined, invoiceId: inv.id,
  }));
}

/** Anschriftfeld: die Eigentümer des Hauses. */
export function ownerAddress(p: Property): string[] {
  const o = ownersOf(p);
  if (o.length === 0) return [p.name];
  const lines = [o.length > 1 ? `Eigentümer des Hauses ${p.name}` : '', ...o.slice(0, 3).map((x) => x.name.trim())];
  if (o.length > 3) lines.push(`und ${o.length - 3} weitere`);
  const addr = (o.find((x) => x.address?.trim())?.address ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return [...lines.filter(Boolean), ...addr].slice(0, 6);
}

export function invoiceModel(s: Settings, p: Property, inv: FirmInvoice): LetterModel {
  const t = totals(inv.lines);
  const rows = inv.lines.map((l) => ({ cells: [l.text, String(l.qty).replace('.', ','), eur(l.unit), eur(l.net)] }));
  const sums = [
    { cells: ['Summe netto', '', '', eur(t.net)], bold: true, span: 3 },
    ...t.vats.map((v) => ({ cells: [`Umsatzsteuer ${String(v.rate).replace('.', ',')} % auf ${eur(v.base)}`, '', '', eur(v.vat)], span: 3 })),
    { cells: ['Rechnungsbetrag', '', '', eur(t.gross)], bold: true, span: 3 },
  ];
  const hb = houseBank(p);
  const pay: [string, string][] = [['Empfänger', bankHolder(s)], ['IBAN', formatIban(s.iban)], ...(s.bic.trim() ? [['BIC', s.bic.trim()] as [string, string]] : []), ...(s.bank.trim() ? [['Bank', s.bank.trim()] as [string, string]] : []), ['Verwendungszweck', `Rechnung ${inv.number}`], ['Zahlbar bis', dateDE(addDays(inv.date, s.invoiceDays))]];
  if (hb) pay.push(['Zahlung vom Hauskonto', `${hb.holder ? hb.holder + ', ' : ''}${formatIban(hb.iban)}`]);
  return {
    title: `Rechnung ${inv.number} – ${p.name}`,
    senderLines: senderLines(s), logo: s.logo || undefined, returnLine: returnLine(s), address: ownerAddress(p), date: inv.date,
    info: [['Rechnungsnummer', inv.number], ['Haus', p.name], ['Leistungsmonat', monthName(inv.month)]],
    blocks: [
      { t: 'h1', text: `Rechnung Nr. ${inv.number}` },
      { t: 'p', text: `für die Verwaltung des Hauses **${p.name}**, ${p.street}, ${`${p.zip} ${p.city}`.trim()}, im Leistungsmonat **${monthName(inv.month)}**.` },
      { t: 'table', head: ['Leistung', 'Menge', 'Einzelpreis', 'Netto'], align: ['l', 'r', 'r', 'r'], widths: [0.52, 0.1, 0.19, 0.19], rows: [...rows, ...sums] },
      { t: 'p', text: 'Bitte überweisen Sie den Rechnungsbetrag vom Konto des Hauses auf das Konto der Hausverwaltung.' },
      { t: 'kv', rows: pay },
      ...(inv.lines.some((l) => l.allocatable) ? [{ t: 'p' as const, small: true, text: 'Die weiterbelasteten Hausmeisterkosten sind Betriebskosten, die nach dem Mietvertrag auf die Mieter umgelegt werden können.' }] : []),
      { t: 'sign', lines: signatureLines(s) },
    ],
    footer: footerLines(s),
    ...(s.signature && s.autoSign ? { signatures: { vermieter: s.signature } } : {}),
  };
}

export interface InvoicePayment { row: { id: string; date: string; amount: number; name: string; purpose: string }; invoice: FirmInvoice; amountOk: boolean }

/** Ausgänge vom Hauskonto, in deren Verwendungszweck eine offene Rechnungsnummer der Firma steht. Der Betrag muss zum Rechnungsbetrag passen, sonst „prüfen“. */
export function matchInvoices(db: DB, outgoing: { id: string; date: string; amount: number; name: string; purpose: string }[] = []): InvoicePayment[] {
  const open = db.firmInvoices.filter((i) => !i.paid).sort((a, b) => b.number.length - a.number.length);
  const out: InvoicePayment[] = [];
  const used = new Set<string>();
  for (const row of outgoing) {
    const text = ` ${row.purpose} `.toUpperCase().replace(/[–—]/g, '-');
    const inv = open.find((i) => !used.has(i.id) && new RegExp(`(^|[^A-Z0-9-])${i.number.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Z0-9-])`).test(text));
    if (!inv) continue;
    used.add(inv.id);
    out.push({ row, invoice: inv, amountOk: Math.abs(Math.abs(row.amount) - inv.gross) < 0.01 });
  }
  return out;
}

export type SplitBasis = 'einheiten' | 'flaeche' | 'gleich';
export const SPLIT_LABEL: Record<SplitBasis, string> = { einheiten: 'Nach Einheiten', flaeche: 'Nach Fläche', gleich: 'Zu gleichen Teilen' };

/** Eine Rechnung (netto) auf mehrere Häuser verteilen: nach Einheiten, Wohn- und Nutzfläche oder gleich. Der Rundungsrest geht an das größte Haus, die Summe stimmt immer. */
export function splitCost(db: DB, propertyIds: string[], totalNet: number, basis: SplitBasis): { propertyId: string; net: number; weight: number }[] {
  const weight = (id: string) => {
    const us = db.units.filter((u) => u.propertyId === id);
    return basis === 'einheiten' ? us.length : basis === 'flaeche' ? us.reduce((a, u) => a + (u.area || 0), 0) : 1;
  };
  let ws = propertyIds.map(weight);
  if (ws.every((w) => w <= 0)) ws = propertyIds.map(() => 1); // Häuser ohne Einheiten oder Fläche: zu gleichen Teilen
  const parts = splitByShare(totalNet, ws.map((w) => Math.max(0, w)));
  return propertyIds.map((propertyId, i) => ({ propertyId, net: parts[i], weight: ws[i] }));
}
