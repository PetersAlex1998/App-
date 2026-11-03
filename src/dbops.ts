import { DB, Doc, Kind } from './types';
import { normalizeIds } from './ids';

/** Datensatz anlegen oder ersetzen (mit Änderungszeitpunkt). Reine Funktion, daher testbar. */
export function upsertItem<K extends Kind>(d: DB, kind: K, item: DB[K][number], now = new Date().toISOString()): DB {
  const list = d[kind] as { id: string }[];
  const stamped = { ...item, updatedAt: now };
  const exists = list.some((x) => x.id === item.id);
  const next = exists ? list.map((x) => (x.id === item.id ? stamped : x)) : [...list, stamped];
  return normalizeIds({ ...d, [kind]: next });
}

/**
 * Datensatz löschen samt allem, was daran hängt:
 * Haus -> Einheiten, Mieter, Zahlungen, Mahnungen, Zähler, Ablesungen, Kosten, Dokumente;
 * Einheit -> Mieter, Zahlungen, Mahnungen, Zähler, Ablesungen, Dokumente;
 * Mieter -> Zahlungen, Mahnungen, Dokumente; Zähler -> Ablesungen.
 * `goneDocs` sind die entfernten Dokumente (deren Dateien müssen separat gelöscht werden).
 */
export function removeItem(d: DB, kind: Kind, id: string): { db: DB; goneDocs: Doc[] } {
  const ownerIds = new Set<string>([id]);
  if (kind === 'properties') {
    const unitIds = d.units.filter((u) => u.propertyId === id).map((u) => u.id);
    unitIds.forEach((x) => ownerIds.add(x));
    d.tenants.filter((t) => unitIds.includes(t.unitId)).forEach((t) => ownerIds.add(t.id));
  } else if (kind === 'units') d.tenants.filter((t) => t.unitId === id).forEach((t) => ownerIds.add(t.id));
  const goneDocs = d.documents.filter((x) => (kind === 'documents' ? x.id === id : ownerIds.has(x.ownerId)));

  const n = { ...d, [kind]: (d[kind] as { id: string }[]).filter((x) => x.id !== id) } as DB;
  if (kind === 'properties') {
    const unitIds = d.units.filter((u) => u.propertyId === id).map((u) => u.id);
    n.units = d.units.filter((u) => u.propertyId !== id);
    n.costs = d.costs.filter((c) => c.propertyId !== id);
    const mIds = d.meters.filter((m) => m.propertyId === id).map((m) => m.id);
    n.meters = d.meters.filter((m) => m.propertyId !== id);
    n.readings = d.readings.filter((r) => !mIds.includes(r.meterId));
    const tIds = d.tenants.filter((t) => unitIds.includes(t.unitId)).map((t) => t.id);
    n.tenants = d.tenants.filter((t) => !tIds.includes(t.id));
    n.payments = d.payments.filter((p) => !tIds.includes(p.tenantId));
    n.reminders = d.reminders.filter((r) => !tIds.includes(r.tenantId));
  } else if (kind === 'meters') {
    n.readings = d.readings.filter((r) => r.meterId !== id);
  } else if (kind === 'units') {
    const mIds = d.meters.filter((m) => m.unitId === id).map((m) => m.id);
    n.meters = d.meters.filter((m) => m.unitId !== id);
    n.readings = d.readings.filter((r) => !mIds.includes(r.meterId));
    const tIds = d.tenants.filter((t) => t.unitId === id).map((t) => t.id);
    n.tenants = d.tenants.filter((t) => t.unitId !== id);
    n.payments = d.payments.filter((p) => !tIds.includes(p.tenantId));
    n.reminders = d.reminders.filter((r) => !tIds.includes(r.tenantId));
  } else if (kind === 'tenants') {
    n.payments = d.payments.filter((p) => p.tenantId !== id);
    n.reminders = d.reminders.filter((r) => r.tenantId !== id);
  }
  n.documents = d.documents.filter((x) => !goneDocs.includes(x));
  return { db: n, goneDocs };
}
