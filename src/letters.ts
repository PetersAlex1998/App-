import { DB, Property, Reminder, Tenant, Unit } from './types';
import { NkResult, dateDE, eur, monthLabel, openItems } from './calc';
import type { Settings } from './settings';

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Nachname aus „Anna Schmidt“, „Schmidt, Anna“ oder „Dr. Anna Schmidt“. */
export function lastName(name: string): string {
  const n = name.trim();
  if (n.includes(',')) return n.split(',')[0].trim();
  const parts = n.split(/\s+/);
  return parts[parts.length - 1] ?? n;
}
/** „Schmidt, Anna“ -> „Anna Schmidt“ für die Adresszeile. */
const displayName = (name: string) => (name.includes(',') && !isMultiName(name) ? name.split(',').reverse().map((x) => x.trim()).join(' ') : name.trim());
const isMultiName = (name: string) => /( und | & |\+|\/)/i.test(name);
const isMulti = (name: string) => /( und | & |\+|\/)/i.test(name);

/** Briefanrede nach Anrede-Feld; bei mehreren Mietern oder Firmen neutral. */
export function salutationLine(t: Tenant): string {
  const sal = (t.salutation ?? '').trim();
  const nm = lastName(t.name);
  if (!nm || isMulti(t.name) || sal === 'Firma' || !sal) return 'Sehr geehrte Damen und Herren,';
  if (sal === 'Herr') return `Sehr geehrter Herr ${esc(nm)},`;
  if (sal === 'Frau') return `Sehr geehrte Frau ${esc(nm)},`;
  if (sal === 'Familie') return `Sehr geehrte Familie ${esc(nm)},`;
  return 'Sehr geehrte Damen und Herren,';
}

/** Empfängerblock: Postanschrift, falls hinterlegt, sonst Adresse des Objekts. */
export function addressLines(t: Tenant, prop: Property, unit: Unit): { lines: string[]; unitNote?: string } {
  const sal = (t.salutation ?? '').trim();
  const nm = displayName(t.name);
  const nameLine = isMulti(t.name) || sal === 'Firma' || !sal ? nm : sal === 'Herr' ? `Herrn ${nm}` : sal === 'Frau' ? `Frau ${nm}` : sal === 'Familie' && !/^familie/i.test(nm) ? `Familie ${lastName(t.name)}` : nm;
  const post = (t.postalAddress ?? '').split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
  if (post.length) return { lines: [nameLine, ...post] };
  return { lines: [nameLine, prop.street, `${prop.zip} ${prop.city}`.trim()].filter((x) => x && x.trim()), unitNote: unit.name };
}
/** Rücksendeangabe (kleine Zeile über der Anschrift im Fensterumschlag). */
function returnText(s: Settings) {
  return [s.name, s.street, `${s.zip} ${s.city}`.trim()].filter((x) => x && x.trim()).join(' · ');
}

/**
 * Briefbogen nach DIN 5008 (Form B) für Fensterumschläge und Hybridpost-Dienste:
 * Anschriftfeld 20 mm von links / 45 mm von oben (85 × 45 mm), Rücksendezeile darüber,
 * Infoblock rechts, Falz- und Lochmarke, Textbeginn bei 98,5 mm.
 */
function letterShell(s: Settings, t: Tenant, prop: Property, unit: Unit, dateIso: string, infoLines: string[], bodyHtml: string): string {
  const a = addressLines(t, prop, unit);
  const ret = returnText(s);
  return `<div class="page">
<i class="mark" style="top:105mm"></i><i class="mark loch" style="top:148.5mm"></i><i class="mark" style="top:210mm"></i>
<div class="head">${senderBlock(s)}</div>
${ret ? `<div class="ret">${esc(ret)}</div>` : ''}
<div class="addr">${a.lines.map(esc).join('<br>')}${a.unitNote ? `<br><span class="small">${esc(a.unitNote)}</span>` : ''}</div>
<div class="info"><div><b>Datum:</b> ${dateDE(dateIso)}</div>${infoLines.map((l) => `<div>${l}</div>`).join('')}</div>
<div class="main"><div class="spacer"></div>${bodyHtml}</div>
${footerBlock(s)}
</div>`;
}

