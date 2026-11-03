import { DB, Payment, Tenant, UnitKind } from './types';
import { addDays, openItems, today, unitDue } from './calc';
import { uid } from './store';
import { unitLetter } from './ids';

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

export function pickTextFile(accept = '.csv,text/csv,text/plain'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      decodeFile(f).then((text) => resolve({ name: f.name, text }), reject);
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
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.250 = tausendzweihundertfünfzig
  const v = Number(t);
  return isFinite(v) ? v : null;
}
export function parseDate(s: string): string | null {
  const t = String(s ?? '').trim();
  let y = '', mo = '', d = '';
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/);
  if (m) { y = m[3].length === 2 ? '20' + m[3] : m[3]; mo = m[2].padStart(2, '0'); d = m[1].padStart(2, '0'); }
  else { m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; [y, mo, d] = [m[1], m[2], m[3]]; }
  const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === `${y}-${mo}-${d}` ? `${y}-${mo}-${d}` : null;
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
  // Eindeutige Wohnungs-ID (H03-W12) im Verwendungszweck: sicherster Treffer
  const prop = db.properties.find((p) => p.id === unit?.propertyId);
  if (prop?.houseNo && unit?.no) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9])H\\s*0*${prop.houseNo}\\s*[-–_./ ]?\\s*${unitLetter(unit.kind)}\\s*0*${unit.no}(?![0-9])`, 'i');
    if (re.test(`${r.purpose} ${r.name}`)) s += 100;
  }
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

export function paymentsFromMatches(rows: MatchRow[], meta?: { importId: string; label: string }): Payment[] {
  const at = new Date().toISOString();
  return rows.filter((r) => r.include && r.tenantId).map((r) => ({
    id: uid(), tenantId: r.tenantId!, date: r.date, month: r.month, amount: r.amount, kind: r.kind, note: r.purpose.slice(0, 120),
    source: 'import' as const, createdAt: at, payer: r.name || undefined, importId: meta?.importId, importLabel: meta?.label,
  }));
}

/* ───────── Bestand (Häuser, Einheiten, Mieter) ───────── */

const BESTAND_HEADER = [
  'Haus', 'Straße', 'PLZ', 'Ort', 'Einheit', 'Typ', 'Fläche', 'Zimmer', 'Kaltmiete', 'Nebenkosten', 'USt',
  'Mieter', 'E-Mail', 'Telefon', 'IBAN', 'Einzug', 'Kaution', 'Offene Posten ab',
  // Objekt
  'Baujahr', 'Grundstück', 'Etagen', 'Heizung', 'Baujahr Heizung', 'Energieträger',
  'EA Art', 'EA Kennwert', 'EA Klasse', 'EA ausgestellt', 'EA gültig bis',
  'Grundbuch', 'Flurstück', 'Kaufdatum', 'Kaufpreis', 'Versicherer', 'Policennummer', 'Jahresprämie', 'Ansprechpartner', 'Ansprechpartner Telefon', 'Notizen Haus',
  // Einheit
  'Etage', 'Lage', 'Balkon', 'Keller', 'Stellplatz', 'Küche', 'Ausstattung', 'Notizen Einheit',
  // Mieter
  'Anrede', 'Mobil', 'Postanschrift', 'Notfallkontakt', 'Befristet bis', 'Kündigungsfrist', 'Mietanpassung', 'Nächste Anpassung', 'Kautionsart', 'Kautionskonto', 'Notizen Mieter',
];
const row = (o: Record<string, string>) => BESTAND_HEADER.map((h) => o[h] ?? '').join(';');
export const BESTAND_TEMPLATE =
  BESTAND_HEADER.join(';') + '\n' +
  row({ Haus: 'Haus Lindenstraße', Straße: 'Lindenstr. 12', PLZ: '50667', Ort: 'Köln', Einheit: 'Wohnung 1', Typ: 'Wohnung', Fläche: '62', Zimmer: '2', Kaltmiete: '640,00', Nebenkosten: '160,00', Mieter: 'Anna Schmidt', 'E-Mail': 'anna@example.de', Telefon: '0221 123456', Einzug: '01.06.2024', Kaution: '1920,00',
    Baujahr: '1998', Grundstück: '450', Etagen: '4', Heizung: 'Gas', 'Baujahr Heizung': '2015', Energieträger: 'Erdgas H', 'EA Art': 'Bedarf', 'EA Kennwert': '112', 'EA Klasse': 'C', 'EA ausgestellt': '15.03.2020', Versicherer: 'Muster Versicherung', Policennummer: 'GV-123456', Jahresprämie: '1850,00', Ansprechpartner: 'Hausmeister Meier', 'Ansprechpartner Telefon': '0171 555555',
    Etage: 'EG', Lage: 'links', Balkon: 'Terrasse', Keller: 'Ja', Küche: 'Einbauküche', Anrede: 'Frau', Mobil: '0171 1234567', Kündigungsfrist: '3', Mietanpassung: 'Indexmiete', 'Nächste Anpassung': '01.06.2027', Kautionsart: 'Kautionskonto' }) + '\n' +
  row({ Haus: 'Haus Lindenstraße', Einheit: 'Gewerbe 1', Typ: 'Gewerbe', Fläche: '85', Zimmer: '3', Kaltmiete: '1200,00', Nebenkosten: '250,00', USt: '19', Mieter: 'Muster Bäckerei GmbH', Einzug: '01.01.2023', Kaution: '3600,00', 'Befristet bis': '31.12.2027', Stellplatz: 'Hof 2' }) + '\n' +
  row({ Haus: 'Haus Lindenstraße', Einheit: 'Wohnung 2', Typ: 'Wohnung', Fläche: '70', Zimmer: '3', Etage: '1. OG' }) + '\n';

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
    // Objekt
    baujahr: col('Baujahr'), grundstueck: col('Grundstück', 'Grundstueck', 'Grundstücksfläche'), etagen: col('Etagen', 'Geschosse'), heizung: col('Heizung', 'Heizungsart'), heizBj: col('Baujahr Heizung', 'Heizung Baujahr'), traeger: col('Energieträger', 'Energietraeger'),
    eaArt: col('EA Art', 'Energieausweis Art'), eaWert: col('EA Kennwert', 'Energiekennwert'), eaKlasse: col('EA Klasse', 'Effizienzklasse'), eaAus: col('EA ausgestellt', 'EA Ausstellung'), eaBis: col('EA gültig bis', 'EA gueltig bis', 'EA bis'),
    grundbuch: col('Grundbuch'), flurstueck: col('Flurstück', 'Flurstueck'), kaufdatum: col('Kaufdatum'), kaufpreis: col('Kaufpreis'), versicherer: col('Versicherer', 'Gebäudeversicherung'), police: col('Policennummer', 'Police'), praemie: col('Jahresprämie', 'Praemie', 'Prämie'),
    kontakt: col('Ansprechpartner', 'Hausmeister'), kontaktTel: col('Ansprechpartner Telefon', 'Hausmeister Telefon'), notizHaus: col('Notizen Haus', 'Notiz Haus'),
    // Einheit
    etage: col('Etage', 'Geschoss'), lage: col('Lage'), balkon: col('Balkon', 'Balkon/Terrasse', 'Terrasse'), keller: col('Keller'), stellplatz: col('Stellplatz', 'Garage', 'Stellplatz/Garage'), kueche: col('Küche', 'Kueche'), ausstattung: col('Ausstattung'), notizEinheit: col('Notizen Einheit', 'Notiz Einheit'),
    // Mieter
    anrede: col('Anrede'), mobil: col('Mobil', 'Handy'), post: col('Postanschrift', 'Abweichende Postanschrift'), notfall: col('Notfallkontakt'), befristet: col('Befristet bis', 'Mietende', 'Vertragsende'), kuendigung: col('Kündigungsfrist', 'Kuendigungsfrist'),
    anpassung: col('Mietanpassung'), naechste: col('Nächste Anpassung', 'Naechste Anpassung'), kautionsart: col('Kautionsart'), kautionskonto: col('Kautionskonto'), notizMieter: col('Notizen Mieter', 'Notiz Mieter'),
  };
  if (c.haus < 0 || c.einheit < 0) return none('Die Spalten „Haus“ und „Einheit“ werden mindestens benötigt. Lade die Vorlage herunter und trage deine Daten ein.');
  const warnings: string[] = [];
  let line = 1;
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  /** Nur gefüllte Zellen: Text */
  const txt = (r: string[], i: number) => get(r, i) || undefined;
  /** Zahl als Text normalisiert (1.250,50 -> 1250.5) */
  const numTxt = (r: string[], i: number) => { const v = get(r, i); if (!v) return undefined; const n = parseAmount(v); if (n === null) { warnings.push(`Zeile ${line}: „${v}“ ist keine Zahl – ignoriert.`); return undefined; } return String(n); };
  const dateIso = (r: string[], i: number) => { const v = get(r, i); if (!v) return undefined; const d = parseDate(v); if (!d) { warnings.push(`Zeile ${line}: Datum „${v}“ nicht lesbar (JJJJ-MM-TT oder TT.MM.JJJJ) – ignoriert.`); return undefined; } return d; };
  /** Zahl (echter number-Wert), mit Warnung bei Unlesbarem */
  const numVal = (r: string[], i: number) => { const v = get(r, i); if (!v) return undefined; const n = parseAmount(v); if (n === null) { warnings.push(`Zeile ${line}: „${v}“ ist keine Zahl – ignoriert.`); return undefined; } return n; };
  /** undefined-Werte entfernen, damit leere Zellen nichts überschreiben */
  const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

  const next: DB = { ...db, properties: [...db.properties], units: [...db.units], tenants: [...db.tenants] };
  const sum = { properties: 0, units: 0, tenants: 0, updated: 0 };
  all.slice(1).forEach((r, i) => {
    line = i + 2;
    const hausName = get(r, c.haus);
    const einheitName = get(r, c.einheit);
    if (!hausName || !einheitName) { warnings.push(`Zeile ${line}: Haus oder Einheit fehlt – übersprungen.`); return; }

    // ── Objekt ──
    const eaAus = dateIso(r, c.eaAus);
    const eaBis = dateIso(r, c.eaBis) ?? (eaAus ? `${Number(eaAus.slice(0, 4)) + 10}${eaAus.slice(4)}` : undefined);
    const propData = defined({
      street: txt(r, c.str), zip: txt(r, c.plz), city: txt(r, c.ort), yearBuilt: txt(r, c.baujahr), notes: txt(r, c.notizHaus),
      plotArea: numTxt(r, c.grundstueck), floors: txt(r, c.etagen), heatingType: txt(r, c.heizung), heatingYear: txt(r, c.heizBj), energySource: txt(r, c.traeger),
      eaType: txt(r, c.eaArt), eaValue: numTxt(r, c.eaWert), eaClass: txt(r, c.eaKlasse)?.toUpperCase(), eaIssued: eaAus, eaValidUntil: eaBis,
      landRegister: txt(r, c.grundbuch), parcel: txt(r, c.flurstueck), purchaseDate: dateIso(r, c.kaufdatum), purchasePrice: numTxt(r, c.kaufpreis),
      insurer: txt(r, c.versicherer), policyNo: txt(r, c.police), premium: numTxt(r, c.praemie), contactName: txt(r, c.kontakt), contactPhone: txt(r, c.kontaktTel),
    });
    let prop = next.properties.find((p) => norm(p.name) === norm(hausName));
    if (!prop) {
      prop = { id: uid(), name: hausName, street: '', zip: '', city: '', yearBuilt: '', notes: '', ...propData };
      next.properties.push(prop); sum.properties++;
    } else if (Object.keys(propData).length) {
      const merged = { ...prop, ...propData };
      if (JSON.stringify(merged) !== JSON.stringify(prop)) { next.properties = next.properties.map((p) => (p.id === prop!.id ? merged : p)); prop = merged; sum.updated++; }
    }

    // ── Einheit ──
    const t = norm(get(r, c.typ));
    const kind: UnitKind | undefined = !t ? undefined : t.startsWith('gew') ? 'gewerbe' : t.startsWith('eig') || t === 'etw' ? 'eigentum' : 'wohnung';
    const vatRaw = numVal(r, c.ust) ?? null;
    const unitData = defined({
      kind, vat: kind === 'gewerbe' ? vatRaw ?? undefined : kind ? 0 : undefined,
      area: numVal(r, c.flaeche), rooms: numVal(r, c.zimmer), coldRent: numVal(r, c.kalt), advance: numVal(r, c.nk),
      floor: txt(r, c.etage), position: txt(r, c.lage), balcony: txt(r, c.balkon), cellar: txt(r, c.keller), parking: txt(r, c.stellplatz), kitchen: txt(r, c.kueche), equipment: txt(r, c.ausstattung), notes: txt(r, c.notizEinheit),
    });
    let unit = next.units.find((u) => u.propertyId === prop!.id && norm(u.name) === norm(einheitName));
    if (!unit) { unit = { id: uid(), propertyId: prop.id, name: einheitName, area: 0, rooms: 0, coldRent: 0, advance: 0, ...unitData }; next.units.push(unit); sum.units++; }
    else if (Object.keys(unitData).length) {
      const merged = { ...unit, ...unitData };
      if (JSON.stringify(merged) !== JSON.stringify(unit)) { next.units = next.units.map((u) => (u.id === unit!.id ? merged : u)); unit = merged; sum.updated++; }
    }

    // ── Mieter ──
    const tenantName = get(r, c.mieter);
    if (tenantName) {
      const einzugRaw = get(r, c.einzug);
      const einzug = parseDate(einzugRaw);
      if (!einzug) warnings.push(`Zeile ${line}: Einzugsdatum ${einzugRaw ? `„${einzugRaw}“ ist ungültig` : 'fehlt'} – heutiges Datum verwendet.`);
      const abRaw = get(r, c.ab);
      const ab = abRaw.match(/^(\d{1,2})\.(\d{4})$/) ? `${abRaw.split('.')[1]}-${abRaw.split('.')[0].padStart(2, '0')}` : parseDate(abRaw)?.slice(0, 7);
      const tenData = defined({
        email: txt(r, c.mail), phone: txt(r, c.tel), iban: get(r, c.iban) ? get(r, c.iban).replace(/\s/g, '').toUpperCase() : undefined, deposit: numVal(r, c.kaution),
        salutation: txt(r, c.anrede), mobile: txt(r, c.mobil), postalAddress: txt(r, c.post), emergencyContact: txt(r, c.notfall),
        contractEnd: dateIso(r, c.befristet), noticeMonths: numTxt(r, c.kuendigung), rentAdjust: txt(r, c.anpassung), nextAdjust: dateIso(r, c.naechste),
        depositType: txt(r, c.kautionsart), depositAccount: txt(r, c.kautionskonto), notes: txt(r, c.notizMieter),
      });
      const ex = next.tenants.find((x) => x.unitId === unit!.id && !x.moveOut && norm(x.name) === norm(tenantName));
      if (ex) {
        const merged = { ...ex, ...tenData, ...(einzug ? { moveIn: einzug } : {}) };
        if (JSON.stringify(merged) !== JSON.stringify(ex)) { next.tenants = next.tenants.map((x) => (x.id === ex.id ? merged : x)); sum.updated++; }
      } else {
        next.tenants.push({ id: uid(), unitId: unit.id, name: tenantName, email: '', phone: '', moveIn: einzug ?? today(), moveOut: '', deposit: 0, trackFrom: ab ?? today().slice(0, 7), ...tenData });
        sum.tenants++;
      }
    }
  });
  return { db: next, summary: sum, warnings: warnings.slice(0, 10) };
}
