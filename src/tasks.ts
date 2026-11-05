import { DB } from './types';
import { addDays, rentNow, today } from './calc';
import { houseId } from './ids';
import { suggestCosts } from './nkCosts';
import { wechsel } from './moveOut';
import { depositRow, RETURN_USUAL_DAYS } from './deposit';

/**
 * Aufgaben aus der Datenprüfung: Dinge, die die App selbst bemerkt und die du nur noch antippen musst.
 * (Rückstände, Mahnungen, Fristen zeigt weiterhin die Übersicht.)
 */
export type TaskLevel = 'hoch' | 'normal' | 'hinweis';
export interface Task {
  id: string; // stabil, damit „Erledigt“ gemerkt werden kann
  level: TaskLevel;
  icon: string;
  title: string;
  detail: string;
  screen: string;
  params?: Record<string, string>;
}

const isActive = (t: { moveOut: string }, now: string) => !t.moveOut || t.moveOut >= now;

export function computeTasks(db: DB, opts: { dismissed?: string[]; now?: string } = {}): Task[] {
  const now = opts.now ?? today();
  const out: Task[] = [];
  const unitName = (id: string) => db.units.find((u) => u.id === id)?.name ?? '';
  const propOfUnit = (id: string) => db.properties.find((p) => p.id === db.units.find((u) => u.id === id)?.propertyId);
  const where = (unitId: string) => { const p = propOfUnit(unitId); return `${p?.name ?? ''} · ${unitName(unitId)}`.replace(/^ · /, ''); };

  // 1) Mehrere aktive Mieter in einer Einheit
  for (const u of db.units) {
    const act = db.tenants.filter((t) => t.unitId === u.id && isActive(t, now));
    if (act.length > 1) out.push({ id: `zwei:${u.id}`, level: 'hoch', icon: 'people', title: `${act.length} aktive Mieter in ${u.name}`, detail: `${where(u.id)}: ${act.map((t) => t.name).join(', ')}. Wer ist der aktuelle Mieter? Trage beim Vorgänger einen Auszug ein.`, screen: 'UnitDetail', params: { id: u.id } });
  }

  // 2) Fehlende Angaben bei aktiven Mietern und belegten Einheiten
  for (const t of db.tenants) {
    if (!isActive(t, now)) continue;
    if (!t.moveIn) out.push({ id: `einzug:${t.id}`, level: 'normal', icon: 'calendar-outline', title: `Einzugsdatum fehlt: ${t.name}`, detail: where(t.unitId), screen: 'TenantForm', params: { id: t.id } });
    const u = db.units.find((x) => x.id === t.unitId);
    if (u && (!(u.area > 0) || !(rentNow(u).coldRent > 0))) out.push({ id: `einheit:${u.id}`, level: 'normal', icon: 'resize-outline', title: `${u.name}: ${!(u.area > 0) ? 'Fläche' : 'Kaltmiete'} fehlt`, detail: `${where(u.id)} ist vermietet, aber nicht vollständig erfasst.`, screen: 'UnitForm', params: { id: u.id } });
  }

  // 3) Eigene Vermerke „bitte prüfen / ergänzen“ (z. B. aus dem Import)
  for (const t of db.tenants) {
    const m = t.notes?.match(/[^.]*\bbitte (prüfen|ergänzen)[^.]*\.?/i);
    if (m) out.push({ id: `notiz:${t.id}`, level: 'normal', icon: 'create-outline', title: `Prüfen: ${t.name}`, detail: `${where(t.unitId)} · ${m[0].trim()}`, screen: 'TenantForm', params: { id: t.id } });
  }

  // 4) Zählerstände fehlen zum letzten Jahresende (Voraussetzung für Abrechnung nach Verbrauch)
  const year = Number(now.slice(0, 4)) - 1;
  const cutoff = `${year}-12-01`;
  for (const p of db.properties) {
    const meters = db.meters.filter((m) => m.propertyId === p.id);
    const stale = meters.filter((m) => !db.readings.some((r) => r.meterId === m.id && r.date >= cutoff));
    if (stale.length) out.push({ id: `zaehler:${p.id}:${year}`, level: 'normal', icon: 'speedometer-outline', title: `Zählerstände ${year}: ${stale.length} von ${meters.length} fehlen`, detail: `${p.name}${houseId(p) ? ` (${houseId(p)})` : ''} · für die Nebenkostenabrechnung zum 31.12.${year}`, screen: 'Ablesung', params: { propertyId: p.id } });
  }

  // 4b) Angekündigte Vorauszahlung gilt jetzt: in der Wohnung übernehmen
  for (const t of db.tenants) {
    if (t.advanceChange && t.advanceChange.from <= now && isActive(t, now)) out.push({ id: `vorauszahlung:${t.id}:${t.advanceChange.from}`, level: 'normal', icon: 'trending-up', title: `Neue Vorauszahlung übernehmen: ${t.name}`, detail: `${where(t.unitId)} · ab ${t.advanceChange.from.split('-').reverse().join('.')} ${t.advanceChange.amount.toLocaleString('de-DE')} €`, screen: 'UnitDetail', params: { id: t.unitId } });
  }

  // 4a) Angekündigte Mieterhöhung gilt jetzt: Zustimmung klären und übernehmen
  for (const t of db.tenants) {
    const rc = t.rentChange;
    if (rc && isActive(t, now) && (rc.from <= now || (rc.consentUntil && rc.consentUntil < now))) out.push({ id: `mieterhoehung:${t.id}:${rc.from}`, level: 'normal', icon: 'trending-up', title: `Mieterhöhung klären: ${t.name}`, detail: `${where(t.unitId)} · ${rc.coldRent.toLocaleString('de-DE')} € ab ${rc.from.split('-').reverse().join('.')}${rc.kind === 'vergleich' ? ' · Zustimmung prüfen' : ' · Miete übernehmen'}`, screen: 'UnitDetail', params: { id: t.unitId } });
  }

  // 4e) Mieterwechsel läuft: Auszug in den nächsten 30 Tagen oder vor höchstens 120 Tagen, mit offenen Schritten
  for (const t of db.tenants) {
    if (!t.moveOut || t.moveOut > addDays(now, 30) || t.moveOut < addDays(now, -120)) continue;
    const w = wechsel(db, t.unitId, now);
    if (w && w.outgoing?.id === t.id && w.open > 0) out.push({ id: `mieterwechsel:${t.id}:${t.moveOut}`, level: t.moveOut < now ? 'normal' : 'hinweis', icon: 'swap-horizontal-outline', title: `Mieterwechsel: ${w.open} Schritt${w.open === 1 ? '' : 'e'} offen`, detail: `${where(t.unitId)} · Auszug ${t.moveOut.split('-').reverse().join('.')} (${t.name})`, screen: 'Mieterwechsel', params: { unitId: t.unitId } });
  }

  // 4f) Kautionen: Rückzahlung fällig, Anlage fehlt, Zahlung fehlt
  for (const t of db.tenants) {
    const r = depositRow(db, t, now);
    if (!r) continue;
    const k = (id: string) => `${id}:${t.id}`;
    if (r.status === 'rueckzahlung' && r.daysSinceMoveOut >= 60) out.push({ id: k('kaution-zurueck'), level: r.daysSinceMoveOut >= RETURN_USUAL_DAYS ? 'hoch' : 'normal', icon: 'wallet-outline', title: `Kaution zurückzahlen: ${t.name}`, detail: `${where(t.unitId)} · ausgezogen vor ${r.daysSinceMoveOut} Tagen, üblich sind bis zu ${RETURN_USUAL_DAYS / 30} Monate`, screen: 'Kaution', params: { tenantId: t.id } });
    if (r.notPlaced) out.push({ id: k('kaution-anlage'), level: 'hinweis', icon: 'wallet-outline', title: `Kaution anlegen: ${t.name}`, detail: `${where(t.unitId)} · getrennt vom Vermögen anlegen und vermerken (§ 551 BGB)`, screen: 'Kaution', params: { tenantId: t.id } });
    if (r.tooHigh) out.push({ id: k('kaution-hoch'), level: 'hinweis', icon: 'warning-outline', title: `Kaution über drei Kaltmieten: ${t.name}`, detail: `${where(t.unitId)} · höchstens ${r.maxAllowed.toLocaleString('de-DE')} € zulässig`, screen: 'Kaution', params: { tenantId: t.id } });
  }

  // 4d) Hinterlegter Mietspiegel ist abgelaufen
  for (const p of db.properties) {
    const v = p.rentBasis?.validUntil;
    if (v && v < now) out.push({ id: `mietspiegel:${p.id}:${v}`, level: 'normal', icon: 'stats-chart-outline', title: `Mietspiegel abgelaufen: ${p.name}`, detail: `„${p.rentBasis?.name || 'Mietspiegel'}“ galt bis ${v.split('-').reverse().join('.')}. Neue Fassung hinterlegen.`, screen: 'Mietspiegel', params: { propertyId: p.id } });
  }

  // 4c) Umlagefähige Ausgaben des Vorjahres sind noch nicht (vollständig) in der Nebenkostenabrechnung
  for (const p of db.properties) {
    const open = suggestCosts(db, p.id, year).filter((x) => !x.existing || Math.abs(x.existing.amount - x.amount) > 0.005);
    if (open.length) out.push({ id: `nkkosten:${p.id}:${year}`, level: 'normal', icon: 'receipt-outline', title: `Betriebskosten ${year}: ${open.length} Kostenart${open.length === 1 ? '' : 'en'} übernehmen`, detail: `${p.name} · umlagefähige Ausgaben für die Nebenkostenabrechnung`, screen: 'NkKosten', params: { propertyId: p.id, year: String(year) } });
  }

  // 5) Ausgaben ohne Beleg (älter als eine Woche)
  const old = db.expenses.filter((e) => !e.receiptId && e.date <= addDays(now, -7));
  if (old.length) out.push({ id: 'belege', level: 'hinweis', icon: 'receipt-outline', title: `${old.length} Ausgabe${old.length === 1 ? '' : 'n'} ohne Beleg`, detail: 'Für die Steuer sollte zu jeder Ausgabe ein Beleg vorliegen.', screen: 'Ausgaben' });

  // 6) Frühere Mieter ohne bekanntes Einzugsdatum (Historie unvollständig)
  const formerNoIn = db.tenants.filter((t) => !isActive(t, now) && !t.moveIn);
  if (formerNoIn.length) out.push({ id: 'historie-einzug', level: 'hinweis', icon: 'time-outline', title: `Historie: ${formerNoIn.length} früherer Mieter ohne Einzugsdatum`, detail: formerNoIn.slice(0, 3).map((t) => `${t.name} (${unitName(t.unitId)})`).join(', ') + (formerNoIn.length > 3 ? ' …' : ''), screen: 'TenantForm', params: { id: formerNoIn[0].id } });

  const hidden = new Set(opts.dismissed ?? []);
  const rank = { hoch: 0, normal: 1, hinweis: 2 } as const;
  return out.filter((t) => !hidden.has(t.id)).sort((a, b) => rank[a.level] - rank[b.level]);
}