const levelTitle = ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung – letzte Zahlungsaufforderung'];

function senderBlock(s: Settings) {
  const lines = [s.name || 'Hausverwaltung', s.street, `${s.zip} ${s.city}`.trim(), s.phone, s.email].filter((x) => x && x.trim());
  const text = `<div style="text-align:right;font-size:9pt;color:#444;line-height:1.45">${lines.map(esc).join('<br>')}</div>`;
  if (!s.logo) return text;
  return `<table style="width:100%;border-collapse:collapse;margin:0"><tr><td style="border:none;padding:0;vertical-align:top"><img src="${s.logo}" alt="" style="max-height:24mm;max-width:70mm"></td><td style="border:none;padding:0;vertical-align:top">${text}</td></tr></table>`;
}
function footerBlock(s: Settings) {
  const lines = [s.footer, s.iban ? `IBAN ${s.iban}${s.bic ? ' · BIC ' + s.bic : ''}${s.bank ? ' · ' + s.bank : ''}` : ''].filter((x) => x && x.trim());
  return lines.length ? `<div class="foot">${lines.map((l) => esc(l).replace(/\n/g, '<br>')).join('<br>')}</div>` : '';
}
function bankBlock(s: Settings, unit: Unit, t: Tenant, purpose = 'Miete') {
  if (!s.iban) return '<p class="small">Bitte überweisen Sie auf das Ihnen bekannte Mietkonto.</p>';
  return `<table style="width:auto"><tr><td class="small">Empfänger</td><td>${esc(s.name || '')}</td></tr>
<tr><td class="small">IBAN</td><td>${esc(s.iban)}</td></tr>${s.bic ? `<tr><td class="small">BIC</td><td>${esc(s.bic)}</td></tr>` : ''}${s.bank ? `<tr><td class="small">Bank</td><td>${esc(s.bank)}</td></tr>` : ''}
<tr><td class="small">Verwendungszweck</td><td>${esc(purpose)} ${esc(unit.name)} – ${esc(t.name)}</td></tr></table>`;
}

/** Ein Mahnbrief als HTML-Abschnitt (eine Seite). */
export function reminderHtml(db: DB, r: Reminder, t: Tenant, unit: Unit, prop: Property, s: Settings): string {
  const items = r.items ?? openItems(db, t);
  const rows = items.map((i) => `<tr><td>${monthLabel(i.month)}</td><td class="r">${eur(i.due)}</td><td class="r">${eur(i.paid)}</td><td class="r">${eur(i.open)}</td></tr>`).join('');
  const intro = [
    '',
    'bei der Durchsicht unserer Buchhaltung haben wir festgestellt, dass die folgenden Mietzahlungen noch nicht bei uns eingegangen sind. Möglicherweise handelt es sich um ein Versehen. Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
    'trotz unserer Zahlungserinnerung konnten wir den Eingang der folgenden Mietzahlungen nicht feststellen. Wir bitten Sie, den offenen Betrag zuzüglich der Mahngebühr fristgerecht zu überweisen.',
    'trotz unserer bisherigen Schreiben sind die folgenden Mietzahlungen weiterhin offen. Wir fordern Sie letztmalig auf, den Gesamtbetrag bis zur genannten Frist zu zahlen. Andernfalls behalten wir uns weitere rechtliche Schritte vor.',
  ][r.level];
  const body = `<h1>${levelTitle[r.level]}</h1>
<p>${salutationLine(t)}</p>
<p>${intro}</p>
<table><tr><th>Monat</th><th class="r">Soll</th><th class="r">Gezahlt</th><th class="r">Offen</th></tr>${rows}
${r.fee ? `<tr><td colspan="3">Mahngebühr</td><td class="r">${eur(r.fee)}</td></tr>` : ''}
<tr class="sum"><td colspan="3">Zu zahlender Gesamtbetrag</td><td class="r">${eur(r.amount + r.fee)}</td></tr></table>
<p>Bitte überweisen Sie den Betrag bis spätestens <b>${dateDE(r.deadline)}</b>.</p>
${bankBlock(s, unit, t)}
<p style="margin-top:8mm">Mit freundlichen Grüßen<br>${esc(s.name || 'Ihre Hausverwaltung')}</p>`;
  return letterShell(s, t, prop, unit, r.date, [`<b>Objekt:</b> ${esc(prop.name)}`, `<b>Einheit:</b> ${esc(unit.name)}`], body);
}

