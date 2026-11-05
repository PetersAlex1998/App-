import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { depositSettlement, findParties, wechsel } from '../../src/moveOut';
import { computeTasks } from '../../src/tasks';
import { renderTemplate, templateById, defaultFields } from '../../src/templates';
import { defaultSettings } from '../../src/settingsDefaults';
import { dbWith, payment, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

function base(tOver = {}) {
  const p = property();
  const u = unit(p.id);
  const t = tenant(u.id, { moveIn: '2024-01-01', trackFrom: '2026-01', deposit: 1500, ...tOver });
  return { p, u, t, db: dbWith({ properties: [p], units: [u], tenants: [t] }) };
}
const step = (w: ReturnType<typeof wechsel>, id: string) => w!.steps.find((s) => s.id === id)!;

describe('Beteiligte', () => {
  it('aktiver Mieter zieht aus; später ausgezogener ist es auch; Nachmieter wird erkannt', () => {
    const { u, t, db } = base();
    expect(findParties(db, u.id).outgoing?.id).toBe(t.id);
    const old = { ...t, moveOut: '2026-10-31' };
    const nw = tenant(u.id, { name: 'Neu', moveIn: '2026-11-01' });
    const d2 = { ...db, tenants: [old, nw] };
    expect(findParties(d2, u.id)).toMatchObject({ outgoing: { id: t.id }, incoming: { id: nw.id } });
    // alter Mieter mit künftigem Auszug und Nachmieter mit künftigem Einzug
    const leaving = { ...t, moveOut: '2026-12-31' };
    const next = tenant(u.id, { name: 'Neu', moveIn: '2027-01-01' });
    expect(findParties({ ...db, tenants: [leaving, next] }, u.id)).toMatchObject({ outgoing: { id: t.id }, incoming: { id: next.id } });
  });
});

describe('Schritte', () => {
  it('ohne Auszugsdatum: Termin offen, Zähler wartet', () => {
    const { u, db } = base();
    const w = wechsel({ ...db, meters: [{ id: 'm1', propertyId: db.properties[0].id, unitId: u.id, type: 'wasser_kalt', number: '1' }] }, u.id)!;
    expect(step(w, 'termin').status).toBe('open');
    expect(step(w, 'zaehler').status).toBe('wait');
    expect(step(w, 'neu').status).toBe('open');
  });
  it('Zähler gelten zum Auszug als abgelesen, wenn ein Stand um das Datum liegt', () => {
    const { p, u, t, db } = base({ moveOut: '2026-11-30' });
    const m = { id: 'm1', propertyId: p.id, unitId: u.id, type: 'wasser_kalt' as const, number: '1' };
    const d = { ...db, meters: [m] };
    expect(step(wechsel(d, u.id)!, 'zaehler').status).toBe('open');
    const d2 = { ...d, readings: [{ id: 'r1', meterId: 'm1', date: '2026-11-30', value: 10 }] };
    expect(step(wechsel(d2, u.id)!, 'zaehler').status).toBe('done');
    expect(t.moveOut).toBe('2026-11-30');
  });
  it('Handmarkierung und erzeugte Dokumente zählen als erledigt', () => {
    const { u, t, db } = base({ moveOut: '2026-11-30', moveSteps: { protokoll: NOW } });
    expect(step(wechsel(db, u.id)!, 'protokoll').status).toBe('done');
    const doc = { id: 'd1', ownerKind: 'tenant', ownerId: t.id, category: 'brief', name: 'x', mime: 'application/pdf', size: 1, added: NOW, status: 'bereit', note: 'Kündigungsbestätigung' } as never;
    expect(step(wechsel({ ...db, documents: [doc] }, u.id)!, 'kuendigung').status).toBe('done');
  });
  it('Nachmieter: Unterlagen werden abgefragt; Fortschritt zählt Pflichtschritte', () => {
    const { u, t, db } = base({ moveOut: '2026-10-31' });
    const nw = tenant(u.id, { name: 'Neu', moveIn: '2026-11-01', moveSteps: { vertrag: NOW } });
    const w = wechsel({ ...db, tenants: [t, nw] }, u.id)!;
    expect(step(w, 'neu').status).toBe('done');
    expect(step(w, 'vertrag').status).toBe('done');
    expect(step(w, 'geber').status).toBe('open');
    expect(step(w, 'kautionNeu').optional).toBe(true);
    expect(w.done).toBeGreaterThan(0);
    expect(w.open).toBeGreaterThan(0);
  });
});

describe('Kaution', () => {
  it('verrechnet offene Mieten und Nachzahlung, nie negativ', () => {
    const { u, t, db } = base({ moveOut: '2026-10-31', trackFrom: '2026-09' });
    // Sep. bezahlt, Okt. offen: 640 + 160
    const d = { ...db, payments: [payment(t.id, '2026-09', 800), payment(t.id, '2024-01', 1500, { kind: 'kaution' })] };
    const k = depositSettlement(d, t, u);
    expect(k.paid).toBe(1500);
    expect(k.openRent).toBe(800);
    expect(k.nkKnown).toBe(false);
    expect(k.refund).toBe(700);
    expect(k.shortfall).toBe(0);
    const arm = depositSettlement({ ...d, payments: [payment(t.id, '2024-01', 300, { kind: 'kaution' })] }, t, u);
    expect(arm.refund).toBe(0);
    expect(arm.shortfall).toBe(1600 - 300);
  });
  it('Vorlage Kautionsabrechnung rechnet Rückzahlung aus den Feldern', () => {
    const { p, u, t, db } = base({ moveOut: '2026-10-31' });
    const tpl = templateById('kautionsabrechnung')!;
    const ctx = { s: defaultSettings, db, tenant: t, unit: u, prop: p, date: NOW, f: { Gezahlt: '1.500,00', OffeneMiete: '200', Nachzahlung: '300', Schaden: '100', SchadenText: 'Wandschaden', Zinsen: '', IBAN: '' } };
    const r = renderTemplate(tpl, ctx);
    const txt = JSON.stringify(r.model);
    expect(txt).toContain('Wandschaden');
    expect(txt).toMatch(/900,00/);
    expect(r.warnings.join(' ')).toMatch(/Rückbehalt/);
    expect(Object.keys(defaultFields(tpl, { s: defaultSettings, db, tenant: t, unit: u, prop: p, date: NOW }))).toContain('Gezahlt');
  });
});

describe('Aufgabe Mieterwechsel', () => {
  it('erscheint nahe am Auszug mit offenen Schritten, nicht bei weit zurückliegendem Auszug', () => {
    const near = base({ moveOut: '2026-11-30' });
    expect(computeTasks(near.db, { now: NOW }).some((x) => x.id.startsWith('mieterwechsel:'))).toBe(true);
    const far = base({ moveOut: '2025-01-31' });
    expect(computeTasks(far.db, { now: NOW }).some((x) => x.id.startsWith('mieterwechsel:'))).toBe(false);
  });
});

describe('Datumsfelder in Vorlagen', () => {
  it('erscheinen als TT.MM.JJJJ, nicht als ISO-Datum', () => {
    const { p, u, t, db } = base({ moveOut: '2026-10-31' });
    const r = renderTemplate(templateById('kautionsquittung')!, { s: defaultSettings, db, tenant: t, unit: u, prop: p, date: NOW, f: { Betrag: '1500', Eingangsdatum: '2024-01-03', Kautionsart: '' } });
    const txt = JSON.stringify(r.model);
    expect(txt).toContain('03.01.2024');
    expect(txt).not.toContain('2024-01-03');
  });
});
