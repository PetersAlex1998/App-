import { describe, expect, it } from 'vitest';
import { houseBank, houseBankRows, houseBankValid, landlordText, onBehalfSentence, ownersFull, ownersLine, shareProblem, shareSum, tenantFooter } from '../../src/owners';
import { renderTemplate, templateById } from '../../src/templates';
import { reminderModel } from '../../src/letters';
import { defaultSettings } from '../../src/settingsDefaults';
import { emptyDB } from '../../src/types';
import { scoreRows } from '../../src/csv';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const firm = { ...defaultSettings, name: 'Mustermann Immobilien', legalForm: 'GmbH', street: 'Hauptstraße 1', zip: '33098', city: 'Paderborn', iban: 'DE89370400440532013000', email: 'info@muster.de' };
const three = [{ name: 'Max Muster', share: 50, address: 'Weg 1, 33100 Paderborn' }, { name: 'Erika Muster', share: 30 }, { name: 'Paul Muster', share: 20 }];
const house = (o = {}) => property({ name: 'Haus A', street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe', owners: three, bank: { iban: 'de02 1203 0000 0000 2020 51', bank: 'Sparkasse' }, ...o });

describe('Eigentümer und Anteile', () => {
  it('mehrere Eigentümer mit Prozent, ein einzelner ohne', () => {
    expect(ownersLine(house())).toBe('Max Muster (50 %), Erika Muster (30 %), Paul Muster (20 %)');
    expect(ownersLine(house({ owners: [{ name: 'Max Muster', share: 100 }] }))).toBe('Max Muster');
    expect(ownersLine(house({ owners: undefined }))).toBe('');
    expect(ownersFull(house())).toContain('Max Muster, Weg 1, 33100 Paderborn (50 %); Erika Muster (30 %)');
  });
  it('Anteile müssen 100 % ergeben', () => {
    expect(shareSum(house())).toBe(100);
    expect(shareProblem(house())).toBeNull();
    expect(shareProblem(house({ owners: [{ name: 'A', share: 50 }, { name: 'B', share: 40 }] }))).toMatch(/ergeben 90 %/);
    expect(shareProblem(house({ owners: [{ name: 'A', share: 50 }, { name: 'B', share: 0 }] }))).toMatch(/Anteil in Prozent/);
    expect(shareProblem(house({ owners: [{ name: 'A', share: 0 }] }))).toBeNull(); // ein Eigentümer gilt als 100 %
    expect(shareProblem(house({ owners: [{ name: 'A', share: 150 }] }))).toMatch(/über 100/);
    expect(shareProblem(house({ owners: [] }))).toBeNull();
    expect(shareSum(house({ owners: [{ name: 'A', share: 33.3 }, { name: 'B', share: 33.3 }, { name: 'C', share: 33.4 }] }))).toBe(100);
  });
  it('Hinweis auf die Vollmacht, mit Datum wenn bekannt', () => {
    expect(onBehalfSentence(firm, house())).toBe('Mustermann Immobilien GmbH handelt im Namen und mit Vollmacht der Eigentümer: Max Muster (50 %), Erika Muster (30 %), Paul Muster (20 %).');
    expect(onBehalfSentence(firm, house({ mandate: '2024-03-01' }))).toContain('(laut Verwaltungsvertrag/Vollmacht vom 01.03.2024)');
    expect(onBehalfSentence(firm, house({ owners: undefined }))).toBe('');
  });
  it('Vermieter im Vertrag: Eigentümer, vertreten durch die Firma; ohne Eigentümer wie bisher die Firma', () => {
    const t = landlordText(firm, house());
    expect(t).toContain('**Max Muster, Weg 1, 33100 Paderborn (50 %)**');
    expect(t).toContain('vertreten durch **Mustermann Immobilien GmbH**, Hauptstraße 1, 33098 Paderborn');
    expect(landlordText(firm, house({ owners: undefined }))).toBe('**Mustermann Immobilien GmbH**, Hauptstraße 1, 33098 Paderborn');
  });
});

describe('Hauskonto', () => {
  it('IBAN wird normalisiert, Inhaber ersatzweise die Eigentümer; nie das Firmenkonto', () => {
    const b = houseBank(house())!;
    expect(b.iban).toBe('DE02120300000000202051');
    expect(b.holder).toBe('Max Muster, Erika Muster, Paul Muster');
    expect(houseBank(house({ bank: { holder: 'WEG Muster', iban: 'DE02120300000000202051' } }))!.holder).toBe('WEG Muster');
    expect(houseBank(house({ bank: undefined }))).toBeNull();
    expect(houseBank(house({ bank: { iban: '  ' } }))).toBeNull();
    expect(houseBankValid(house())).toBe(true);
    expect(houseBankValid(house({ bank: { iban: 'DE02 1203' } }))).toBe(false);
  });
  it('Überweisungsblock und Fußzeile für Mieter: Hauskonto und Vollmacht, nicht die Firmen-IBAN', () => {
    expect(houseBankRows(house())).toEqual([['Empfänger', 'Max Muster, Erika Muster, Paul Muster'], ['IBAN', 'DE02 1203 0000 0000 2020 51'], ['Bank', 'Sparkasse']]);
    const foot = tenantFooter(firm, house()).join(' | ');
    expect(foot).toContain('handelt im Namen und mit Vollmacht der Eigentümer');
    expect(foot).toContain('Mietkonto: Max Muster, Erika Muster, Paul Muster · IBAN DE02 1203 0000 0000 2020 51 · Sparkasse');
    expect(foot).not.toContain('DE89 3704');
    expect(tenantFooter(firm, house({ bank: undefined, owners: undefined })).join(' ')).not.toMatch(/IBAN|Mietkonto/);
  });
  it('Mahnung an den Mieter nennt das Hauskonto, nicht die Firma', () => {
    const p = house(); const u = unit(p.id, { no: 1 }); const t = tenant(u.id);
    const r = { id: 'r', tenantId: t.id, date: '2026-11-03', level: 1 as const, amount: 800, fee: 0, deadline: '2026-11-10', items: [{ month: '2026-10', due: 800, paid: 0, open: 800 }] };
    const m = reminderModel(emptyDB, r, t, u, p, firm);
    const txt = JSON.stringify(m);
    expect(txt).toContain('DE02 1203 0000 0000 2020 51');
    expect(txt).not.toContain('DE89 3704');
    expect(m.footer.join(' ')).toContain('Vollmacht der Eigentümer');
  });
});

describe('Dokumente: Vollmacht und Hauskonto', () => {
  const render = (id: string, prop = house(), f: Record<string, string> = {}) => {
    const u = unit(prop.id, { name: 'Wohnung 1', no: 1, area: 50, rooms: 2, coldRent: 500, advance: 100 }); const t = tenant(u.id, { name: 'Anna Schmidt', moveIn: '2026-12-01' });
    const tpl = templateById(id)!;
    return { ...renderTemplate(tpl, { s: firm, db: dbWith({ properties: [prop], units: [u], tenants: [t] }), tenant: t, unit: u, prop, date: '2026-11-15', f }), tpl };
  };
  const text = (m: { model: { blocks: unknown[] } }) => JSON.stringify(m.model.blocks);
  it('Mietvertrag: Vermieter sind die Eigentümer, vertreten durch die Firma; Miete auf das Hauskonto', () => {
    const r = render('mietvertrag', house(), { Mietbeginn: '2026-12-01', Schlüssel: '2', Schönheitsreparaturen: 'Der Vermieter trägt die Schönheitsreparaturen.', Tierhaltung: 'Kleintiere sind erlaubt.' });
    const t = text(r);
    expect(t).toContain('Max Muster, Weg 1, 33100 Paderborn (50 %)');
    expect(t).toContain('vertreten durch');
    expect(t).toContain('bevollmächtigt, alle Erklärungen im Namen der Eigentümer abzugeben');
    expect(t).toContain('DE02 1203 0000 0000 2020 51');
    expect(t).not.toContain('DE89 3704');
    expect(r.missing).not.toContain('IBAN');
  });
  it('Mietvertrag ohne Eigentümer und Hauskonto: Warnungen, IBAN fehlt', () => {
    const r = render('mietvertrag', house({ owners: undefined, bank: undefined }), { Mietbeginn: '2026-12-01' });
    expect(r.warnings.join(' ')).toMatch(/keine Eigentümer hinterlegt/);
    expect(r.warnings.join(' ')).toMatch(/kein Mietkonto hinterlegt/);
    expect(r.missing).toContain('IBAN');
  });
  it('andere Dokumente tragen einen Vollmachtshinweis unter der Überschrift', () => {
    const r = render('kautionsquittung', house(), { Betrag: '1000', Eingangsdatum: '2026-11-01' });
    const blocks = r.model.blocks as { t: string; text?: string }[];
    expect(blocks[0].t).toBe('h1');
    expect(blocks[1]).toMatchObject({ t: 'p', small: true });
    expect(blocks[1].text).toContain('Vollmacht der Eigentümer');
    expect(text(render('kautionsquittung', house({ owners: undefined }), { Betrag: '1' }))).not.toContain('Vollmacht der Eigentümer');
  });
  it('Wohnungsgeberbestätigung: Eigentümer als Wohnungsgeber, Firma als bevollmächtigter Verwalter', () => {
    const t = text(render('wohnungsgeber', house(), { Art: 'Einzug', Datum: '2026-12-01', Personen: 'Anna Schmidt' }));
    expect(t).toContain('Wohnungsgeber (Eigentümer)');
    expect(t).toContain('Max Muster, Weg 1, 33100 Paderborn (50 %)');
    expect(t).toContain('bevollmächtigter Verwalter');
  });
  it('Zahlungsinformation: Hauskonto je Haus', () => {
    const a = text(render('zahlungsinfo', house()));
    expect(a).toContain('DE02 1203 0000 0000 2020 51');
    expect(a).not.toContain('DE89 3704');
    expect(render('zahlungsinfo', house({ bank: undefined })).warnings.join(' ')).toMatch(/kein Mietkonto/);
  });
});

describe('Kontoauszug eines Hauskontos', () => {
  it('ordnet nur Mieter des gewählten Hauses zu', () => {
    const a = property({ id: 'pa', name: 'Haus A' }); const b = property({ id: 'pb', name: 'Haus B' });
    const ua = unit(a.id, { name: 'Wohnung 1' }); const ub = unit(b.id, { name: 'Wohnung 1' });
    const ta = tenant(ua.id, { name: 'Anna Schmidt', moveIn: '2020-01-01' }); const tb = tenant(ub.id, { name: 'Anna Schmidt', moveIn: '2020-01-01', iban: 'DE02120300000000202051' });
    const db = dbWith({ properties: [a, b], units: [ua, ub], tenants: [ta, tb] });
    const row = { id: 'r1', date: '2026-11-03', amount: 800, name: 'Anna Schmidt', purpose: 'Miete', iban: '' };
    const all = scoreRows(db, [row as never])[0];
    expect(all.tie).toBe(true); // zwei gleiche Namen in zwei Häusern
    expect(scoreRows(db, [row as never], 'pa')[0]).toMatchObject({ tenantId: ta.id, tie: false });
    expect(scoreRows(db, [row as never], 'pb')[0].tenantId).toBe(tb.id);
  });
});
