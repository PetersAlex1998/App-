import { DB, Payment, Tenant } from './types';
import { addDays, openItems, today, unitDue } from './calc';
import { uid } from './store';

/* ───────── CSV lesen ───────── */

/** Text einer Datei lesen: erst UTF-8, bei Fehler Windows-1252 (viele Banken, Excel). */
export async function decodeFile(file: { arrayBuffer: () => Promise<ArrayBuffer> }): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function pickTextFile(accept = '.csv,text/csv,text/plain'): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      decodeFile(f).then(resolve, reject);
    };
    input.click();
  });
}

export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = count(';') >= count('\t') && count(';') >= count(',') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export const norm = (s: string) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const normKey = (s: string) => norm(s).replace(/ /g, '');

export function parseAmount(s: string): number | null {
  let t = String(s ?? '').replace(/[€\s]|EUR/gi, '').replace(/^\+/, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const v = Number(t);
  return isFinite(v) ? v : null;
}
export function parseDate(s: string): string | null {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const findCol = (headers: string[], pred: (k: string) => boolean) => headers.findIndex((h) => pred(normKey(h)));

/* ───────── Kontoauszug ───────── */

export interface BankRow {
  id: string; date: string; amount: number; name: string; purpose: string; iban: string;
}
export interface BankParse { rows: BankRow[]; skippedOutgoing: number; error?: string; columns?: string }

export function parseBankCsv(text: string): BankParse {
  const all = parseCsv(text);
  // Kopfzeile finden (manche Banken schreiben Vorspann-Zeilen davor)
  const hi = all.findIndex((r) => {
    const ks = r.map(normKey);
    return ks.some((k) => /buchung|valuta|datum|wert/.test(k)) && ks.some((k) => k.startsWith('betrag') || k === 'soll' || k === 'haben' || k.includes('umsatz'));
  });
  if (hi === -1) return { rows: [], skippedOutgoing: 0, error: 'Die Spalten wurden nicht erkannt. Erwartet werden mindestens Buchungsdatum und Betrag in der Kopfzeile.' };
  const h = all[hi];
  const cDate = [findCol(h, (k) => k === 'buchungstag' || k === 'buchungsdatum'), findCol(h, (k) => k === 'valuta' || k.startsWith('wertstellung')), findCol(h, (k) => k.includes('datum') || k.includes('buchung'))].find((i) => i >= 0) ?? -1;
  const cAmt = findCol(h, (k) => k.startsWith('betrag') || k === 'umsatz');
  const cSoll = findCol(h, (k) => k === 'soll'), cHaben = findCol(h, (k) => k === 'haben');
  const purposeCols = h.map((x, i) => (/verwendungszweck|buchungstext|zweck|beschreibung/.test(normKey(x)) ? i : -1)).filter((i) => i >= 0);
  const cName = findCol(h, (k) => /zahlungspflichtig|auftraggeber|zahlungsbeteiligter|beguenstigter|empfaenger|^name/.test(k) && !k.includes('iban') && !k.includes('bic'));
  const cIban = [findCol(h, (k) => k.includes('iban') && /zahlungsbeteiligter|beguenstigter|auftraggeber|gegen|zahlungspflichtig/.test(k)), findCol(h, (k) => k.includes('iban') && !/auftragskonto|eigen/.test(k)), findCol(h, (k) => k.includes('kontonummer'))].find((i) => i >= 0) ?? -1;
  if (cDate < 0 || (cAmt < 0 && (cSoll < 0 || cHaben < 0))) return { rows: [], skippedOutgoing: 0, error: 'Datum oder Betrag wurden nicht gefunden. Prüfe die Kopfzeile der Datei.' };

  const rows: BankRow[] = [];
  let skipped = 0;
  all.slice(hi + 1).forEach((r, i) => {
    const date = parseDate(r[cDate] ?? '');
    const amount = cAmt >= 0 ? parseAmount(r[cAmt] ?? '') : (parseAmount(r[cHaben] ?? '') ?? 0) - (parseAmount(r[cSoll] ?? '') ?? 0);
    if (!date || amount === null || amount === 0) return;
    if (amount < 0) { skipped++; return; }
    rows.push({ id: `b${i}`, date, amount: Math.round(amount * 100) / 100, name: r[cName] ?? '', iban: (r[cIban] ?? '').replace(/\s/g, '').toUpperCase(), purpose: purposeCols.map((c) => r[c] ?? '').filter(Boolean).join(' ') });
  });
  return { rows, skippedOutgoing: skipped, columns: `Datum „${h[cDate]}“, Betrag „${h[cAmt >= 0 ? cAmt : cHaben]}“${cName >= 0 ? `, Name „${h[cName]}“` : ''}${cIban >= 0 ? ', IBAN' : ''}` };
}

export type MatchStatus = 'sicher' | 'pruefen' | 'offen' | 'doppelt';
export interface MatchRow extends BankRow {
  tenantId: string | null; score: number; status: MatchStatus; month: string; kind: Payment['kind']; include: boolean;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];
function monthFromText(text: string): string | null {
  const n = norm(text);
  let m = text.match(/\b(0?[1-9]|1[0-2])[./](20\d{2})\b/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = n.match(/\b(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|dez)\w*\s+(20\d{2})\b/);
  return m ? `${m[2]}-${String(MONTH_NAMES.indexOf(m[1]) + 1).padStart(2, '0')}` : null;
}

function scoreTenant(db: DB, t: Tenant, r: BankRow): number {
  const hay = ` ${norm(`${r.name} ${r.purpose}`)} `;
  let s = 0;
  if (t.iban && r.iban && t.iban.replace(/\s/g, '').toUpperCase() === r.iban) s += 100;
  const tokens = norm(t.name).split(' ').filter((w) => w.length >= 2);
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 2 && tokens.every((w) => hay.includes(` ${w} `))) s += 70;
  else if (last && last.length >= 3 && hay.includes(` ${last} `)) s += 50;
  const unit = db.units.find((u) => u.id === t.unitId);
  const un = unit ? norm(unit.name) : '';
  if (un.length >= 3 && hay.includes(` ${un} `)) s += 25;
  if (unit && Math.abs(r.amount - unitDue(unit)) < 0.01) s += 25;
  return s;
}

/** Ordnet Eingänge Mietern zu. `overrides`: manuelle Zuordnung (Mieter-ID oder null = ignorieren) und Häkchen. */
export function matchRows(db: DB, rows: BankRow[], overrides: Record<string, { tenantId?: string | null; include?: boolean }> = {}): MatchRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let sim: DB = { ...db, payments: [...db.payments] }; // Simulation: Buchungen dieses Laufs zählen für „ältester offener Monat“
  const out: MatchRow[] = [];
  for (const r of sorted) {
    const candidates = db.tenants.filter((t) => t.moveIn <= addDays(r.date, 31) && (!t.moveOut || t.moveOut >= addDays(r.date, -62)));
    const scored = candidates.map((t) => ({ t, s: scoreTenant(db, t, r) })).sort((a, b) => b.s - a.s);
    const ov = overrides[r.id];
    let tenantId: string | null = scored[0] && scored[0].s >= 40 ? scored[0].t.id : null;
    let score = scored[0]?.s ?? 0;
    const tie = scored.length > 1 && scored[0].s === scored[1].s && scored[0].s > 0;
    if (ov && 'tenantId' in ov) { tenantId = ov.tenantId ?? null; score = tenantId ? 100 : 0; }
    const tenant = db.tenants.find((t) => t.id === tenantId);
    let status: MatchStatus = !tenant ? 'offen' : score >= 75 && !tie ? 'sicher' : 'pruefen';
    const dup = tenant && db.payments.some((p) => p.tenantId === tenant.id && p.date === r.date && Math.abs(p.amount - r.amount) < 0.01);
    if (dup) status = 'doppelt';
    const text = `${r.purpose} ${r.name}`;
    const nt = norm(text);
    const kind: Payment['kind'] = nt.includes('kaution') ? 'kaution' : /nebenkosten|betriebskosten|nachzahlung|abrechnung/.test(nt) ? 'nachzahlung' : 'miete';
    let month = r.date.slice(0, 7);
    if (tenant && kind === 'miete') {
      month = monthFromText(text) ?? openItems(sim, tenant)[0]?.month ?? month;
    }
    const include = ov?.include ?? status === 'sicher';
    if (tenant && include && status !== 'doppelt') {
      sim = { ...sim, payments: [...sim.payments, { id: r.id, tenantId: tenant.id, date: r.date, month, amount: r.amount, kind, note: '' }] };
    }
    out.push({ ...r, tenantId: tenant?.id ?? null, score, status, month, kind, include: include && !!tenant && status !== 'doppelt' });
  }
  return out;
}

export function paymentsFromMatches(rows: MatchRow[]): Payment[] {
  return rows.filter((r) => r.include && r.tenantId).map((r) => ({ id: uid(), tenantId: r.tenantId!, date: r.date, month: r.month, amount: r.amount, kind: r.kind, note: r.purpose.slice(0, 120) }));
}

/* ───────── Bestand (Häuser, Einheiten, Mieter) ───────── */

export const BESTAND_TEMPLATE =
  'Haus;Straße;PLZ;Ort;Einheit;Typ;Fläche;Zimmer;Kaltmiete;Nebenkosten;USt;Mieter;E-Mail;Telefon;IBAN;Einzug;Kaution;Offene Posten ab\n' +
  'Haus Lindenstraße;Lindenstr. 12;50667;Köln;WE 1 EG links;Wohnung;62;2;640,00;160,00;;Anna Schmidt;anna@example.de;0171 1234567;;01.06.2024;1920,00;\n' +
  'Haus Lindenstraße;Lindenstr. 12;50667;Köln;Laden EG;Gewerbe;85;3;1200,00;250,00;19;Muster Bäckerei GmbH;;;;01.01.2023;3600,00;\n' +
  'Haus Lindenstraße;Lindenstr. 12;50667;Köln;WE 3 1. OG;Wohnung;70;3;;;;;;;;;;\n';

export interface BestandPlan { db: DB; summary: { properties: number; units: number; tenants: number; updated: number }; warnings: string[]; error?: string }

export function planBestandImport(db: DB, text: string): BestandPlan {
  const all = parseCsv(text);
  const none = (error: string): BestandPlan => ({ db, summary: { properties: 0, units: 0, tenants: 0, updated: 0 }, warnings: [], error });
  if (all.length < 2) return none('Die Datei enthält keine Datenzeilen.');
  const h = all[0];
  const col = (...names: string[]) => findCol(h, (k) => names.some((n) => k === normKey(n)));
  const c = {
    haus: col('Haus', 'Objekt', 'Gebäude'), str: col('Straße', 'Strasse', 'Adresse'), plz: col('PLZ'), ort: col('Ort', 'Stadt'),
    einheit: col('Einheit', 'Wohnung', 'Bezeichnung'), typ: col('Typ', 'Art', 'Nutzung'), flaeche: col('Fläche', 'Flaeche', 'Wohnfläche', 'm²', 'qm'), zimmer: col('Zimmer'),
    kalt: col('Kaltmiete', 'Nettokaltmiete', 'Miete'), nk: col('Nebenkosten', 'NK', 'NK-Vorauszahlung', 'Vorauszahlung'), ust: col('USt', 'MwSt', 'Umsatzsteuer'),
    mieter: col('Mieter', 'Name'), mail: col('E-Mail', 'Email', 'Mail'), tel: col('Telefon', 'Tel'), iban: col('IBAN'), einzug: col('Einzug', 'Mietbeginn'), kaution: col('Kaution'), ab: col('Offene Posten ab', 'Konto ab', 'Mietkonto ab'),
  };
  if (c.haus < 0 || c.einheit < 0) return none('Die Spalten „Haus“ und „Einheit“ werden mindestens benötigt. Lade die Vorlage herunter und trage deine Daten ein.');
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const next: DB = { properties: [...db.properties], units: [...db.units], tenants: [...db.tenants], payments: db.payments, reminders: db.reminders, costs: db.costs, meters: db.meters, readings: db.readings, documents: db.documents };
  const sum = { properties: 0, units: 0, tenants: 0, updated: 0 };
  const warnings: string[] = [];
  all.slice(1).forEach((r, i) => {
    const line = i + 2;
    const hausName = get(r, c.haus).trim();
    const einheitName = get(r, c.einheit).trim();
    if (!hausName || !einheitName) { warnings.push(`Zeile ${line}: Haus oder Einheit fehlt – übersprungen.`); return; }
    let prop = next.properties.find((p) => norm(p.name) === norm(hausName));
    if (!prop) {
      prop = { id: uid(), name: hausName, street: get(r, c.str), zip: get(r, c.plz), city: get(r, c.ort), yearBuilt: '', notes: '' };
      next.properties.push(prop); sum.properties++;
    }
    const t = norm(get(r, c.typ));
    const kind = t.startsWith('gew') ? 'gewerbe' : t.startsWith('eig') || t === 'etw' ? 'eigentum' : 'wohnung';
    const vatRaw = parseAmount(get(r, c.ust)) ?? 0;
    const unitData = { kind: kind as 'wohnung' | 'gewerbe' | 'eigentum', vat: kind === 'gewerbe' ? vatRaw : 0, area: parseAmount(get(r, c.flaeche)) ?? 0, rooms: parseAmount(get(r, c.zimmer)) ?? 0, coldRent: parseAmount(get(r, c.kalt)) ?? 0, advance: parseAmount(get(r, c.nk)) ?? 0 };
    let unit = next.units.find((u) => u.propertyId === prop!.id && norm(u.name) === norm(einheitName));
    if (!unit) { unit = { id: uid(), propertyId: prop.id, name: einheitName, ...unitData }; next.units.push(unit); sum.units++; }
    else { Object.assign(unit, unitData); next.units = next.units.map((u) => (u.id === unit!.id ? { ...unit! } : u)); sum.updated++; }
    const tenantName = get(r, c.mieter).trim();
    if (tenantName) {
      const moveIn = parseDate(get(r, c.einzug)) ?? today();
      if (!parseDate(get(r, c.einzug))) warnings.push(`Zeile ${line}: Einzugsdatum fehlt oder ist unlesbar – heutiges Datum verwendet.`);
      const abRaw = get(r, c.ab).trim();
      const abMonth = (abRaw.match(/^(\d{1,2})\.(\d{4})$/) ? `${abRaw.split('.')[1]}-${abRaw.split('.')[0].padStart(2, '0')}` : parseDate(abRaw)?.slice(0, 7)) || today().slice(0, 7);
      const td = { trackFrom: abMonth, name: tenantName, email: get(r, c.mail), phone: get(r, c.tel), iban: get(r, c.iban).replace(/\s/g, '').toUpperCase(), moveIn, deposit: parseAmount(get(r, c.kaution)) ?? 0 };
      const ex = next.tenants.find((x) => x.unitId === unit!.id && !x.moveOut && norm(x.name) === norm(tenantName));
      if (ex) { next.tenants = next.tenants.map((x) => (x.id === ex.id ? { ...x, ...td, moveIn: parseDate(get(r, c.einzug)) ?? x.moveIn } : x)); sum.updated++; }
      else { next.tenants.push({ id: uid(), unitId: unit.id, moveOut: '', ...td }); sum.tenants++; }
    }
  });
  return { db: next, summary: sum, warnings: warnings.slice(0, 8) };
}
