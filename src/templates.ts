import { Block, LetterModel, SigField, frame, salutationText } from './letters';
import { DB, Property, Tenant, Unit } from './types';
import type { Settings } from './settingsDefaults';
import { dateDE, eur, openItems, rentNow, unitDue } from './calc';
import { formatIban, fullName, placeholders, signatureLines } from './company';
import { houseBank, landlordText, onBehalfSentence, ownersFull, ownersLine, ownersOf } from './owners';
import { unitRef } from './ids';
import { latestReading, meterLabel } from './meters';
import { monthEnd } from './rent';
import { depositSettlement } from './moveOut';

/**
 * Dokumentvorlagen (Mietvertrag, Kündigung, Übergabeprotokoll …). Jede Vorlage ist reiner Text mit {{Platzhaltern}},
 * die aus Unternehmensdaten, Mieter, Wohnung und deinen Eingaben gefüllt werden.
 * Die Texte sind Entwürfe nach gängiger Praxis und sollten einmal rechtlich geprüft werden.
 */
export type FieldKind = 'text' | 'date' | 'money' | 'multiline' | 'choice';
export interface Field { key: string; label: string; kind: FieldKind; optional?: boolean; options?: string[]; hint?: string; default?: (c: Ctx) => string }
export interface Ctx { s: Settings; db: DB; tenant: Tenant; unit: Unit; prop: Property; date: string; f: Record<string, string> }
export interface Rendered { model: LetterModel; missing: string[]; warnings: string[] }
export type Group = 'Mietverhältnis' | 'Übergabe und Bescheinigungen' | 'Schreiben';
export interface Template {
  id: string; name: string; group: Group; icon: string; desc: string; fields: Field[]; batch?: boolean; notice?: string;
  form?: 'schriftform'; // das Gesetz verlangt die eigenhändige Unterschrift auf Papier (Kündigung, Mietvertrag über ein Jahr)
  build: (c: Ctx, h: Helpers) => { title: string; info?: [string, string][]; blocks: Block[]; warnings?: string[] };
}
export interface Helpers { sigs: (fields: SigField[]) => Block; p: (t: string, small?: boolean) => Block; h: (t: string) => Block; kv: (rows: [string, string][]) => Block; fill: (t: string) => string; sign: () => Block }

const signerOf = (s: Settings) => s.signerName.trim() || fullName(s);
const de = (iso?: string) => (iso ? dateDE(iso) : '');
const money = (s: string) => { const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

/* ───────── Platzhalter ───────── */

export function contextPlaceholders(c: Ctx): Record<string, string> {
  const { s, db, tenant: t, unit: u, prop: p } = c;
  const now = rentNow(u);
  const ref = unitRef(p, u);
  const paidDeposit = db.payments.filter((x) => x.tenantId === t.id && x.kind === 'kaution').reduce((a, x) => a + x.amount, 0);
  return {
    ...placeholders(s),
    Mieter: t.name, Anrede: salutationText(t).replace(/,$/, ''), Mieteranschrift: (t.postalAddress ?? '').trim() || `${p.street}, ${p.zip} ${p.city}`,
    Wohnung: u.name, 'Wohnungs-ID': ref, Objekt: p.name, Objektadresse: `${p.street}, ${`${p.zip} ${p.city}`.trim()}`,
    Fläche: String(u.area || ''), Zimmer: String(u.rooms || ''), Etage: u.floor ?? '', Lage: u.position ?? '', Keller: u.cellar ?? '', Stellplatz: u.parking ?? '',
    Kaltmiete: eur(now.coldRent), Vorauszahlung: eur(now.advance), Gesamtmiete: eur(unitDue(u)),
    Einzug: de(t.moveIn), Auszug: de(t.moveOut), Kaution: t.deposit ? eur(t.deposit) : '', 'Kaution gezahlt': paidDeposit ? eur(paidDeposit) : '',
    // Mietzahlungen: Konto des Hauses (nie das Firmenkonto)
    Kontoinhaber: houseBank(p)?.holder ?? '', IBAN: houseBank(p) ? formatIban(houseBank(p)!.iban) : '', BIC: houseBank(p)?.bic ?? '', Bank: houseBank(p)?.bank ?? '',
    Eigentümer: ownersLine(p), 'Eigentümer-Anschrift': ownersFull(p), Vermieter: landlordText(s, p),
    Fälligkeitstag: String(s.rentDueDay), Heute: de(c.date),
    ...Object.fromEntries(Object.entries(c.f).map(([k, v]) => [k, /^\d{4}-\d{2}-\d{2}$/.test(v) ? dateDE(v) : v])),
  };
}

/** Setzt {{Platzhalter}} ein. Unbekannte oder leere Pflichtwerte werden gemerkt, damit die Vorschau darauf hinweist. */
export function fillWith(text: string, map: Record<string, string>, missing: Set<string>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => { if (!(k in map)) { missing.add(k); return m; } if (!map[k]) missing.add(k); return map[k]; });
}

