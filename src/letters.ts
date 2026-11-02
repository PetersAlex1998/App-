import { DB, Property, Reminder, Tenant, Unit } from './types';
import { NkResult, dateDE, eur, monthLabel, openItems } from './calc';
import type { Settings } from './settings';

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const levelTitle = ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung – letzte Zahlungsaufforderung'];

function senderBlock(s: Settings) {
  const lines = [s.name || 'Hausverwaltung', s.street, `${s.zip} ${s.city}`.trim(), s.phone, s.email].filter((x) => x && x.trim());
  return `<div style="text-align:right;font-size:12px;color:#444;line-height:1.5">${lines.map(esc).join('<br>')}</div>`;
}
function returnLine(s: Settings) {
  const t = [s.name, s.street, `${s.zip} ${s.city}`.trim()].filter((x) => x && x.trim()).join(' · ');
  return t ? `<div class="small" style="border-bottom:1px solid #999;display:inline-block;margin-bottom:4px">${esc(t)}</div>` : '';
}
function bankBlock(s: Settings, unit: Unit, t: Tenant) {
  if (!s.iban) return '<p class="small">Bitte überweisen Sie auf das Ihnen bekannte Mietkonto.</p>';
  return `<table style="width:auto"><tr><td class="small">Empfänger</td><td>${esc(s.name || '')}</td></tr>
<tr><td class="small">IBAN</td><td>${esc(s.iban)}</td></tr>${s.bic ? `<tr><td class="small">BIC</td><td>${esc(s.bic)}</td></tr>` : ''}${s.bank ? `<tr><td class="small">Bank</td><td>${esc(s.bank)}</td></tr>` : ''}
<tr><td class="small">Verwendungszweck</td><td>Miete ${esc(unit.name)} – ${esc(t.name)}</td></tr></table>`;
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
  return `<div class="page">
${senderBlock(s)}
<div style="margin-top:24px">${returnLine(s)}<br>${esc(t.name)}<br>${esc(prop.street)}<br>${esc(prop.zip)} ${esc(prop.city)}<br><span class="small">${esc(unit.name)}</span></div>
<p style="text-align:right;margin-top:24px">${dateDE(r.date)}</p>
<h1>${levelTitle[r.level]}</h1>
<p class="small">Mietverhältnis: ${esc(prop.name)}, ${esc(unit.name)}</p>
<p>Sehr geehrte Damen und Herren,</p>
<p>${intro}</p>
<table><tr><th>Monat</th><th class="r">Soll</th><th class="r">Gezahlt</th><th class="r">Offen</th></tr>${rows}
${r.fee ? `<tr><td colspan="3">Mahngebühr</td><td class="r">${eur(r.fee)}</td></tr>` : ''}
<tr class="sum"><td colspan="3">Zu zahlender Gesamtbetrag</td><td class="r">${eur(r.amount + r.fee)}</td></tr></table>
<p>Bitte überweisen Sie den Betrag bis spätestens <b>${dateDE(r.deadline)}</b>.</p>
${bankBlock(s, unit, t)}
<p style="margin-top:28px">Mit freundlichen Grüßen<br>${esc(s.name || 'Ihre Hausverwaltung')}</p>
</div>`;
}

export function nkHtml(res: NkResult, t: Tenant, unit: Unit, prop: Property, year: number, s: Settings): string {
  const rows = res.lines.map((l) => `<tr><td>${esc(l.category)}</td><td>${l.key}</td><td class="r">${eur(l.total)}</td><td class="r">${eur(l.share)}</td></tr>`).join('');
  const verdict = res.balance > 0 ? `Nachzahlung: ${eur(res.balance)}` : `Guthaben: ${eur(-res.balance)}`;
  return `<div class="page">${senderBlock(s)}
<h1 style="margin-top:24px">Nebenkostenabrechnung ${year}</h1>
<p>${esc(prop.name)}, ${esc(prop.street)}, ${esc(prop.zip)} ${esc(prop.city)}<br>Mieter: ${esc(t.name)} · ${esc(unit.name)} (${unit.area} m²)<br>Abrechnungszeitraum: ${res.months} Monat(e)</p>
<table><tr><th>Kostenart</th><th>Schlüssel</th><th class="r">Gesamt</th><th class="r">Ihr Anteil</th></tr>${rows}
<tr class="sum"><td colspan="3">Summe Ihrer Kosten</td><td class="r">${eur(res.costs)}</td></tr>
<tr><td colspan="3">abzgl. Vorauszahlungen</td><td class="r">${eur(res.advances)}</td></tr>
<tr class="sum"><td colspan="3">${verdict}</td><td class="r">${eur(res.balance)}</td></tr></table>
<p class="small">Die Abrechnung wurde anteilig nach Mietmonaten erstellt.</p></div>`;
}
