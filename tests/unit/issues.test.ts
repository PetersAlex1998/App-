import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ageDays, contractorStats, isOpen, issueCost, orderMail, placeOf, sortIssues } from '../../src/issues';
import { computeTasks } from '../../src/tasks';
import { removeItem } from '../../src/dbops';
import type { Contractor, Expense, Issue } from '../../src/types';
import { dbWith, property, tenant, unit } from '../helpers/builders';

const NOW = '2026-11-15';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${NOW}T12:00:00Z`)); });
afterEach(() => vi.useRealTimers());

const issue = (o: Partial<Issue> = {}): Issue => ({ id: 'i1', propertyId: 'p', title: 'Heizung kalt', reported: '2026-11-01', status: 'offen', ...o });
const exp = (o: Partial<Expense> = {}): Expense => ({ id: 'e1', propertyId: 'p', date: '2026-11-10', amount: 250, category: 'instandhaltung', vendor: 'Meier', description: '', ...o });
const meier: Contractor = { id: 'c1', name: 'Sanitär Meier', trade: 'Sanitär', phone: '0171 1', email: 'meier@example.de' };

describe('Schäden', () => {
  it('Alter, offen/erledigt', () => {
    expect(ageDays(issue(), NOW)).toBe(14);
    expect(isOpen(issue())).toBe(true);
    const done = issue({ status: 'erledigt', done: '2026-11-05' });
    expect(isOpen(done)).toBe(false);
    expect(ageDays(done, NOW)).toBe(4); // bis zur Erledigung, nicht bis heute
  });
  it('Sortierung: offen vor erledigt, dringend zuerst, ältere zuerst', () => {
    const a = issue({ id: 'a', reported: '2026-10-01' });
    const b = issue({ id: 'b', reported: '2026-11-10', urgent: true });
    const c = issue({ id: 'c', status: 'erledigt', done: '2026-11-12' });
    const d = issue({ id: 'd', reported: '2026-09-01' });
    expect(sortIssues([c, a, d, b]).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('Kosten aus verknüpften Ausgaben', () => {
    const db = dbWith({ issues: [issue()], expenses: [exp(), exp({ id: 'e2', amount: 49.5, issueId: 'i1' }), exp({ id: 'e3', issueId: 'i1' }), exp({ id: 'e4', issueId: 'andere' })] });
    expect(issueCost(db, db.issues[0])).toBe(299.5);
  });
  it('Handwerker-Übersicht: Aufträge, offen, Kosten', () => {
    const db = dbWith({ contractors: [meier], issues: [issue({ contractorId: 'c1' }), issue({ id: 'i2', contractorId: 'c1', status: 'erledigt', done: NOW })], expenses: [exp({ issueId: 'i2' })] });
    expect(contractorStats(db)[0]).toMatchObject({ jobs: 2, open: 1, cost: 250 });
  });
  it('Ort: Haus · Wohnung oder allgemein', () => {
    const p = property({ name: 'Haus A' }); const u = unit(p.id, { name: 'Wohnung 2' });
    const db = dbWith({ properties: [p], units: [u] });
    expect(placeOf(db, issue({ propertyId: p.id, unitId: u.id }))).toBe('Haus A · Wohnung 2');
    expect(placeOf(db, issue({ propertyId: p.id }))).toBe('Haus A · allgemein');
  });
  it('Auftragsmail enthält Ort und Beschreibung, aber keine Mieterdaten', () => {
    const p = property({ street: 'Langestr. 13', zip: '33175', city: 'Bad Lippspringe' }); const u = unit(p.id, { name: 'Wohnung 2' }); const t = tenant(u.id, { name: 'Anna Geheim', phone: '0151 999' });
    const db = dbWith({ properties: [p], units: [u], tenants: [t] });
    const m = orderMail(db, issue({ propertyId: p.id, unitId: u.id, tenantId: t.id, urgent: true, description: 'Kein Warmwasser' }), meier, 'Alex');
    expect(m.subject).toMatch(/^Dringend: Heizung kalt/);
    expect(m.body).toContain('Langestr. 13, 33175 Bad Lippspringe, Wohnung 2');
    expect(m.body).toContain('Kein Warmwasser');
    expect(m.body + m.href).not.toContain('Geheim');
    expect(m.body).not.toContain('0151');
    expect(m.href.startsWith('mailto:meier@example.de?subject=')).toBe(true);
  });
  it('Löschen von Haus oder Wohnung entfernt die zugehörigen Meldungen', () => {
    const p = property(); const u = unit(p.id);
    const db = dbWith({ properties: [p], units: [u], issues: [issue({ propertyId: p.id, unitId: u.id }), issue({ id: 'i2', propertyId: p.id })] });
    expect(removeItem(db, 'units', u.id).db.issues.map((x) => x.id)).toEqual(['i2']);
    expect(removeItem(db, 'properties', p.id).db.issues).toEqual([]);
  });
});

describe('Aufgaben zu Schäden', () => {
  const t = (i: Issue) => computeTasks(dbWith({ issues: [i] }), { now: NOW }).filter((x) => x.id.startsWith('schaden:'));
  it('dringend offen → hoch; offen ab 7 Tagen → normal; frische Meldung → nichts', () => {
    expect(t(issue({ urgent: true }))[0]).toMatchObject({ level: 'hoch' });
    expect(t(issue())[0]).toMatchObject({ level: 'normal' });
    expect(t(issue({ reported: '2026-11-14' }))).toEqual([]);
  });
  it('beauftragt: nach 30 Tagen nachfassen; erledigt nie', () => {
    expect(t(issue({ status: 'beauftragt', ordered: '2026-10-01' }))[0]).toMatchObject({ level: 'hinweis' });
    expect(t(issue({ status: 'beauftragt', ordered: '2026-11-10' }))).toEqual([]);
    expect(t(issue({ status: 'erledigt', done: NOW }))).toEqual([]);
  });
});