export function renderTemplate(tpl: Template, c: Ctx): Rendered {
  const map = contextPlaceholders(c);
  const missing = new Set<string>();
  const fill = (t: string) => fillWith(t, map, missing);
  const h: Helpers = {
    fill,
    p: (t, small) => ({ t: 'p', text: fill(t), ...(small ? { small: true } : {}) }),
    h: (t) => ({ t: 'h1', text: fill(t) }),
    kv: (rows) => ({ t: 'kv', rows: rows.map(([k, v]) => [k, fill(v)] as [string, string]) }),
    sign: () => ({ t: 'sign', lines: signatureLines(c.s) }),
    sigs: (fields) => ({ t: 'sigs', fields: fields.map((f) => ({ ...f, name: f.name ? fill(f.name) : undefined })), place: c.prop.city, date: c.date }),
  };
  const out = tpl.build(c, h);
  // Die Firma handelt im Namen der Eigentümer: kurzer Hinweis unter der Überschrift (im Mietvertrag steht es ausführlich in den Parteien)
  const behalf = onBehalfSentence(c.s, c.prop);
  if (behalf && tpl.id !== 'mietvertrag') {
    const at = out.blocks[0]?.t === 'h1' ? 1 : 0;
    out.blocks = [...out.blocks.slice(0, at), { t: 'p', small: true, text: behalf }, ...out.blocks.slice(at)];
  }
  const model = frame(c.s, c.tenant, c.prop, c.unit, c.date, out.info ?? [['Objekt', c.prop.name], ['Einheit', `${c.unit.name}`]], out.title, out.blocks);
  if (tpl.form === 'schriftform' && !c.s.autoSignFormal) { delete model.signatures; model.noAutoSign = true; }
  const optional = new Set(tpl.fields.filter((f) => f.optional).map((f) => f.key));
  return { model, missing: [...missing].filter((k) => !optional.has(k)), warnings: out.warnings ?? [] };
}

/* ───────── Fristen ───────── */

