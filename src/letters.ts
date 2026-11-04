import { bankRows, footerLines, returnLine, senderLines, signatureLines } from './company';
import { DB, Property, Reminder, Tenant, Unit } from './types';
import { NkResult, dateDE, eur, monthLabel, openItems } from './calc';
import type { Settings } from './settings';
import { unitRef } from './ids';

/* ───────── Brief-Modell: daraus entstehen HTML (Druck) und PDF (Versand) ───────── */

export type Block =
  | { t: 'h1'; text: string }
  | { t: 'p'; text: string; small?: boolean } // **fett** möglich
  | { t: 'table'; head: string[]; align: ('l' | 'r')[]; widths: number[]; rows: { cells: string[]; bold?: boolean; span?: number }[] }
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'sign'; lines: string[] };

export interface LetterModel {
  title: string; // Betreff / Dateiname
  senderLines: string[];
  logo?: string; // Data-URL
  returnLine: string;
  address: string[];
  unitNote?: string;
  date: string; // ISO
  info: [string, string][]; // Infoblock rechts: [Bezeichnung, Wert]
  blocks: Block[];
  footer: string[];
  guides?: boolean; // Testbrief: Fensterrahmen einzeichnen (nur im PDF)
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** **fett** -> <b> (nach dem Maskieren) */
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/** Nachname aus „Anna Schmidt“, „Schmidt, Anna“ oder „Dr. Anna Schmidt“. */
export function lastName(name: string): string {
  const n = name.trim();
  if (n.includes(',')) return n.split(',')[0].trim();
  const parts = n.split(/\s+/);
  return parts[parts.length - 1] ?? n;
}
const isMulti = (name: string) => /( und | & |\+|\/)/i.test(name);
/** „Schmidt, Anna“ -> „Anna Schmidt“ für die Adresszeile. */
const displayName = (name: string) => (name.includes(',') && !isMulti(name) ? name.split(',').reverse().map((x) => x.trim()).join(' ') : name.trim());

/** Briefanrede (Klartext) nach Anrede-Feld; bei mehreren Mietern oder Firmen neutral. */
export function salutationText(t: Tenant): string {
  const sal = (t.salutation ?? '').trim();
  const nm = lastName(t.name);
  if (!nm || isMulti(t.name) || sal === 'Firma' || !sal) return 'Sehr geehrte Damen und Herren,';
  if (sal === 'Herr') return `Sehr geehrter Herr ${nm},`;
  if (sal === 'Frau') return `Sehr geehrte Frau ${nm},`;
  if (sal === 'Familie') return `Sehr geehrte Familie ${nm},`;
  return 'Sehr geehrte Damen und Herren,';
}
/** Wie salutationText, aber für HTML maskiert (Abwärtskompatibilität). */
export const salutationLine = (t: Tenant) => esc(salutationText(t));

/** Empfängerblock: Postanschrift, falls hinterlegt, sonst Adresse des Objekts. */
export function addressLines(t: Tenant, prop: Property, unit: Unit): { lines: string[]; unitNote?: string } {
  const sal = (t.salutation ?? '').trim();
  const nm = displayName(t.name);
  const nameLine = isMulti(t.name) || sal === 'Firma' || !sal ? nm : sal === 'Herr' ? `Herrn ${nm}` : sal === 'Frau' ? `Frau ${nm}` : sal === 'Familie' && !/^familie/i.test(nm) ? `Familie ${lastName(t.name)}` : nm;
  const post = (t.postalAddress ?? '').split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
  if (post.length) return { lines: [nameLine, ...post] };
  return { lines: [nameLine, prop.street, `${prop.zip} ${prop.city}`.trim()].filter((x) => x && x.trim()), unitNote: unit.name };
}

const levelTitle = ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung – letzte Zahlungsaufforderung'];

export function frame(s: Settings, t: Tenant, prop: Property, unit: Unit, date: string, info: [string, string][], title: string, blocks: Block[]): LetterModel {
  const a = addressLines(t, prop, unit);
  const ref = unitRef(prop, unit);
  if (ref) info = [...info, ['Kennung', ref]];
  return {
    title,
    senderLines: senderLines(s),
    logo: s.logo || undefined,
    returnLine: returnLine(s),
    address: a.lines, unitNote: a.unitNote, date, info, blocks,
    footer: footerLines(s),
  };
}

function bankBlocks(s: Settings, unit: Unit, t: Tenant, purpose = 'Miete', prop?: Property): Block[] {
  if (!s.iban) return [{ t: 'p', small: true, text: 'Bitte überweisen Sie auf das Ihnen bekannte Mietkonto.' }];
  const ref = unitRef(prop, unit);
  const rows: [string, string][] = bankRows(s);
  rows.push(['Verwendungszweck', ref ? `${purpose} ${ref}` : `${purpose} ${unit.name} – ${t.name}`]);
  const blocks: Block[] = [{ t: 'kv', rows }];
  if (ref) blocks.push({ t: 'p', small: true, text: `Bitte geben Sie bei jeder Zahlung die Kennung ${ref} als Verwendungszweck an, damit wir Ihre Zahlung zuordnen können.` });
  return blocks;
}

/* ───────── Modelle ───────── */

export function reminderModel(db: DB, r: Reminder, t: Tenant, unit: Unit, prop: Property, s: Settings): LetterModel {
  const items = r.items ?? openItems(db, t);
  const intro = [
    '',
    'bei der Durchsicht unserer Buchhaltung haben wir festgestellt, dass die folgenden Mietzahlungen noch nicht bei uns eingegangen sind. Möglicherweise handelt es sich um ein Versehen. Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
    'trotz unserer Zahlungserinnerung konnten wir den Eingang der folgenden Mietzahlungen nicht feststellen. Wir bitten Sie, den offenen Betrag zuzüglich der Mahngebühr fristgerecht zu überweisen.',
    'trotz unserer bisherigen Schreiben sind die folgenden Mietzahlungen weiterhin offen. Wir fordern Sie letztmalig auf, den Gesamtbetrag bis zur genannten Frist zu zahlen. Andernfalls behalten wir uns weitere rechtliche Schritte vor.',
  ][r.level];
  const rows: { cells: string[]; bold?: boolean; span?: number }[] = items.map((i) => ({ cells: [monthLabel(i.month), eur(i.due), eur(i.paid), eur(i.open)] }));
  if (r.fee) rows.push({ cells: ['Mahngebühr', '', '', eur(r.fee)], span: 3 });
  rows.push({ cells: ['Zu zahlender Gesamtbetrag', '', '', eur(r.amount + r.fee)], bold: true, span: 3 });
  return frame(s, t, prop, unit, r.date, [['Objekt', prop.name], ['Einheit', unit.name]], `${levelTitle[r.level]} – ${t.name}`, [
    { t: 'h1', text: levelTitle[r.level] },
    { t: 'p', text: salutationText(t) },
    { t: 'p', text: intro },
    { t: 'table', head: ['Monat', 'Soll', 'Gezahlt', 'Offen'], align: ['l', 'r', 'r', 'r'], widths: [0.4, 0.2, 0.2, 0.2], rows },
    { t: 'p', text: `Bitte überweisen Sie den Betrag bis spätestens **${dateDE(r.deadline)}**.` },
    ...bankBlocks(s, unit, t, 'Miete', prop),
    { t: 'sign', lines: signatureLines(s) },
  ]);
}

export function nkModel(res: NkResult, t: Tenant, unit: Unit, prop: Property, year: number, s: Settings, date = new Date().toISOString().slice(0, 10)): LetterModel {
  const rows: { cells: string[]; bold?: boolean; span?: number }[] = res.lines.map((l) => ({ cells: [l.category, l.key, eur(l.total), eur(l.share)] }));
  const verdict = res.balance > 0 ? `Nachzahlung: ${eur(res.balance)}` : `Guthaben: ${eur(-res.balance)}`;
  rows.push({ cells: ['Summe Ihrer Kosten', '', '', eur(res.costs)], bold: true, span: 3 });
  rows.push({ cells: ['abzgl. Vorauszahlungen', '', '', eur(res.advances)], span: 3 });
  rows.push({ cells: [verdict, '', '', eur(res.balance)], bold: true, span: 3 });
  const outro = res.balance > 0
    ? `Bitte überweisen Sie die Nachzahlung von **${eur(res.balance)}** innerhalb von 30 Tagen nach Zugang dieser Abrechnung.`
    : res.balance < 0 ? `Das Guthaben von **${eur(-res.balance)}** erstatten wir Ihnen bzw. verrechnen es mit der nächsten Miete.` : 'Die Abrechnung ist ausgeglichen.';
  return frame(s, t, prop, unit, date, [['Objekt', prop.name], ['Einheit', `${unit.name} (${unit.area} m²)`]], `Nebenkostenabrechnung ${year} – ${t.name}`, [
    { t: 'h1', text: `Nebenkostenabrechnung ${year}` },
    { t: 'p', text: salutationText(t) },
    { t: 'p', text: `nachfolgend erhalten Sie die Abrechnung der Betriebskosten für das Jahr ${year}. Abrechnungszeitraum: ${res.months} Monat(e).` },
    { t: 'table', head: ['Kostenart', 'Verteilung', 'Gesamt', 'Ihr Anteil'], align: ['l', 'l', 'r', 'r'], widths: [0.26, 0.42, 0.16, 0.16], rows },
    { t: 'p', text: outro },
    ...(res.balance > 0 ? bankBlocks(s, unit, t, `Nebenkosten ${year}`, prop) : []),
    { t: 'p', small: true, text: 'Die Abrechnung wurde anteilig nach Mietmonaten erstellt.' },
    { t: 'sign', lines: signatureLines(s) },
  ]);
}

/** Mitteilung über die Anpassung der Nebenkostenvorauszahlung nach einer Abrechnung (§ 560 Abs. 4 BGB). */
export function advanceModel(t: Tenant, unit: Unit, prop: Property, year: number, current: number, proposed: number, from: string, s: Settings, date = new Date().toISOString().slice(0, 10)): LetterModel {
  const up = proposed > current;
  const fromDe = from.split('-').reverse().join('.');
  return frame(s, t, prop, unit, date, [['Objekt', prop.name], ['Einheit', `${unit.name} (${unit.area} m²)`]], `Anpassung der Nebenkostenvorauszahlung – ${t.name}`, [
    { t: 'h1', text: 'Anpassung der Nebenkostenvorauszahlung' },
    { t: 'p', text: salutationText(t) },
    { t: 'p', text: `auf Grundlage der Nebenkostenabrechnung für das Jahr ${year} passen wir die monatliche Vorauszahlung auf die Betriebskosten gemäß § 560 Abs. 4 BGB auf einen angemessenen Betrag an.` },
    { t: 'kv', rows: [['Bisherige Vorauszahlung', eur(current)], ['Neue Vorauszahlung', eur(proposed)], [up ? 'Erhöhung' : 'Senkung', eur(Math.abs(proposed - current))], ['Gültig ab', fromDe], ['Neue Gesamtmiete', eur(unit.coldRent + proposed)]] },
    { t: 'p', text: `Bitte zahlen Sie ab dem ${fromDe} monatlich die neue Vorauszahlung zusammen mit der Miete. ${up ? 'Die Anpassung beruht auf den tatsächlich entstandenen Kosten des Abrechnungsjahres.' : 'Die Vorauszahlung sinkt, weil die tatsächlichen Kosten niedriger waren.'}` },
    { t: 'sign', lines: signatureLines(s) },
  ]);
}

/** Fehlende Pflichtangaben für den Testbrief (Absender = Empfänger). */
export function testLetterMissing(s: Settings): string[] {
  const m: string[] = [];
  if (!s.name.trim()) m.push('Name oder Firma');
  if (!s.street.trim()) m.push('Straße');
  if (!s.zip.trim()) m.push('PLZ');
  if (!s.city.trim()) m.push('Ort');
  return m;
}

/** Testbrief an dich selbst: Empfänger sind die Absenderdaten. Prüft Fensterposition, Marken, Logo und Zeichensatz. */
export function testLetterModel(s: Settings, date = new Date().toISOString().slice(0, 10)): LetterModel {
  const prop: Property = { id: 'p', name: 'Testbrief', street: s.street, zip: s.zip, city: s.city, yearBuilt: '', notes: '' };
  const unit: Unit = { id: 'u', propertyId: 'p', name: '', area: 0, rooms: 0, coldRent: 0, advance: 0 };
  const t: Tenant = { id: 'self', unitId: 'u', name: s.name, salutation: 'Firma', email: '', phone: '', moveIn: date, moveOut: '', deposit: 0 };
  const bankKv: Block = { t: 'kv', rows: bankRows(s) };
  const check: [string, string][] = [
    ['1', 'Die Anschrift (oben links) ist vollständig im Fenster sichtbar, nichts ist abgeschnitten.'],
    ['2', 'Die kleine Rücksendezeile über der Anschrift ist lesbar.'],
    ['3', 'Logo und Absender oben sind gut platziert und nicht beschnitten.'],
    ['4', 'Am linken Rand sind drei kleine Marken (Falz, Loch, Falz) zu sehen.'],
    ['5', 'Die Fußzeile mit der Bankverbindung ist vollständig.'],
    ['6', 'Die Sonderzeichen unten sind korrekt dargestellt.'],
  ];
  return {
    ...frame(s, t, prop, unit, date, [['Art', 'Testbrief']], `Testbrief – ${s.name}`, [
      { t: 'h1', text: 'Testbrief an Sie selbst' },
      { t: 'p', text: 'Sehr geehrte Damen und Herren,' },
      { t: 'p', text: 'dies ist ein Testbrief. Er geht an Ihre eigene Adresse und zeigt, ob Ihre Briefe beim Versand richtig aussehen. Bitte prüfen Sie den ausgedruckten bzw. zugestellten Brief:' },
      { t: 'table', head: ['Nr.', 'Prüfpunkt'], align: ['l', 'l'], widths: [0.1, 0.9], rows: check.map(([n, x]) => ({ cells: [n, x] })) },
      { t: 'p', text: 'Sonderzeichen: ä ö ü Ä Ö Ü ß € – „Anführungszeichen“ · m² · m³ · 1.234,56 €' },
      { t: 'p', small: true, text: 'Die gestrichelte Linie zeigt das Sichtfenster (85 × 45 mm, 20 mm von links, 45 mm von oben). Sie erscheint nur auf diesem Testbrief, nicht auf echten Briefen.' },
      ...(s.iban ? [bankKv] : []),
      { t: 'sign', lines: signatureLines(s) },
    ]),
    guides: true,
  };
}

export function sampleModel(s: Settings): LetterModel {
  const prop: Property = { id: 'p', name: 'Haus Lindenstraße', street: 'Lindenstr. 12', zip: '50667', city: 'Köln', yearBuilt: '', notes: '', houseNo: 1 };
  const unit: Unit = { id: 'u', propertyId: 'p', name: 'Wohnung 2', no: 2, area: 70, rooms: 3, coldRent: 700, advance: 160 };
  const t: Tenant = { id: 't', unitId: 'u', name: 'Erika Mustermann', salutation: 'Frau', email: '', phone: '', moveIn: '2024-01-01', moveOut: '', deposit: 0 };
  const items = [{ month: '2026-09', due: 860, paid: 0, open: 860 }, { month: '2026-10', due: 860, paid: 0, open: 860 }];
  const r: Reminder = { id: 'x', tenantId: 't', date: new Date().toISOString().slice(0, 10), level: 2, amount: 1720, fee: s.fee2, deadline: new Date(Date.now() + s.deadlineDays * 86400000).toISOString().slice(0, 10), items };
  return reminderModel({ properties: [prop], units: [unit], tenants: [t], payments: [], reminders: [], costs: [], expenses: [], calculations: [], meters: [], readings: [], documents: [] }, r, t, unit, prop, s);
}

/* ───────── HTML-Renderer (Druck, DIN 5008) ───────── */

function blockHtml(b: Block): string {
  switch (b.t) {
    case 'h1': return `<h1>${esc(b.text)}</h1>`;
    case 'p': return `<p${b.small ? ' class="small"' : ''}>${rich(b.text)}</p>`;
    case 'sign': return `<p style="margin-top:8mm">${b.lines.map(esc).join('<br>')}</p>`;
    case 'kv': return `<table style="width:auto">${b.rows.map(([k, v]) => `<tr><td class="small">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
    case 'table': {
      const head = `<tr>${b.head.map((h, i) => `<th${b.align[i] === 'r' ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr>`;
      const rows = b.rows.map((r) => {
        const span = r.span ?? 1;
        const cells = r.cells.map((c, i) => (i > 0 && i < span ? '' : `<td${span > 1 && i === 0 ? ` colspan="${span}"` : ''}${b.align[i] === 'r' ? ' class="r"' : ''}>${esc(c)}</td>`)).join('');
        return `<tr${r.bold ? ' class="sum"' : ''}>${cells}</tr>`;
      }).join('');
      return `<table>${head}${rows}</table>`;
    }
  }
}

export function modelToHtml(m: LetterModel): string {
  const text = `<div style="text-align:right;font-size:9pt;color:#444;line-height:1.45">${m.senderLines.map(esc).join('<br>')}</div>`;
  const head = m.logo
    ? `<table style="width:100%;border-collapse:collapse;margin:0"><tr><td style="border:none;padding:0;vertical-align:top"><img src="${m.logo}" alt="" style="max-height:24mm;max-width:70mm"></td><td style="border:none;padding:0;vertical-align:top">${text}</td></tr></table>`
    : text;
  return `<div class="page">
<i class="mark" style="top:105mm"></i><i class="mark loch" style="top:148.5mm"></i><i class="mark" style="top:210mm"></i>
<div class="head">${head}</div>
${m.returnLine ? `<div class="ret">${esc(m.returnLine)}</div>` : ''}
<div class="addr">${m.address.map(esc).join('<br>')}${m.unitNote ? `<br><span class="small">${esc(m.unitNote)}</span>` : ''}</div>
<div class="info"><div><b>Datum:</b> ${dateDE(m.date)}</div>${m.info.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>
<div class="main"><div class="spacer"></div>${m.blocks.map(blockHtml).join('\n')}</div>
${m.footer.length ? `<div class="foot">${m.footer.map(esc).join('<br>')}</div>` : ''}
</div>`;
}

/* ───────── Abwärtskompatible Funktionen ───────── */

export const reminderHtml = (db: DB, r: Reminder, t: Tenant, unit: Unit, prop: Property, s: Settings) => modelToHtml(reminderModel(db, r, t, unit, prop, s));
export const nkHtml = (res: NkResult, t: Tenant, unit: Unit, prop: Property, year: number, s: Settings) => modelToHtml(nkModel(res, t, unit, prop, year, s));
export const sampleLetterHtml = (s: Settings) => modelToHtml(sampleModel(s));

/** Mieterhöhung nach § 558 BGB (Vergleichsmiete, mit Zustimmungserklärung) oder § 557b BGB (Indexmiete). */
export function rentIncreaseModel(kind: 'vergleich' | 'index', t: Tenant, unit: Unit, prop: Property, s: Settings, c: { currentRent: number; newRent: number; effective: string; consentUntil?: string; comparePerSqm?: number; indexOld?: number; indexNew?: number; advance: number }, date = new Date().toISOString().slice(0, 10)): LetterModel {
  const de = (iso: string) => iso.split('-').reverse().join('.');
  const inc = c.newRent - c.currentRent;
  const pct = c.currentRent > 0 ? Math.round((inc / c.currentRent) * 1000) / 10 : 0;
  const per = unit.area > 0 ? Math.round((c.newRent / unit.area) * 100) / 100 : 0;
  const rows: [string, string][] = [['Bisherige Kaltmiete', eur(c.currentRent)], ['Neue Kaltmiete', eur(c.newRent)], ['Erhöhung', `${eur(inc)} (${pct.toLocaleString('de-DE')} %)`]];
  if (unit.area > 0) rows.push(['Neue Kaltmiete pro m²', `${eur(per)} bei ${unit.area} m²`]);
  rows.push(['Nebenkosten-Vorauszahlung (unverändert)', eur(c.advance)], ['Neue Gesamtmiete', eur(c.newRent + c.advance)], ['Gilt ab', de(c.effective)]);
  const info: [string, string][] = [['Objekt', prop.name], ['Einheit', `${unit.name} (${unit.area} m²)`]];
  if (kind === 'index') {
    const idxPct = c.indexOld && c.indexNew ? Math.round(((c.indexNew - c.indexOld) / c.indexOld) * 1000) / 10 : 0;
    return frame(s, t, prop, unit, date, info, `Mieterhöhung (Indexmiete) – ${t.name}`, [
      { t: 'h1', text: 'Mieterhöhung nach § 557b BGB (Indexmiete)' },
      { t: 'p', text: salutationText(t) },
      { t: 'p', text: `die im Mietvertrag vereinbarte Indexmiete verändert sich entsprechend der Entwicklung des Verbraucherpreisindex für Deutschland. Daraus ergibt sich die folgende Erhöhung der Kaltmiete.` },
      { t: 'kv', rows: [['Index bei der letzten Mietfestsetzung', String(c.indexOld ?? '')], ['Aktueller Index', String(c.indexNew ?? '')], ['Veränderung', `${idxPct.toLocaleString('de-DE')} %`], ...rows] },
      { t: 'p', text: `Berechnung: ${eur(c.currentRent)} × ${c.indexNew} ÷ ${c.indexOld} = ${eur(c.newRent)}. Die neue Miete ist ab dem ${de(c.effective)} zu zahlen. Eine Zustimmung ist nicht erforderlich.` },
      { t: 'sign', lines: signatureLines(s) },
    ]);
  }
  return frame(s, t, prop, unit, date, info, `Mieterhöhungsverlangen – ${t.name}`, [
    { t: 'h1', text: 'Mieterhöhungsverlangen nach § 558 BGB' },
    { t: 'p', text: salutationText(t) },
    { t: 'p', text: `wir bitten Sie, einer Erhöhung der monatlichen Kaltmiete auf die ortsübliche Vergleichsmiete zuzustimmen.` },
    { t: 'kv', rows },
    { t: 'p', text: c.comparePerSqm ? `Begründung: Die ortsübliche Vergleichsmiete für vergleichbaren Wohnraum beträgt laut Mietspiegel ${eur(c.comparePerSqm)} pro m². Die neue Miete von ${eur(per)} pro m² liegt innerhalb dieser Grenze. Die Kappungsgrenze von 20 % bzw. 15 % innerhalb von drei Jahren ist eingehalten.` : 'Begründung: Bitte ergänzen (Mietspiegel, Sachverständigengutachten oder Vergleichswohnungen).' },
    { t: 'p', text: `Bitte stimmen Sie der Erhöhung bis zum **${c.consentUntil ? de(c.consentUntil) : ''}** zu. Stimmen Sie zu, schulden Sie die neue Miete ab dem ${de(c.effective)}. Stimmen Sie nicht zu, müssen wir die Zustimmung gegebenenfalls gerichtlich geltend machen.` },
    { t: 'p', small: true, text: 'Sie können das Mietverhältnis bis zum Ablauf des zweiten Monats nach Zugang dieses Schreibens zum Ablauf des übernächsten Monats kündigen (§ 561 BGB). Dann tritt die Erhöhung nicht ein.' },
    { t: 'sign', lines: signatureLines(s) },
    { t: 'h1', text: 'Zustimmungserklärung' },
    { t: 'p', text: `Ich stimme der Erhöhung der Kaltmiete für ${unit.name} (${prop.name}) auf ${eur(c.newRent)} ab dem ${de(c.effective)} zu.` },
    { t: 'p', text: 'Ort, Datum: ______________________    Unterschrift Mieter: ______________________' },
  ]);
}
