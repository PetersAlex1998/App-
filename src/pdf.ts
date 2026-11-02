import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { DB, Property, Reminder, Tenant, Unit } from './types';
import { NkResult, dateDE, eur, openItems } from './calc';

const css = `<style>body{font-family:Helvetica,Arial,sans-serif;padding:40px;color:#111;font-size:13px}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:16px 0}
td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}td.r,th.r{text-align:right}
.sum{font-weight:bold}.small{color:#555;font-size:11px}</style>`;

export async function exportPdf(html: string) {
  const doc = `<html><head><meta charset="utf-8">${css}</head><body>${html}</body></html>`;
  if (Platform.OS === 'web') {
    await Print.printAsync({ html: doc });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html: doc });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

const label = ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung (letzte Aufforderung)'];

export function reminderHtml(db: DB, r: Reminder, t: Tenant, unit: Unit, prop: Property) {
  const items = openItems(db, t);
  const rows = items
    .map((i) => `<tr><td>${i.month.split('-').reverse().join('/')}</td><td class="r">${eur(i.due)}</td><td class="r">${eur(i.paid)}</td><td class="r">${eur(i.open)}</td></tr>`)
    .join('');
  return `<p class="small">${prop.name} · ${prop.street}, ${prop.zip} ${prop.city}</p>
<p>${t.name}<br>${prop.street}<br>${prop.zip} ${prop.city}<br>(${unit.name})</p>
<p style="text-align:right">${dateDE(r.date)}</p>
<h1>${label[r.level]}</h1>
<p>Sehr geehrte/r ${t.name},</p>
<p>nach unseren Unterlagen sind folgende Mietzahlungen noch offen:</p>
<table><tr><th>Monat</th><th class="r">Soll</th><th class="r">Gezahlt</th><th class="r">Offen</th></tr>${rows}
${r.fee ? `<tr><td colspan="3">Mahngebühr</td><td class="r">${eur(r.fee)}</td></tr>` : ''}
<tr class="sum"><td colspan="3">Gesamtforderung</td><td class="r">${eur(r.amount + r.fee)}</td></tr></table>
<p>Bitte überweisen Sie den Betrag bis spätestens <b>${dateDE(r.deadline)}</b>.</p>
<p>Mit freundlichen Grüßen<br>Ihre Hausverwaltung</p>`;
}

export function nkHtml(res: NkResult, t: Tenant, unit: Unit, prop: Property, year: number) {
  const rows = res.lines
    .map((l) => `<tr><td>${l.category}</td><td>${l.key}</td><td class="r">${eur(l.total)}</td><td class="r">${eur(l.share)}</td></tr>`)
    .join('');
  const verdict = res.balance > 0 ? `Nachzahlung: ${eur(res.balance)}` : `Guthaben: ${eur(-res.balance)}`;
  return `<h1>Nebenkostenabrechnung ${year}</h1>
<p>${prop.name}, ${prop.street}, ${prop.zip} ${prop.city}<br>Mieter: ${t.name} · ${unit.name} (${unit.area} m²)<br>Abrechnungszeitraum: ${res.months} Monat(e)</p>
<table><tr><th>Kostenart</th><th>Schlüssel</th><th class="r">Gesamt</th><th class="r">Ihr Anteil</th></tr>${rows}
<tr class="sum"><td colspan="3">Summe Ihrer Kosten</td><td class="r">${eur(res.costs)}</td></tr>
<tr><td colspan="3">abzgl. Vorauszahlungen</td><td class="r">${eur(res.advances)}</td></tr>
<tr class="sum"><td colspan="3">${verdict}</td><td class="r">${eur(res.balance)}</td></tr></table>
<p class="small">Die Abrechnung wurde anteilig nach Mietmonaten erstellt.</p>`;
}