/** Dritter Werktag (Mo–Sa) eines Monats, ohne Feiertage. */
export function thirdWorkday(monthIso: string): string {
  const d = new Date(`${monthIso.slice(0, 7)}-01T00:00:00Z`);
  let n = 0;
  while (true) {
    if (d.getUTCDay() !== 0) n++;
    if (n === 3) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
/** Mietende bei Kündigung durch den Mieter (§ 573c BGB): Eingang bis zum 3. Werktag → Ablauf des übernächsten Monats, sonst des dritten Monats. */
export function tenancyEnd(receivedIso: string): string {
  return monthEnd(receivedIso, receivedIso <= thirdWorkday(receivedIso) ? 2 : 3);
}

const noteDoc = 'Hinweis: Der Text ist eine Vorlage nach gängiger Praxis. Lass ihn vor dem Einsatz rechtlich prüfen.';

/* ───────── Vorlagen ───────── */

export const TEMPLATES: Template[] = [
  {
    id: 'mietvertrag', name: 'Mietvertrag Wohnraum', group: 'Mietverhältnis', icon: 'document-text-outline', notice: noteDoc, form: 'schriftform',
    desc: 'Unbefristeter Mietvertrag mit Miete, Betriebskosten, Kaution und Kündigung.',
    fields: [
      { key: 'Mietbeginn', label: 'Mietbeginn', kind: 'date', default: (c) => c.tenant.moveIn },
      { key: 'Kautionsbetrag', label: 'Kaution', kind: 'money', optional: true, default: (c) => (c.tenant.deposit ? String(c.tenant.deposit).replace('.', ',') : ''), hint: 'Höchstens drei Nettokaltmieten' },
      { key: 'Schlüssel', label: 'Anzahl Schlüssel', kind: 'text', default: () => '2' },
      { key: 'Schönheitsreparaturen', label: 'Schönheitsreparaturen', kind: 'choice', options: ['Der Vermieter trägt die Schönheitsreparaturen.', 'Der Mieter führt Schönheitsreparaturen bei Bedarf aus.'], default: () => 'Der Vermieter trägt die Schönheitsreparaturen.' },
      { key: 'Tierhaltung', label: 'Tierhaltung', kind: 'choice', options: ['Kleintiere sind erlaubt. Andere Tiere nur mit Zustimmung des Vermieters.', 'Tierhaltung ist nur mit Zustimmung des Vermieters erlaubt.'], default: () => 'Kleintiere sind erlaubt. Andere Tiere nur mit Zustimmung des Vermieters.' },
      { key: 'Besonderes', label: 'Besondere Vereinbarungen', kind: 'multiline', optional: true },
    ],
    build: (c, { p, h, kv, sign, sigs }) => {
      const now = rentNow(c.unit);
      const dep = money(c.f.Kautionsbetrag ?? '');
      const warnings: string[] = [];
      if (dep > now.coldRent * 3 + 0.005) warnings.push(`Die Kaution übersteigt drei Nettokaltmieten (${eur(now.coldRent * 3)}). Das ist unzulässig (§ 551 BGB).`);
      if (!(c.unit.area > 0)) warnings.push('Die Wohnfläche fehlt in den Wohnungsdaten.');
      if (!ownersOf(c.prop).length) warnings.push('Für dieses Haus sind keine Eigentümer hinterlegt. Im Vertrag steht dann nur die Firma als Vermieter. Trage die Eigentümer beim Haus ein.');
      if (!houseBank(c.prop)) warnings.push('Für dieses Haus ist kein Mietkonto hinterlegt (Haus → Bankkonto). Die Miete läuft auf das Konto des Hauses.');
      if (c.f.Schönheitsreparaturen?.startsWith('Der Mieter')) warnings.push('Schönheitsreparaturen auf den Mieter zu übertragen ist nur bei renovierter Übergabe sicher möglich. Starre Fristen sind unwirksam. Besser: Vermieter trägt sie.');
      const blocks: Block[] = [
        h('Mietvertrag über Wohnraum'),
        p('zwischen {{Vermieter}}, nachfolgend „Vermieter“, und **{{Mieter}}**, nachfolgend „Mieter“, wird folgender Mietvertrag geschlossen.'),
        ...(ownersOf(c.prop).length ? [p('Der Vermieter wird bei Abschluss und Durchführung dieses Vertrags von {{Firma}} vertreten. {{Firma}} ist bevollmächtigt, alle Erklärungen im Namen der Eigentümer abzugeben und entgegenzunehmen' + (c.prop.mandate ? ` (Verwaltungsvertrag/Vollmacht vom ${de(c.prop.mandate)})` : '') + '.')] : []),
        p('**§ 1 Mietsache**'),
        p('Vermietet wird die Wohnung **{{Wohnung}}** im Haus {{Objekt}}, {{Objektadresse}}, mit einer Wohnfläche von {{Fläche}} m² ({{Zimmer}} Zimmer). Wohnungs-ID: {{Wohnungs-ID}}.'),
        ...(c.unit.cellar || c.unit.parking ? [p(`Mitvermietet sind: ${[c.unit.cellar && `Keller (${c.unit.cellar})`, c.unit.parking && `Stellplatz (${c.unit.parking})`].filter(Boolean).join(', ')}.`)] : []),
        p('Der Vermieter übergibt dem Mieter {{Schlüssel}} Schlüssel. Weitere Schlüssel dürfen nur mit Zustimmung des Vermieters angefertigt werden. Über den Zustand bei Übergabe wird ein Protokoll erstellt.'),
        p('**§ 2 Mietzeit**'),
        p('Das Mietverhältnis beginnt am **{{Mietbeginn}}** und läuft auf unbestimmte Zeit.'),
        p('**§ 3 Miete**'),
        kv([['Kaltmiete (Nettomiete)', '{{Kaltmiete}}'], ['Vorauszahlung auf Betriebskosten', '{{Vorauszahlung}}'], ['Gesamtmiete monatlich', '{{Gesamtmiete}}']]),
        p('Die Miete ist monatlich im Voraus, spätestens bis zum {{Fälligkeitstag}}. eines jeden Monats, kostenfrei auf folgendes Konto zu zahlen: {{Kontoinhaber}}, IBAN {{IBAN}}. Als Verwendungszweck ist die Wohnungs-ID **{{Wohnungs-ID}}** anzugeben. Für die Rechtzeitigkeit kommt es auf den Zahlungseingang an.'),
        p('**§ 4 Betriebskosten**'),
        p('Der Mieter trägt die Betriebskosten im Sinne der Betriebskostenverordnung (§ 2 BetrKV). Auf sie werden monatliche Vorauszahlungen geleistet. Der Vermieter rechnet jährlich bis spätestens zwölf Monate nach Ende des Abrechnungszeitraums ab. Nach einer Abrechnung kann jede Partei die Vorauszahlung auf eine angemessene Höhe anpassen (§ 560 Abs. 4 BGB). Die Verteilung erfolgt nach Wohnfläche, bei verbrauchsabhängigen Kosten nach Verbrauch.'),
        p('**§ 5 Mieterhöhung**'),
        p('Mieterhöhungen richten sich nach den gesetzlichen Vorschriften (§§ 557 ff. BGB).'),
        p('**§ 6 Kaution**'),
        ...(dep > 0 ? [p(`Der Mieter leistet eine Mietsicherheit von **${eur(dep)}**. Sie darf höchstens drei Nettokaltmieten betragen und kann in drei gleichen monatlichen Teilbeträgen gezahlt werden, die erste zu Beginn des Mietverhältnisses (§ 551 BGB). Der Vermieter legt die Kaution getrennt von seinem Vermögen bei einem Kreditinstitut zu dem für Spareinlagen mit dreimonatiger Kündigungsfrist üblichen Zinssatz an. Die Zinsen stehen dem Mieter zu und erhöhen die Sicherheit.`)] : [p('Eine Mietsicherheit wird nicht vereinbart.')]),
        p('**§ 7 Gebrauch der Mietsache**'),
        p('Die Wohnung darf nur zu Wohnzwecken genutzt werden. Eine Untervermietung oder Überlassung an Dritte bedarf der Zustimmung des Vermieters. {{Tierhaltung}} Der Mieter hat die Mietsache pfleglich zu behandeln und ausreichend zu lüften und zu heizen.'),
        p('**§ 8 Instandhaltung und Schönheitsreparaturen**'),
        p('Der Mieter zeigt Mängel unverzüglich an. Für Kleinreparaturen an Gegenständen, die dem häufigen Zugriff des Mieters ausgesetzt sind, trägt er die Kosten bis zu 100 € je Einzelfall, jährlich höchstens 8 % der Jahreskaltmiete. {{Schönheitsreparaturen}}'),
        p('**§ 9 Kündigung**'),
        p('Die Kündigung bedarf der Schriftform. Der Mieter kann spätestens am dritten Werktag eines Monats zum Ablauf des übernächsten Monats kündigen. Für den Vermieter gelten die gesetzlichen Fristen nach § 573c BGB, die sich nach der Dauer des Mietverhältnisses verlängern. Der Vermieter braucht einen berechtigten Grund (§ 573 BGB).'),
        p('**§ 10 Rückgabe**'),
        p('Bei Beendigung gibt der Mieter die Wohnung geräumt und besenrein mit allen Schlüsseln zurück. Über den Zustand wird ein Übergabeprotokoll erstellt.'),
        p('**§ 11 Datenschutz**'),
        p('Der Vermieter verarbeitet personenbezogene Daten des Mieters zur Durchführung des Mietverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) und gibt sie nur weiter, soweit dies dafür erforderlich ist, zum Beispiel an Abrechnungsdienste und Handwerker.'),
        p('**§ 12 Schlussbestimmungen**'),
        p('Änderungen und Ergänzungen bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gibt keine mündlichen Nebenabreden.'),
        ...(c.f.Besonderes?.trim() ? [p('**Besondere Vereinbarungen**'), p('{{Besonderes}}')] : []),
        sigs([{ key: 'vermieter', label: 'Vermieter', name: signerOf(c.s) }, { key: 'mieter', label: 'Mieter', name: c.tenant.name }]),
      ];
      return { title: `Mietvertrag – ${c.tenant.name}`, info: [['Objekt', c.prop.name], ['Einheit', c.unit.name], ['Mietbeginn', de(c.f.Mietbeginn)]], blocks, warnings };
    },
  },
  {
    id: 'kuendigungsbestaetigung', name: 'Kündigungsbestätigung', group: 'Mietverhältnis', icon: 'checkmark-done-outline',
    desc: 'Bestätigt dem Mieter den Eingang seiner Kündigung und nennt das Mietende.',
    fields: [
      { key: 'Eingang', label: 'Kündigung eingegangen am', kind: 'date', default: (c) => c.date },
      { key: 'Mietende', label: 'Mietverhältnis endet am', kind: 'date', hint: 'Vorschlag nach § 573c BGB', default: (c) => tenancyEnd(c.date) },
      { key: 'Übergabetermin', label: 'Wohnungsübergabe am', kind: 'date', optional: true },
    ],
    build: (c, { p, h, kv, sign }) => ({
      title: `Kündigungsbestätigung – ${c.tenant.name}`,
      warnings: c.f.Mietende && c.f.Eingang && c.f.Mietende < c.f.Eingang ? ['Das Mietende liegt vor dem Eingang der Kündigung.'] : [],
      blocks: [
        h('Bestätigung Ihrer Kündigung'), p('{{Anrede}},'),
        p('wir bestätigen den Eingang Ihrer Kündigung der Wohnung {{Wohnung}} ({{Objektadresse}}) am **{{Eingang}}**. Das Mietverhältnis endet zum **{{Mietende}}**.'),
        ...(c.f.Übergabetermin?.trim() ? [p('Die Wohnungsübergabe vereinbaren wir für den **{{Übergabetermin}}**. Bitte geben Sie die Wohnung geräumt und besenrein mit allen Schlüsseln zurück. Dabei lesen wir die Zähler ab und erstellen ein Übergabeprotokoll.')] : [p('Bitte vereinbaren Sie mit uns einen Termin zur Wohnungsübergabe. Dabei lesen wir die Zähler ab und erstellen ein Übergabeprotokoll.')]),
        kv([['Wohnung', '{{Wohnung}}'], ['Mietende', '{{Mietende}}'], ['Kaution', '{{Kaution}}']]),
        p('Die Mietsicherheit rechnen wir nach Beendigung und Übergabe ab und zahlen ein Guthaben aus, sobald die Betriebskostenabrechnung vorliegt. Bis zum Mietende zahlen Sie die Miete bitte wie bisher.'),
        sign(),
      ],
    }),
  },
  {
    id: 'kuendigung-zahlungsverzug', name: 'Fristlose Kündigung wegen Zahlungsverzug', group: 'Mietverhältnis', icon: 'warning-outline', form: 'schriftform',
    notice: 'Eine fristlose Kündigung ist ein schwerer Schritt. Lass sie vor dem Versand rechtlich prüfen.',
    desc: 'Nach § 543 Abs. 2 Nr. 3 BGB, hilfsweise ordentlich. Prüft den Rückstand.',
    fields: [
      { key: 'Rückstand', label: 'Rückstand gesamt', kind: 'money', default: (c) => String(openItems(c.db, c.tenant).reduce((s, i) => s + i.open, 0)).replace('.', ',') },
      { key: 'Zeitraum', label: 'Zeitraum der offenen Mieten', kind: 'text', default: (c) => { const m = openItems(c.db, c.tenant).map((i) => i.month); return m.length ? `${m[0].split('-').reverse().join('/')}${m.length > 1 ? ' bis ' + m[m.length - 1].split('-').reverse().join('/') : ''}` : ''; } },
      { key: 'Hilfsweise', label: 'Hilfsweise ordentlich kündigen', kind: 'choice', options: ['Ja', 'Nein'], default: () => 'Ja' },
    ],
    build: (c, { p, h, kv, sign }) => {
      const monthly = unitDue(c.unit);
      const arrears = money(c.f.Rückstand ?? '');
      const warnings: string[] = [];
      if (arrears < monthly * 2 - 0.005) warnings.push(`Die Voraussetzung ist nicht erfüllt: Für eine fristlose Kündigung muss der Rückstand mindestens zwei Monatsmieten betragen (${eur(monthly * 2)}), oder in zwei aufeinanderfolgenden Terminen mehr als eine Monatsmiete.`);
      return {
        title: `Fristlose Kündigung – ${c.tenant.name}`, warnings,
        blocks: [
          h('Fristlose Kündigung des Mietverhältnisses'), p('{{Anrede}},'),
          p('Sie befinden sich mit der Zahlung der Miete für die Wohnung {{Wohnung}} ({{Objektadresse}}) im Rückstand. Für den Zeitraum {{Zeitraum}} sind **{{Rückstand}}** offen. Trotz Zahlungserinnerung und Mahnung sind die Beträge nicht ausgeglichen worden.'),
          p('Wir kündigen das Mietverhältnis daher **fristlos** gemäß § 543 Abs. 2 Satz 1 Nr. 3 BGB.'),
          ...(c.f.Hilfsweise === 'Ja' ? [p('Hilfsweise kündigen wir das Mietverhältnis ordentlich und fristgemäß zum nächstmöglichen Zeitpunkt gemäß § 573 Abs. 2 Nr. 1 BGB.')] : []),
          p('Wir fordern Sie auf, die Wohnung bis zum Ablauf der Räumungsfrist geräumt und besenrein mit allen Schlüsseln zurückzugeben. Setzen Sie das Mietverhältnis nach Ablauf der Mietzeit fort, widersprechen wir einer Verlängerung gemäß § 545 BGB.'),
          p('Hinweis: Zahlen Sie den gesamten Rückstand innerhalb von zwei Monaten nach Zustellung einer Räumungsklage, wird die fristlose Kündigung unwirksam (§ 569 Abs. 3 Nr. 2 BGB).', true),
          kv([['Rückstand', '{{Rückstand}}'], ['Zeitraum', '{{Zeitraum}}'], ['Monatsmiete', '{{Gesamtmiete}}']]),
          sign(),
        ],
      };
    },
  },
  {
    id: 'abmahnung', name: 'Abmahnung', group: 'Mietverhältnis', icon: 'alert-circle-outline',
    desc: 'Rüge einer Vertragsverletzung mit Aufforderung und Frist.',
    fields: [
      { key: 'Vorfall', label: 'Was ist passiert?', kind: 'multiline' },
      { key: 'Vorfalldatum', label: 'Datum des Vorfalls', kind: 'date', optional: true },
      { key: 'Forderung', label: 'Was erwartest du?', kind: 'text', default: () => 'Unterlassen Sie dieses Verhalten ab sofort.' },
      { key: 'Frist', label: 'Frist bis', kind: 'date', optional: true },
    ],
    build: (c, { p, h, sign }) => ({
      title: `Abmahnung – ${c.tenant.name}`,
      blocks: [
        h('Abmahnung'), p('{{Anrede}},'),
        p(`wir müssen Sie auf eine Verletzung Ihrer Pflichten aus dem Mietvertrag für die Wohnung {{Wohnung}} hinweisen.${c.f.Vorfalldatum?.trim() ? ' Am {{Vorfalldatum}} kam es zu folgendem Vorfall:' : ' Es kam zu folgendem Vorfall:'}`),
        p('{{Vorfall}}'),
        p(`{{Forderung}}${c.f.Frist?.trim() ? ' Wir erwarten dies bis zum **{{Frist}}**.' : ''}`),
        p('Setzen Sie das beanstandete Verhalten fort, behalten wir uns weitere Schritte bis hin zur Kündigung des Mietverhältnisses vor.'),
        sign(),
      ],
    }),
  },
  {
    id: 'uebergabeprotokoll', name: 'Übergabeprotokoll', group: 'Übergabe und Bescheinigungen', icon: 'clipboard-outline',
    desc: 'Zustand, Zählerstände und Schlüssel bei Ein- oder Auszug zum Ausfüllen und Unterschreiben.',
    fields: [
      { key: 'Art', label: 'Übergabe bei', kind: 'choice', options: ['Einzug', 'Auszug'], default: () => 'Einzug' },
      { key: 'Übergabedatum', label: 'Übergabedatum', kind: 'date', default: (c) => c.date },
      { key: 'Schlüsselzahl', label: 'Schlüssel (Anzahl)', kind: 'text', default: () => '2' },
    ],
    build: (c, { p, h, kv, sign, sigs }) => {
      const meters = c.db.meters.filter((m) => m.unitId === c.unit.id);
      const rooms = ['Eingang / Flur', 'Wohnzimmer', 'Schlafzimmer', 'Küche', 'Bad / WC', 'Kinderzimmer / Arbeitszimmer', 'Balkon / Terrasse', 'Keller / Abstellraum'];
      const blocks: Block[] = [
        h('Übergabeprotokoll – {{Art}}'),
        kv([['Wohnung', '{{Wohnung}}, {{Objektadresse}}'], ['Mieter', '{{Mieter}}'], ['Übergabedatum', '{{Übergabedatum}}'], ['Schlüssel übergeben', '{{Schlüsselzahl}}']]),
        p('**Zählerstände**'),
        { t: 'table', head: ['Zähler', 'Nummer', 'Letzter Stand', 'Stand heute'], align: ['l', 'l', 'r', 'r'], widths: [0.34, 0.22, 0.22, 0.22], rows: meters.length ? meters.map((m) => { const last = latestReading(c.db, m.id); return { cells: [meterLabel(c.db, m).split(' · ').pop() ?? '', m.number, last ? `${last.value.toLocaleString('de-DE')} (${dateDE(last.date)})` : '–', ''] }; }) : [{ cells: ['Keine Zähler erfasst', '', '', ''] }] },
        p('**Zustand der Räume**'),
        { t: 'table', head: ['Raum', 'Zustand', 'Mängel / Bemerkungen'], align: ['l', 'l', 'l'], widths: [0.3, 0.2, 0.5], rows: rooms.map((r) => ({ cells: [r, '', ''] })) },
        p('Weitere Bemerkungen: ______________________________________________________________'),
        sigs([{ key: 'vermieter', label: 'Vermieter', name: signerOf(c.s) }, { key: 'mieter', label: 'Mieter', name: c.tenant.name }]),
      ];
      return { title: `Übergabeprotokoll ${c.f.Art ?? ''} – ${c.tenant.name}`, blocks };
    },
  },
  {
    id: 'kautionsabrechnung', name: 'Kautionsabrechnung', group: 'Übergabe und Bescheinigungen', icon: 'wallet-outline', notice: noteDoc,
    desc: 'Rechnet die Mietsicherheit nach dem Auszug ab: Forderungen abziehen, Rest zurückzahlen.',
    fields: [
      { key: 'Mietende', label: 'Mietverhältnis endete am', kind: 'date', default: (c) => c.tenant.moveOut || c.date },
      { key: 'Gezahlt', label: 'Gezahlte Kaution', kind: 'money', default: (c) => String(depositSettlement(c.db, c.tenant, c.unit).paid || '').replace('.', ',') },
      { key: 'OffeneMiete', label: 'Offene Mieten', kind: 'money', optional: true, default: (c) => String(depositSettlement(c.db, c.tenant, c.unit).openRent || '').replace('.', ',') },
      { key: 'Nachzahlung', label: 'Nachzahlung Nebenkosten / Rückbehalt', kind: 'money', optional: true, hint: 'Noch nicht abgerechnete Nebenkosten dürfen mit einem angemessenen Betrag zurückbehalten werden.', default: (c) => String(depositSettlement(c.db, c.tenant, c.unit).nkClaim || '').replace('.', ',') },
      { key: 'Schaden', label: 'Forderung für Schäden / Renovierung', kind: 'money', optional: true },
      { key: 'SchadenText', label: 'Wofür?', kind: 'text', optional: true, hint: 'z. B. Reparatur Wandschaden Wohnzimmer laut Rechnung vom …' },
      { key: 'Zinsen', label: 'Zinsen auf die Kaution', kind: 'money', optional: true, default: (c) => String(c.tenant.depositInterest || '').replace('.', ',') },
      { key: 'IBAN', label: 'Rückzahlung auf IBAN', kind: 'text', optional: true, default: (c) => c.tenant.iban ?? '' },
    ],
    build: (c, { p, h, kv, sign }) => {
      const gezahlt = money(c.f.Gezahlt ?? ''), miete = money(c.f.OffeneMiete ?? ''), nk = money(c.f.Nachzahlung ?? ''), schaden = money(c.f.Schaden ?? ''), zinsen = money(c.f.Zinsen ?? '');
      const guthaben = gezahlt + zinsen;
      const forderungen = miete + nk + schaden;
      const rest = Math.round((guthaben - forderungen) * 100) / 100;
      const rows: [string, string][] = [['Kaution', eur(gezahlt)]];
      if (zinsen) rows.push(['Zinsen', eur(zinsen)]);
      if (miete) rows.push(['abzüglich offene Mieten', `- ${eur(miete)}`]);
      if (nk) rows.push(['abzüglich Nebenkosten / Rückbehalt', `- ${eur(nk)}`]);
      if (schaden) rows.push([`abzüglich ${c.f.SchadenText?.trim() || 'Schäden'}`, `- ${eur(schaden)}`]);
      rows.push([rest >= 0 ? 'Rückzahlung' : 'Noch offen', eur(Math.abs(rest))]);
      return {
        title: `Kautionsabrechnung – ${c.tenant.name}`,
        warnings: [...(rest < 0 ? ['Die Forderungen übersteigen die Kaution. Der Rest ist von dem Mieter nachzufordern.'] : []), ...(nk ? ['Ein Rückbehalt für noch nicht abgerechnete Nebenkosten muss angemessen sein. Rechne die Nebenkosten danach ab und zahle den Rest aus.'] : [])],
        blocks: [
          h('Abrechnung der Mietsicherheit'),
          p('Das Mietverhältnis über die Wohnung {{Wohnung}}, {{Objektadresse}}, endete am {{Mietende}}. Wir rechnen die von Ihnen geleistete Mietsicherheit wie folgt ab:'),
          kv(rows),
          ...(rest > 0 ? [p(`Den Betrag von **${eur(rest)}** überweisen wir ${c.f.IBAN?.trim() ? 'auf das Konto {{IBAN}}' : 'auf das Ihnen bekannte Konto'}. Bitte teilen Sie uns Ihre neue Anschrift und Ihre Bankverbindung mit, falls sich diese geändert hat.`)] : []),
          ...(rest < 0 ? [p(`Der Restbetrag von **${eur(-rest)}** ist offen. Bitte überweisen Sie ihn umgehend auf das Konto des Vermieters.`)] : []),
          ...(nk ? [p('Die Nebenkosten für das Jahr der Beendigung werden nach Vorliegen der Abrechnung gesondert abgerechnet. Ein darüber hinausgehender Rückbehalt wird dann ausgezahlt.')] : []),
          sign(),
        ],
      };
    },
  },
  {
    id: 'mietbescheinigung', name: 'Mietbescheinigung', group: 'Übergabe und Bescheinigungen', icon: 'ribbon-outline',
    desc: 'Bestätigt Miete und Mietverhältnis, zum Beispiel für Wohngeld, Amt oder Bank.',
    fields: [{ key: 'Zweck', label: 'Zweck', kind: 'text', optional: true, hint: 'z. B. Vorlage beim Jobcenter' }],
    build: (c, { p, h, kv, sign }) => ({
      title: `Mietbescheinigung – ${c.tenant.name}`,
      blocks: [
        h('Mietbescheinigung'),
        p('Hiermit bestätigen wir, dass **{{Mieter}}** seit dem {{Einzug}} Mieter der Wohnung {{Wohnung}}, {{Objektadresse}}, ist.'),
        kv([['Wohnfläche', '{{Fläche}} m²'], ['Kaltmiete', '{{Kaltmiete}}'], ['Betriebskostenvorauszahlung', '{{Vorauszahlung}}'], ['Gesamtmiete monatlich', '{{Gesamtmiete}}']]),
        ...(c.f.Zweck?.trim() ? [p('Diese Bescheinigung wird ausgestellt zur Vorlage: {{Zweck}}.')] : []),
        p('Das Mietverhältnis besteht ungekündigt.'),
        sign(),
      ],
    }),
  },
  {
    id: 'wohnungsgeber', name: 'Wohnungsgeberbestätigung', group: 'Übergabe und Bescheinigungen', icon: 'home-outline',
    notice: 'Nach § 19 Bundesmeldegesetz musst du dem Mieter den Einzug oder Auszug bestätigen, damit er sich anmelden kann.',
    desc: 'Bestätigung für das Einwohnermeldeamt (Anmeldung oder Abmeldung).',
    fields: [
      { key: 'Art', label: 'Bestätigung für', kind: 'choice', options: ['Einzug', 'Auszug'], default: () => 'Einzug' },
      { key: 'Datum', label: 'Datum des Einzugs bzw. Auszugs', kind: 'date', default: (c) => c.tenant.moveIn },
      { key: 'Personen', label: 'Meldepflichtige Personen', kind: 'multiline', default: (c) => c.tenant.name },
    ],
    build: (c, { p, h, kv, sign, sigs }) => ({
      title: `Wohnungsgeberbestätigung – ${c.tenant.name}`,
      blocks: [
        h('Wohnungsgeberbestätigung nach § 19 BMG'),
        kv([['Art des Vorgangs', '{{Art}}'], ['Datum', '{{Datum}}'], ['Anschrift der Wohnung', '{{Objektadresse}}, {{Wohnung}}'], ...(ownersOf(c.prop).length ? [['Wohnungsgeber (Eigentümer)', '{{Eigentümer-Anschrift}}'], ['Ausgestellt durch (bevollmächtigter Verwalter)', '{{Firma}}, {{Anschrift}}']] : [['Wohnungsgeber', '{{Firma}}, {{Anschrift}}']]) as [string, string][], ['Meldepflichtige Personen', '{{Personen}}']]),
        p('Ich bestätige hiermit, dass die oben genannten Personen zu dem genannten Datum bei mir {{Art}} in die genannte Wohnung. Ich bin Wohnungsgeber oder bevollmächtigt, die Bestätigung auszustellen.'),
        p('Mir ist bekannt, dass ich ordnungswidrig handle, wenn ich diese Bestätigung nicht oder nicht rechtzeitig ausstelle oder sie falsch ausstelle (§ 54 BMG).', true),
        sigs([{ key: 'vermieter', label: 'Unterschrift Wohnungsgeber', name: signerOf(c.s) }]),
      ],
    }),
  },
  {
    id: 'kautionsquittung', name: 'Kautionsquittung', group: 'Übergabe und Bescheinigungen', icon: 'cash-outline',
    desc: 'Bestätigt den Eingang der Mietsicherheit.',
    fields: [
      { key: 'Betrag', label: 'Erhaltener Betrag', kind: 'money', default: (c) => String(c.db.payments.filter((x) => x.tenantId === c.tenant.id && x.kind === 'kaution').reduce((a, x) => a + x.amount, 0) || c.tenant.deposit || '').replace('.', ',') },
      { key: 'Eingangsdatum', label: 'Eingegangen am', kind: 'date', default: (c) => c.date },
      { key: 'Kautionsart', label: 'Art der Hinterlegung', kind: 'text', optional: true, default: (c) => [c.tenant.depositType, c.tenant.depositAccount].filter(Boolean).join(', ') },
    ],
    build: (c, { p, h, kv, sign }) => ({
      title: `Kautionsquittung – ${c.tenant.name}`,
      blocks: [
        h('Quittung über die Mietsicherheit'),
        p('Wir bestätigen, von **{{Mieter}}** für die Wohnung {{Wohnung}}, {{Objektadresse}}, am {{Eingangsdatum}} eine Mietsicherheit (Kaution) in Höhe von **{{Betrag}} €** erhalten zu haben.'),
        ...(c.f.Kautionsart?.trim() ? [kv([['Hinterlegung', '{{Kautionsart}}']])] : []),
        p('Wir legen die Kaution getrennt von unserem Vermögen an (§ 551 Abs. 3 BGB).'),
        sign(),
      ],
    }),
  },
  {
    id: 'zahlungsinfo', name: 'Zahlungsinformation mit Wohnungs-ID', group: 'Schreiben', icon: 'finger-print-outline', batch: true,
    desc: 'Teilt jedem Mieter seine Wohnungs-ID als Verwendungszweck mit. Auch für alle Mieter eines Hauses.',
    fields: [],
    build: (c, { p, h, kv, sign }) => ({
      title: `Zahlungsinformation – ${c.tenant.name}`,
      warnings: [...(c.unit.no ? [] : ['Für diese Wohnung gibt es noch keine Wohnungs-ID.']), ...(houseBank(c.prop) ? [] : ['Für dieses Haus ist kein Mietkonto hinterlegt (Haus → Bankkonto).'])],
      blocks: [
        h('Ihre Zahlungsinformation'), p('{{Anrede}},'),
        p('damit wir Ihre Mietzahlungen schnell und sicher zuordnen können, geben Sie bitte bei jeder Überweisung Ihre persönliche **Wohnungs-ID** als Verwendungszweck an.'),
        kv([['Wohnungs-ID (Verwendungszweck)', '{{Wohnungs-ID}}'], ['Empfänger', '{{Kontoinhaber}}'], ['IBAN', '{{IBAN}}'], ['BIC', '{{BIC}}'], ['Monatliche Gesamtmiete', '{{Gesamtmiete}}'], ['Fällig bis', '{{Fälligkeitstag}}. des Monats']]),
        p('Für Daueraufträge genügt es, den Verwendungszweck einmal zu ändern. Bei Fragen melden Sie sich gern bei uns.'),
        sign(),
      ],
    }),
  },
  {
    id: 'frei', name: 'Freies Schreiben', group: 'Schreiben', icon: 'create-outline',
    desc: 'Ein Brief mit deinem Text. Platzhalter wie {{Mieter}} oder {{Wohnungs-ID}} werden ersetzt.',
    fields: [
      { key: 'Betreff', label: 'Betreff', kind: 'text' },
      { key: 'Text', label: 'Text', kind: 'multiline', hint: 'Platzhalter: {{Mieter}}, {{Wohnung}}, {{Kaltmiete}}, {{Heute}} …' },
    ],
    build: (c, { p, h, sign, fill }) => ({
      title: c.f.Betreff?.trim() ? `${c.f.Betreff} – ${c.tenant.name}` : `Schreiben – ${c.tenant.name}`,
      blocks: [h('{{Betreff}}'), p('{{Anrede}},'), ...fill(c.f.Text ?? '').split(/\n{2,}|\n/).filter((x) => x.trim()).map((x) => ({ t: 'p' as const, text: x })), sign()],
    }),
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Vorbelegung der Felder einer Vorlage. */
export function defaultFields(tpl: Template, base: Omit<Ctx, 'f'>): Record<string, string> {
  const f: Record<string, string> = {};
  for (const fld of tpl.fields) f[fld.key] = fld.default ? fld.default({ ...base, f }) : '';
  return f;
}

