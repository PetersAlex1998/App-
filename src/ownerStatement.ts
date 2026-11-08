import { DB, Property } from './types';
import type { Settings } from './settingsDefaults';
import type { LetterModel } from './letters';
import { dateDE, eur, today } from './calc';
import { EXPENSE_LABEL, anlageV, expensesOf, inYear } from './expenses';
import { interestInYear, loansOf, principalInYear } from './loans';
import { Owner, effectiveShare, ownersOf, shareProblem } from './owners';
import { footerLines, returnLine, senderLines, signatureLines } from './company';

/**
 * Eigentümerabrechnung: Was ist mit einem Haus im Jahr passiert, und was steht den Eigentümern nach Anteil zu?
 * Überschuss = Einnahmen (Miete und Nachzahlungen, ohne Kaution) − Ausgaben (ohne Abschreibung) − Zins − Tilgung, wie im Portfolio.
 * Zusätzlich die Anlage-V-Zahlen (steuerlich, mit Abschreibung und ohne Tilgung) je Anteil, zur Orientierung.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface StatementRow { label: string; total: number }
export interface OwnerShare { owner: Owner; share: number; amount: number }
export interface OwnerStatement {
  prop: Property; year: number;
  income: StatementRow[]; incomeTotal: number;
  expenses: StatementRow[]; expensesTotal: number;
  interest: number; principal: number; surplus: number;
  owners: OwnerShare[];
  tax: { income: number; expenses: number; surplus: number };
  problems: string[];
}

/** Betrag nach Anteilen verteilen; der Rest aus der Rundung geht an den größten Anteil, damit die Summe stimmt. */
export function splitByShare(amount: number, shares: number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const parts = shares.map((s) => r2((amount * s) / total));
  const diff = r2(amount - parts.reduce((a, b) => a + b, 0));
  if (diff !== 0 && parts.length) parts[shares.indexOf(Math.max(...shares))] = r2(parts[shares.indexOf(Math.max(...shares))] + diff);
  return parts;
}

export function ownerStatement(db: DB, propertyId: string, year: number): OwnerStatement | null {
  const prop = db.properties.find((p) => p.id === propertyId);
  if (!prop) return null;
  const unitIds = new Set(db.units.filter((u) => u.propertyId === propertyId).map((u) => u.id));
  const tenantIds = new Set(db.tenants.filter((t) => unitIds.has(t.unitId)).map((t) => t.id));
  const pays = db.payments.filter((p) => tenantIds.has(p.tenantId) && p.kind !== 'kaution' && inYear(p.date, year));
  const sumKind = (k: string) => r2(pays.filter((p) => p.kind === k).reduce((a, p) => a + p.amount, 0));
  const income: StatementRow[] = [{ label: 'Mieteinnahmen (inkl. Nebenkostenvorauszahlungen)', total: sumKind('miete') }, { label: 'Nachzahlungen aus Abrechnungen', total: sumKind('nachzahlung') }].filter((x) => x.total !== 0);
  const incomeTotal = r2(income.reduce((a, x) => a + x.total, 0));

  const exps = expensesOf(db, { propertyId, year }).filter((e) => e.category !== 'afa');
  const byCat = new Map<string, number>();
  for (const e of exps) byCat.set(e.category, r2((byCat.get(e.category) ?? 0) + e.amount));
  const expenses: StatementRow[] = [...byCat.entries()].map(([k, v]) => ({ label: EXPENSE_LABEL[k as keyof typeof EXPENSE_LABEL] ?? k, total: v })).sort((a, b) => b.total - a.total);
  const expensesTotal = r2(expenses.reduce((a, x) => a + x.total, 0));

  const hasInterestExpense = exps.some((e) => e.category === 'schuldzinsen');
  const loans = loansOf(db, propertyId);
  const interest = hasInterestExpense ? 0 : r2(loans.reduce((a, l) => a + interestInYear(l, year), 0));
  const principal = r2(loans.reduce((a, l) => a + principalInYear(l, year), 0));
  const surplus = r2(incomeTotal - expensesTotal - interest - principal);

  const list = ownersOf(prop);
  const shares = list.map((o) => effectiveShare(list, o));
  const amounts = splitByShare(surplus, shares);
  const owners = list.map((owner, i) => ({ owner, share: shares[i], amount: amounts[i] }));
  const a = anlageV(db, year, propertyId);
  const problems: string[] = [];
  if (list.length === 0) problems.push('Keine Eigentümer hinterlegt.');
  const sp = shareProblem(prop);
  if (sp) problems.push(sp);
  return { prop, year, income, incomeTotal, expenses, expensesTotal, interest, principal, surplus, owners, tax: { income: a.income, expenses: a.expenses, surplus: a.surplus }, problems };
}