export function nkHtml(res: NkResult, t: Tenant, unit: Unit, prop: Property, year: number, s: Settings): string {
  const rows = res.lines.map((l) => `<tr><td>${esc(l.category)}</td><td>${esc(l.key)}</td><td class="r">${eur(l.total)}</td><td class="r">${eur(l.share)}</td></tr>`).join('');
  const verdict = res.balance > 0 ? `Nachzahlung: ${eur(res.balance)}` : `Guthaben: ${eur(-res.balance)}`;
  const outro = res.balance > 0
    ? `Bitte überweisen Sie die Nachzahlung von <b>${eur(res.balance)}</b> innerhalb von 30 Tagen nach Zugang dieser Abrechnung.`
    : res.balance < 0 ? `Das Guthaben von <b>${eur(-res.balance)}</b> erstatten wir Ihnen bzw. verrechnen es mit der nächsten Miete.` : 'Die Abrechnung ist ausgeglichen.';
  const body = `<h1>Nebenkostenabrechnung ${year}</h1>
<p>${salutationLine(t)}</p>
<p>nachfolgend erhalten Sie die Abrechnung der Betriebskosten für das Jahr ${year}. Abrechnungszeitraum: ${res.months} Monat(e).</p>
<table><tr><th>Kostenart</th><th>Verteilung</th><th class="r">Gesamt</th><th class="r">Ihr Anteil</th></tr>${rows}
<tr class="sum"><td colspan="3">Summe Ihrer Kosten</td><td class="r">${eur(res.costs)}</td></tr>
<tr><td colspan="3">abzgl. Vorauszahlungen</td><td class="r">${eur(res.advances)}</td></tr>
<tr class="sum"><td colspan="3">${verdict}</td><td class="r">${eur(res.balance)}</td></tr></table>
<p>${outro}</p>
${res.balance > 0 ? bankBlock(s, unit, t, `Nebenkosten ${year}`) : ''}
<p class="small">Die Abrechnung wurde anteilig nach Mietmonaten erstellt.</p>
<p style="margin-top:8mm">Mit freundlichen Grüßen<br>${esc(s.name || 'Ihre Hausverwaltung')}</p>`;
  return letterShell(s, t, prop, unit, new Date().toISOString().slice(0, 10), [`<b>Objekt:</b> ${esc(prop.name)}`, `<b>Einheit:</b> ${esc(unit.name)} (${unit.area} m²)`], body);
}

/** Beispielbrief für die Vorschau des Briefkopfs. */
export function sampleLetterHtml(s: Settings): string {
  const prop: Property = { id: 'p', name: 'Haus Lindenstraße', street: 'Lindenstr. 12', zip: '50667', city: 'Köln', yearBuilt: '', notes: '' };
  const unit: Unit = { id: 'u', propertyId: 'p', name: 'WE 2, 1. OG', area: 70, rooms: 3, coldRent: 700, advance: 160 };
  const t: Tenant = { id: 't', unitId: 'u', name: 'Erika Mustermann', salutation: 'Frau', email: '', phone: '', moveIn: '2024-01-01', moveOut: '', deposit: 0 };
  const items = [{ month: '2026-09', due: 860, paid: 0, open: 860 }, { month: '2026-10', due: 860, paid: 0, open: 860 }];
  const r: Reminder = { id: 'x', tenantId: 't', date: new Date().toISOString().slice(0, 10), level: 2, amount: 1720, fee: s.fee2, deadline: new Date(Date.now() + s.deadlineDays * 86400000).toISOString().slice(0, 10), items };
  return reminderHtml({ properties: [prop], units: [unit], tenants: [t], payments: [], reminders: [], costs: [], meters: [], readings: [], documents: [] }, r, t, unit, prop, s);
}
