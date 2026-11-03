import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BESTAND_TEMPLATE, applyMatches, matchRows, parseAmount, parseBankCsv, parseCsv, parseDate, paymentsFromMatches, planBestandImport, planZaehlerImport, scoreRows } from '../../src/csv';
import { emptyDB } from '../../src/types';
import { dueMonths } from '../../src/calc';
import { normalizeIds } from '../../src/ids';
import { dbWith, payment, property, resetIds, tenant, unit } from '../helpers/builders';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T12:00:00Z')); resetIds(); });
afterEach(() => vi.useRealTimers());

describe('CSV lesen', () => {
  it('erkennt Trennzeichen ; , und Tab', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('Anführungszeichen, Trennzeichen und Zeilenumbrüche im Feld', () => {
    expect(parseCsv('a,b,"c,d"\n1,2,"x ""y"""')).toEqual([['a', 'b', 'c,d'], ['1', '2', 'x "y"']]);
    expect(parseCsv('a;b\n"zwei\nZeilen";2')).toEqual([['a', 'b'], ['zwei\nZeilen', '2']]);
  });
  it('BOM, Windows-Zeilenenden und Leerzeilen', () => {
    expect(parseCsv('﻿a;b\r\n1;2\r\n\r\n3;4\r\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
});

describe('Zahlen und Datum', () => {
  it.each([
    ['800,00', 800], ['1.725,50', 1725.5], ['-250,00', -250], ['+55,30', 55.3], ['1250', 1250], ['1.250', 1250], ['12.345.678', 12345678], ['1250.5', 1250.5], ['800 €', 800], ['EUR 99,90', 99.9],
  ])('parseAmount(%s) = %s', (inp, out) => { expect(parseAmount(inp)).toBe(out); });
  it('Unlesbares ist null', () => { expect(parseAmount('abc')).toBeNull(); expect(parseAmount('')).toBeNull(); });
  it.each([['03.11.2026', '2026-11-03'], ['3.1.26', '2026-01-03'], ['2026-11-03', '2026-11-03'], ['03.11.2026 14:30', '2026-11-03']])('parseDate(%s)', (inp, out) => { expect(parseDate(inp)).toBe(out); });
  it('ungültige Daten werden abgelehnt', () => {
    expect(parseDate('32.13.2024')).toBeNull();
    expect(parseDate('31.02.2026')).toBeNull();
    expect(parseDate('morgen')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('Kontoauszug einlesen', () => {
  const sparkasse = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE11500105170000000001";"03.11.26";"03.11.26";"GUTSCHRIFT";"Miete November 2026 WE 1";"Anna Schmidt";"DE89370400440532013000";"COBADEFF";"800,00";"EUR";"Umsatz gebucht"
"DE11500105170000000001";"04.11.26";"04.11.26";"GUTSCHRIFT";"Miete Laden";"Muster Bäckerei GmbH";"DE00000000000000000000";"XX";"1.785,00";"EUR";"Umsatz gebucht"
"DE11500105170000000001";"06.11.26";"06.11.26";"LASTSCHRIFT";"Hausmeister Rechnung";"Hausmeister Meier";"DE13";"XX";"-250,00";"EUR";"Umsatz gebucht"`;
  const dkb = `"Konto";"Girokonto";
"Von:";"01.11.2026";
"";
"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)"
"03.11.26";"03.11.26";"Gebucht";"SCHMIDT, ANNA";"Vermieter";"MIETE 11/2026";"Eingang";"DE89370400440532013000";"800,00"`;

  it('Sparkasse-Format: Eingänge, Ausgang übersprungen, Spalten erkannt', () => {
    const r = parseBankCsv(sparkasse);
    expect(r.rows).toHaveLength(2);
    expect(r.skippedOutgoing).toBe(1);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-03', amount: 800, name: 'Anna Schmidt', iban: 'DE89370400440532013000' });
    expect(r.columns).toContain('Buchungstag');
  });
  it('DKB-Format mit Vorspann-Zeilen', () => {
    const r = parseBankCsv(dkb);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-03', amount: 800, name: 'SCHMIDT, ANNA' });
  });
  it('Soll/Haben-Spalten statt Betrag', () => {
    const r = parseBankCsv('Buchungstag;Verwendungszweck;Soll;Haben\n03.11.2026;Miete;;800,00\n04.11.2026;Strom;50,00;');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBe(800);
    expect(r.skippedOutgoing).toBe(1);
  });
  it('unlesbare Datei: klare Fehlermeldung', () => {
    expect(parseBankCsv('foo;bar\n1;2').error).toMatch(/nicht erkannt/);
    expect(parseBankCsv('Buchungstag;Text\n03.11.2026;x').error).toBeTruthy();
  });
  it('Windows-Umlaute und Sonderzeichen im Verwendungszweck bleiben erhalten', () => {
    const r = parseBankCsv('Buchungstag;Verwendungszweck;Betrag\n03.11.2026;Miete für Müller & Söhne;800,00');
    expect(r.rows[0].purpose).toBe('Miete für Müller & Söhne');
  });
});

/** Zwei Häuser mit gleicher Wohnungsnummer, damit Verwechslungen auffallen. */
function mieter() {
  const db = normalizeIds(dbWith({
    properties: [property({ id: 'pa', name: 'Haus A' }), property({ id: 'pb', name: 'Haus B' })],
    units: [unit('pa', { id: 'u1', name: 'Wohnung 3' }), unit('pa', { id: 'u2', name: 'Wohnung 13', coldRent: 700 }), unit('pb', { id: 'u3', name: 'Gewerbe 3', kind: 'gewerbe', vat: 19, coldRent: 900, advance: 100 }), unit('pb', { id: 'u4', name: 'Wohnung 3' })],
    tenants: [tenant('u1', { id: 'ta', name: 'Anna Schmidt', moveIn: '2025-01-01', iban: 'DE89370400440532013000' }), tenant('u2', { id: 'tb', name: 'Anna Schmidt', moveIn: '2025-01-01' }), tenant('u3', { id: 'tc', name: 'Muster GmbH', moveIn: '2025-01-01' }), tenant('u4', { id: 'td', name: 'Max Becker', moveIn: '2025-01-01' })],
  }));
  return db;
}
const row = (purpose: string, name = 'Unbekannt', amount = 800, date = '2026-11-03', iban = '') => ({ id: `r-${purpose}-${name}`, date, amount, name, purpose, iban });
const match = (db: ReturnType<typeof mieter>, ...rows: ReturnType<typeof row>[]) => matchRows(db, rows);

describe('Zuordnung der Zahlungen', () => {
  it.each([['Miete H01-W03', 'ta'], ['miete h1 w13 november', 'tb'], ['Miete H02 G03', 'tc'], ['H02-W03 Nov', 'td'], ['Miete H01-W3', 'ta'], ['Miete H01W03', 'ta']])('Wohnungs-ID im Verwendungszweck: %s -> %s', (zweck, erwartet) => {
    const [m] = match(mieter(), row(zweck, 'Irgendwer', 12.34));
    expect(m.tenantId).toBe(erwartet);
    expect(m.status).toBe('sicher');
  });
  it('gleiche Nummer in zwei Häusern wird nicht verwechselt', () => {
    const db = mieter();
    expect(match(db, row('H01-W03'))[0].tenantId).toBe('ta');
    expect(match(db, row('H02-W03'))[0].tenantId).toBe('td');
  });
  it('Nummern mit zusätzlichen Ziffern (W031) treffen keine andere Wohnung', () => {
    expect(match(mieter(), row('H01-W031', 'Nummernfalle'))[0].tenantId).toBeNull();
  });
  it('IBAN-Treffer ist sicher', () => {
    const [m] = match(mieter(), row('Dauerauftrag', 'Fremder Name', 12.34, '2026-11-03', 'DE89370400440532013000'));
    expect(m).toMatchObject({ tenantId: 'ta', status: 'sicher' });
  });
  it('Nachname + exakter Mietbetrag ist sicher, nur Nachname ist „prüfen“', () => {
    const db = mieter();
    expect(match(db, row('Miete', 'Max Becker', 800))[0]).toMatchObject({ tenantId: 'td', status: 'sicher' });
    expect(match(db, row('Miete', 'Max Becker', 11))[0]).toMatchObject({ tenantId: 'td', status: 'pruefen' });
  });
  it('gleicher Name bei zwei Mietern ohne weitere Hinweise: Gleichstand = prüfen', () => {
    const [m] = match(mieter(), row('Miete', 'Anna Schmidt', 12.34));
    expect(m.status).toBe('pruefen');
  });
  it('kein Treffer: nicht zugeordnet', () => {
    expect(match(mieter(), row('Stadtwerke Rückzahlung', 'Stadtwerke Köln', 55.3))[0]).toMatchObject({ tenantId: null, status: 'offen', include: false });
  });
  it('Gewerbe: Mietbetrag wird brutto verglichen', () => {
    const [m] = match(mieter(), row('Miete', 'Muster GmbH', 1190));
    expect(m).toMatchObject({ tenantId: 'tc', status: 'sicher' }); // (900+100)*1,19
  });
  it('bereits gebuchte Zahlung (auch manuell erfasst) ist „doppelt“ und nicht ausgewählt', () => {
    const db = { ...mieter(), payments: [payment('ta', '2026-11', 800, { date: '2026-11-03' })] };
    expect(matchRows(db, [row('H01-W03', 'Anna Schmidt', 800)])[0]).toMatchObject({ status: 'doppelt', include: false });
  });
  it('Art wird aus dem Text erkannt: Kaution, Nebenkosten, Miete', () => {
    const db = mieter();
    expect(match(db, row('Kaution H01-W03', 'x', 1920))[0].kind).toBe('kaution');
    expect(match(db, row('Nebenkostennachzahlung H01-W03', 'x', 120))[0].kind).toBe('nachzahlung');
    expect(match(db, row('Miete H01-W03', 'x', 800))[0].kind).toBe('miete');
  });
  it('Monat: aus dem Text, sonst ältester offener Monat', () => {
    const db = { ...mieter(), tenants: mieter().tenants.map((t) => ({ ...t, trackFrom: '2026-09' })) };
    expect(matchRows(db, [row('Miete 10/2026 H01-W03', 'x', 800)])[0].month).toBe('2026-10');
    expect(matchRows(db, [row('Miete Oktober 2026 H01-W03', 'x', 800)])[0].month).toBe('2026-10');
    expect(matchRows(db, [row('Miete H01-W03', 'x', 800)])[0].month).toBe('2026-09');
  });
  it('mehrere Zahlungen desselben Mieters füllen nacheinander die offenen Monate', () => {
    const db = { ...mieter(), tenants: mieter().tenants.map((t) => ({ ...t, trackFrom: '2026-09' })) };
    const r = matchRows(db, [row('H01-W03', 'x', 800, '2026-11-03'), row('H01-W03 b', 'x', 800, '2026-11-04'), row('H01-W03 c', 'x', 800, '2026-11-05')]);
    expect(r.map((x) => x.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });
  it('Änderungen: Häkchen entfernen verschiebt den Monat der Folgezahlung', () => {
    const db = { ...mieter(), tenants: mieter().tenants.map((t) => ({ ...t, trackFrom: '2026-09' })) };
    const rows = [row('H01-W03', 'x', 800, '2026-11-03'), row('H01-W03 b', 'x', 800, '2026-11-04')];
    const sc = scoreRows(db, rows);
    expect(applyMatches(db, sc).map((x) => x.month)).toEqual(['2026-09', '2026-10']);
    expect(applyMatches(db, sc, { [rows[0].id]: { include: false } }).map((x) => x.month)).toEqual(['2026-09', '2026-09']);
  });
  it('manuelle Zuordnung überschreibt die Erkennung und gilt als sicher', () => {
    const db = mieter();
    const rows = [row('Unklar', 'Unbekannt', 800)];
    const [m] = applyMatches(db, scoreRows(db, rows), { [rows[0].id]: { tenantId: 'td' } });
    expect(m).toMatchObject({ tenantId: 'td', status: 'sicher', include: true });
    const [n] = applyMatches(db, scoreRows(db, rows), { [rows[0].id]: { tenantId: null } });
    expect(n).toMatchObject({ tenantId: null, include: false });
  });
  it('nur zum Zeitpunkt wohnende Mieter kommen infrage', () => {
    const db = { ...mieter(), tenants: mieter().tenants.map((t) => (t.id === 'ta' ? { ...t, moveOut: '2025-03-31' } : t)) };
    expect(matchRows(db, [row('H01-W03', 'x', 800, '2026-11-03')])[0].tenantId).toBeNull();
  });
});

describe('Buchungen aus dem Import', () => {
  it('tragen Herkunft, Absender und Import-ID', () => {
    const db = mieter();
    const m = matchRows(db, [row('Miete H01-W03', 'Anna Schmidt', 800)]);
    const [p] = paymentsFromMatches(m, { importId: 'imp1', label: 'Kontoauszug-Import 12.11.2026 · auszug.csv' });
    expect(p).toMatchObject({ tenantId: 'ta', amount: 800, source: 'import', payer: 'Anna Schmidt', importId: 'imp1', importLabel: expect.stringContaining('auszug.csv') });
    expect(p.createdAt).toBeTruthy();
  });
  it('nicht ausgewählte Zeilen werden nicht gebucht', () => {
    const m = matchRows(mieter(), [row('Unklar', 'Unbekannt', 5)]);
    expect(paymentsFromMatches(m)).toEqual([]);
  });
});

describe('Bestandsimport', () => {
  it('Vorlage lässt sich importieren', () => {
    const p = planBestandImport(emptyDB, BESTAND_TEMPLATE);
    expect(p.error).toBeUndefined();
    expect(p.summary).toEqual({ properties: 1, units: 3, tenants: 2, updated: 0 });
    expect(p.warnings).toEqual([]);
  });
  it('liest alle Spaltengruppen: Objekt, Einheit, Mieter', () => {
    const { db } = planBestandImport(emptyDB, BESTAND_TEMPLATE);
    const prop = db.properties[0];
    expect(prop).toMatchObject({ name: 'Haus Lindenstraße', heatingType: 'Gas', eaClass: 'C', eaValue: '112', eaIssued: '2020-03-15', eaValidUntil: '2030-03-15', plotArea: '450', premium: '1850' });
    const w = db.units.find((u) => u.name === 'Wohnung 1')!, g = db.units.find((u) => u.name === 'Gewerbe 1')!;
    expect(w).toMatchObject({ kind: 'wohnung', floor: 'EG', balcony: 'Terrasse', coldRent: 640 });
    expect(g).toMatchObject({ kind: 'gewerbe', vat: 19, parking: 'Hof 2' });
    const anna = db.tenants.find((t) => t.name === 'Anna Schmidt')!;
    expect(anna).toMatchObject({ salutation: 'Frau', noticeMonths: '3', rentAdjust: 'Indexmiete', nextAdjust: '2027-06-01', moveIn: '2024-06-01', deposit: 1920 });
    expect(anna.trackFrom).toBe('2026-11'); // Import: Rückstände zählen erst ab dem laufenden Monat
  });
  it('erneuter Import ändert nur ausgefüllte Zellen', () => {
    const first = planBestandImport(emptyDB, BESTAND_TEMPLATE).db;
    const second = planBestandImport(first, 'Haus;Einheit;Fläche;Kaltmiete;Mieter;Telefon;Etage;EA Klasse\nHaus Lindenstraße;Wohnung 1;;680,00;Anna Schmidt;;;B\n');
    const u = second.db.units.find((x) => x.name === 'Wohnung 1')!;
    expect(u.coldRent).toBe(680); // geändert
    expect(u.area).toBe(62); // leer = bleibt
    expect(u.floor).toBe('EG');
    expect(second.db.properties[0].eaClass).toBe('B');
    expect(second.db.tenants.find((t) => t.name === 'Anna Schmidt')!.phone).toBe('0221 123456');
    expect(second.summary.properties + second.summary.units + second.summary.tenants).toBe(0);
    expect(second.db.tenants).toHaveLength(first.tenants.length);
  });
  it('meldet unlesbare Zellen mit Zeilennummer, ohne abzubrechen', () => {
    const p = planBestandImport(emptyDB, 'Haus;Einheit;Typ;Fläche;Grundstück;Mieter;Einzug;Befristet bis\nH;E1;Eigentum;abc;1.250;Max Muster;32.13.2024;morgen\n');
    expect(p.warnings.some((w) => w.includes('Zeile 2') && w.includes('abc'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('32.13.2024'))).toBe(true);
    expect(p.warnings.some((w) => w.includes('morgen'))).toBe(true);
    expect(p.db.units[0].kind).toBe('eigentum');
    expect(p.db.properties[0].plotArea).toBe('1250'); // 1.250 = tausendzweihundertfünfzig
  });
  it('ohne Haus/Einheit: Fehler', () => {
    expect(planBestandImport(emptyDB, 'Name;Miete\nA;1').error).toMatch(/Haus/);
    expect(planBestandImport(emptyDB, 'Haus;Einheit').error).toBeTruthy();
  });
  it('Zeilen ohne Haus oder Einheit werden übersprungen', () => {
    const p = planBestandImport(emptyDB, 'Haus;Einheit\nH;\n;E\nH;E1\n');
    expect(p.summary.units).toBe(1);
    expect(p.warnings).toHaveLength(2);
  });
  it('gleicher Name in Schreibvarianten wird erkannt (Umlaute, Groß/Klein)', () => {
    const p = planBestandImport(emptyDB, 'Haus;Einheit\nHaus Lindenstraße;Wohnung 1\nHAUS LINDENSTRASSE;wohnung 1\n');
    expect(p.summary).toMatchObject({ properties: 1, units: 1 });
  });
});

describe('Bestand-Import: Mieterhistorie', () => {
  const head = 'Haus;Einheit;Typ;Fläche;Kaltmiete;Nebenkosten;Mieter;Einzug;Auszug;Kaltmiete damals;Notizen Mieter';
  const csv = [
    head,
    'Haus Test;Wohnung 4;Wohnung;;;;Alt Eins;01.12.2009;31.03.2019;440,00;',
    'Haus Test;Wohnung 4;Wohnung;77,02;480,00;140,00;Neu Zwei;01.04.2019;;;',
  ].join('\n');

  it('legt frühere und aktuelle Mieter an; Einheitenwerte stammen vom aktuellen Mieter', () => {
    const r = planBestandImport(emptyDB, csv);
    expect(r.error).toBeUndefined();
    expect(r.db.units).toHaveLength(1);
    expect(r.db.units[0]).toMatchObject({ area: 77.02, coldRent: 480, advance: 140 });
    const old = r.db.tenants.find((t) => t.name === 'Alt Eins')!;
    const cur = r.db.tenants.find((t) => t.name === 'Neu Zwei')!;
    expect(old).toMatchObject({ moveIn: '2009-12-01', moveOut: '2019-03-31', coldRent: 440, trackFrom: '2019-04' });
    expect(cur.moveOut).toBe('');
    expect(r.summary.tenants).toBe(2);
  });
  it('frühere Mieter haben nie offene Posten', () => {
    const r = planBestandImport(emptyDB, csv);
    const old = r.db.tenants.find((t) => t.name === 'Alt Eins')!;
    expect(dueMonths(old)).toEqual([]);
  });
  it('erneuter Import legt nichts doppelt an', () => {
    const first = planBestandImport(emptyDB, csv);
    const again = planBestandImport(first.db, csv);
    expect(again.db.tenants).toHaveLength(2);
    expect(again.summary).toMatchObject({ tenants: 0, units: 0, properties: 0 });
  });
  it('unbekannter Einzug bei früherem Mieter bleibt leer (kein heutiges Datum)', () => {
    const r = planBestandImport(emptyDB, `${head}\nHaus Test;Wohnung 5;Wohnung;;;;Unbekannt;????;31.07.2023;;`);
    const t = r.db.tenants[0];
    expect(t.moveIn).toBe('');
    expect(t.moveOut).toBe('2023-07-31');
    expect(r.warnings.some((w) => w.includes('bleibt leer'))).toBe(true);
  });
  it('bestehende Einheit wird ergänzt, nicht verdoppelt', () => {
    const base = planBestandImport(emptyDB, `${head}\nHaus Test;Wohnung 4;Wohnung;50;300;100;Alt;01.01.2020;;;`).db;
    const r = planBestandImport(base, csv);
    expect(r.db.units).toHaveLength(1);
    expect(r.db.properties).toHaveLength(1);
  });
});

describe('Bestand-Import: Reparatur nach altem Import ohne Auszug', () => {
  const head = 'Haus;Einheit;Typ;Fläche;Kaltmiete;Nebenkosten;Mieter;Einzug;Auszug;Kaltmiete damals';
  it('als aktiv angelegte frühere Mieter werden korrigiert statt verdoppelt', () => {
    // alter Import: Spalte „Auszug“ kannte er nicht, alle Mieter wurden aktiv
    const oldImport = planBestandImport(emptyDB, 'Haus;Einheit;Typ;Fläche;Kaltmiete;Nebenkosten;Mieter;Einzug\nHaus Test;Wohnung 4;Wohnung;;;;Alt Eins;01.12.2009\nHaus Test;Wohnung 4;Wohnung;77,02;480;140;Neu Zwei;01.04.2019\nHaus Test;Wohnung 4;Wohnung;;;;Ohne Datum;????').db;
    expect(oldImport.tenants.every((t) => !t.moveOut)).toBe(true);
    const fixed = planBestandImport(oldImport, `${head}\nHaus Test;Wohnung 4;Wohnung;;;;Alt Eins;01.12.2009;31.03.2019;440\nHaus Test;Wohnung 4;Wohnung;77,02;480;140;Neu Zwei;01.04.2019;;\nHaus Test;Wohnung 4;Wohnung;;;;Ohne Datum;;31.07.2023;`).db;
    expect(fixed.tenants).toHaveLength(3);
    const by = (n: string) => fixed.tenants.find((t) => t.name === n)!;
    expect(by('Alt Eins')).toMatchObject({ moveOut: '2019-03-31', coldRent: 440, trackFrom: '2019-04' });
    expect(by('Ohne Datum')).toMatchObject({ moveIn: '', moveOut: '2023-07-31', trackFrom: '2023-08' });
    expect(by('Neu Zwei').moveOut).toBe('');
    expect(dueMonths(by('Alt Eins'))).toEqual([]);
    expect(dueMonths(by('Ohne Datum'))).toEqual([]);
  });
});

describe('Bestand-Import: Änderungszeit für den Cloud-Abgleich', () => {
  it('neue und geänderte Datensätze werden gestempelt, unveränderte nicht', () => {
    const head = 'Haus;Einheit;Typ;Fläche;Kaltmiete;Nebenkosten;Mieter;Einzug';
    const first = planBestandImport(emptyDB, `${head}\nHaus Test;Wohnung 1;Wohnung;50;300;100;Anna;01.01.2020\nHaus Test;Wohnung 2;Wohnung;60;350;100;Bernd;01.01.2020`).db;
    expect(first.tenants.every((t) => !!t.updatedAt)).toBe(true);
    const marked = { ...first, tenants: first.tenants.map((t) => ({ ...t, updatedAt: '2020-01-01T00:00:00.000Z' })), units: first.units.map((u) => ({ ...u, updatedAt: '2020-01-01T00:00:00.000Z' })), properties: first.properties.map((p) => ({ ...p, updatedAt: '2020-01-01T00:00:00.000Z' })) };
    const second = planBestandImport(marked, `${head}\nHaus Test;Wohnung 1;Wohnung;50;300;100;Anna;01.01.2020\nHaus Test;Wohnung 2;Wohnung;60;400;100;Bernd;01.01.2020`).db;
    const u1 = second.units.find((u) => u.name === 'Wohnung 1')!, u2 = second.units.find((u) => u.name === 'Wohnung 2')!;
    expect(u1.updatedAt).toBe('2020-01-01T00:00:00.000Z'); // unverändert
    expect(u2.updatedAt).not.toBe('2020-01-01T00:00:00.000Z'); // Miete geändert
    expect(second.tenants.every((t) => t.updatedAt === '2020-01-01T00:00:00.000Z')).toBe(true);
  });
});

describe('Zähler-Import', () => {
  const base = () => planBestandImport(emptyDB, 'Haus;Einheit;Typ;Mieter\nHaus Test;Wohnung 1;Wohnung;\nHaus Test;Wohnung 2;Wohnung;').db;
  const head = 'Haus;Einheit;Zähler;Zählernummer;Datum;Stand';
  it('legt Zähler und Stände an, ein Zähler über mehrere Zeilen', () => {
    const r = planZaehlerImport(base(), `${head}\nHaus Test;Wohnung 1;Heizung;123;19.10.2013;0\nHaus Test;Wohnung 1;Heizung;123;11.01.2014;1.882\nHaus Test;Wohnung 2;Heizung;456;11.01.2014;813\nHaus Test;;Strom;S1;31.12.2025;5120,5`);
    expect(r.error).toBeUndefined();
    expect(r.summary).toEqual({ meters: 3, readings: 4, updated: 0 });
    const m = r.db.meters.find((x) => x.number === '123')!;
    expect(m).toMatchObject({ type: 'heizung' });
    expect(r.db.readings.filter((x) => x.meterId === m.id).map((x) => [x.date, x.value])).toEqual([['2013-10-19', 0], ['2014-01-11', 1882]]);
    expect(r.db.meters.find((x) => x.number === 'S1')!.unitId).toBe('');
  });
  it('erneuter Import legt nichts doppelt an; geänderter Stand wird aktualisiert', () => {
    const csv = `${head}\nHaus Test;Wohnung 1;Heizung;123;11.01.2014;1882`;
    const first = planZaehlerImport(base(), csv).db;
    const again = planZaehlerImport(first, csv);
    expect(again.summary).toEqual({ meters: 0, readings: 0, updated: 0 });
    const changed = planZaehlerImport(first, csv.replace('1882', '1900'));
    expect(changed.summary).toEqual({ meters: 0, readings: 0, updated: 1 });
    expect(changed.db.readings[0].value).toBe(1900);
  });
  it('unbekannte Einheit, Haus oder Art werden gemeldet und übersprungen', () => {
    const r = planZaehlerImport(base(), `${head}\nHaus Test;Wohnung 9;Heizung;1;01.01.2020;1\nHaus X;Wohnung 1;Heizung;1;01.01.2020;1\nHaus Test;Wohnung 1;Dampf;1;01.01.2020;1\nHaus Test;Wohnung 1;Gas;2;??;1`);
    expect(r.summary.readings).toBe(0);
    expect(r.warnings).toHaveLength(4);
    expect(r.db.meters.filter((m) => m.number === '1')).toHaveLength(0);
  });
  it('Fehler ohne Pflichtspalten', () => {
    expect(planZaehlerImport(base(), 'A;B\n1;2').error).toMatch(/Spalten/);
  });
});