/** Je Person über alle Häuser: Anteil am Überschuss. Personen werden am Namen erkannt. */
export function byPerson(db: DB, year: number) {
  const out = new Map<string, { name: string; amount: number; houses: { prop: Property; share: number; amount: number }[] }>();
  for (const p of db.properties) {
    const st = ownerStatement(db, p.id, year);
    if (!st) continue;
    for (const o of st.owners) {
      const key = o.owner.name.trim().toLowerCase();
      const cur = out.get(key) ?? { name: o.owner.name.trim(), amount: 0, houses: [] };
      cur.amount = r2(cur.amount + o.amount);
      cur.houses.push({ prop: p, share: o.share, amount: o.amount });
      out.set(key, cur);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const pct = (n: number) => `${String(r2(n)).replace('.', ',')} %`;

/** Abrechnung für einen Eigentümer als Schreiben (PDF). */
export function ownerStatementModel(s: Settings, st: OwnerStatement, index: number, date = today()): LetterModel {
  const o = st.owners[index];
  const f = o.share / 100;
  const row = (label: string, total: number, bold = false) => ({ cells: [label, eur(total), eur(r2(total * f))], bold });
  const rows = [
    ...st.income.map((x) => row(x.label, x.total)),
    row('Einnahmen gesamt', st.incomeTotal, true),
    ...st.expenses.map((x) => row(`− ${x.label}`, -x.total)),
    ...(st.interest ? [row('− Zinsen für Darlehen', -st.interest)] : []),
    ...(st.principal ? [row('− Tilgung von Darlehen', -st.principal)] : []),
  ];
  const taxRows = [
    { cells: ['Einnahmen', eur(st.tax.income), eur(r2(st.tax.income * f))] },
    { cells: ['Werbungskosten (inkl. Abschreibung und Schuldzinsen)', eur(st.tax.expenses), eur(r2(st.tax.expenses * f))] },
    { cells: ['Überschuss steuerlich', eur(st.tax.surplus), eur(r2(st.tax.surplus * f))], bold: true },
  ];
  const addr = (o.owner.address ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    title: `Eigentümerabrechnung ${st.year} – ${st.prop.name} – ${o.owner.name}`,
    senderLines: senderLines(s), logo: s.logo || undefined, returnLine: returnLine(s), address: [o.owner.name, ...addr].slice(0, 6), date,
    info: [['Haus', st.prop.name], ['Jahr', String(st.year)], ['Ihr Anteil', pct(o.share)]],
    blocks: [
      { t: 'h1', text: `Eigentümerabrechnung ${st.year}` },
      { t: 'p', text: `für Ihr Haus **${st.prop.name}**, ${st.prop.street}, ${`${st.prop.zip} ${st.prop.city}`.trim()}. Ihr Anteil beträgt **${pct(o.share)}**.` },
      { t: 'table', head: ['Posten', 'Haus gesamt', `Ihr Anteil (${pct(o.share)})`], align: ['l', 'r', 'r'], widths: [0.52, 0.24, 0.24], rows: [...rows, { cells: ['Überschuss', eur(st.surplus), eur(o.amount)], bold: true }] },
      { t: 'p', text: `Ihr Anteil am Überschuss: **${eur(o.amount)}**.` },
      { t: 'h1', text: 'Für die Steuer (zur Orientierung)' },
      { t: 'table', head: ['Anlage V', 'Haus gesamt', `Ihr Anteil (${pct(o.share)})`], align: ['l', 'r', 'r'], widths: [0.52, 0.24, 0.24], rows: taxRows },
      { t: 'p', small: true, text: 'Die steuerlichen Zahlen berücksichtigen die Abschreibung und die Schuldzinsen, nicht aber die Tilgung. Maßgeblich ist die Erklärung, die Ihr Steuerberater erstellt. Diese Aufstellung ersetzt keine Steuerberatung.' },
      { t: 'p', small: true, text: `Erstellt am ${dateDE(date)}. Die Zahlen beruhen auf den erfassten Zahlungen und Ausgaben des Jahres ${st.year}.` },
      { t: 'sign', lines: signatureLines(s) },
    ],
    footer: footerLines(s),
    ...(s.signature && s.autoSign ? { signatures: { vermieter: s.signature } } : {}),
  };
}
