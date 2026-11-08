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
  const receiptIds = new Set<string>();
  if (kind === 'expenses') { const r = d.expenses.find((e) => e.id === id)?.receiptId; if (r) receiptIds.add(r); }
  if (kind === 'properties') d.expenses.filter((e) => e.propertyId === id && e.receiptId).forEach((e) => receiptIds.add(e.receiptId!));
  if (kind === 'firmInvoices') { const dId = d.firmInvoices.find((i) => i.id === id)?.docId; if (dId) receiptIds.add(dId); }
  const goneDocs = d.documents.filter((x) => (kind === 'documents' ? x.id === id : ownerIds.has(x.ownerId) || receiptIds.has(x.id)));

  const n = { ...d, [kind]: (d[kind] as { id: string }[]).filter((x) => x.id !== id) } as DB;
  if (kind === 'properties') {
    const unitIds = d.units.filter((u) => u.propertyId === id).map((u) => u.id);
    n.units = d.units.filter((u) => u.propertyId !== id);
    n.costs = d.costs.filter((c) => c.propertyId !== id);
    n.expenses = d.expenses.filter((e) => e.propertyId !== id);
    n.loans = d.loans.filter((l) => l.propertyId !== id);
    n.issues = d.issues.filter((i) => i.propertyId !== id);
    n.checks = d.checks.filter((c) => c.propertyId !== id);
    n.firmCosts = d.firmCosts.filter((c) => c.propertyId !== id);
    n.firmInvoices = d.firmInvoices.filter((i) => i.propertyId !== id);
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
    n.issues = d.issues.filter((i) => i.unitId !== id);
    n.payments = d.payments.filter((p) => !tIds.includes(p.tenantId));
    n.reminders = d.reminders.filter((r) => !tIds.includes(r.tenantId));
  } else if (kind === 'tenants') {
    n.payments = d.payments.filter((p) => p.tenantId !== id);
    n.reminders = d.reminders.filter((r) => r.tenantId !== id);
  }
  if (kind === 'firmInvoices') {
    // Rechnung gelöscht: die daraus gebuchten Ausgaben entfallen, weiterbelastete Kosten sind wieder offen
    n.expenses = d.expenses.filter((e) => e.invoiceId !== id);
    n.firmCosts = d.firmCosts.map((c) => (c.billedIn === id ? { ...c, billedIn: undefined } : c));
  }
  if (kind === 'documents') n.expenses = d.expenses.map((e) => (e.receiptId === id ? { ...e, receiptId: undefined } : e));
  n.documents = d.documents.filter((x) => !goneDocs.includes(x));
  return { db: n, goneDocs };
}

/**
 * Macht ein Löschen rückgängig: bringt entfernte Datensätze zurück und stellt Einträge wieder her, die das Löschen verändert hat
 * (z. B. entfernter Beleg-Verweis), sofern sie seither nicht erneut geändert wurden. Wiederhergestellte Sätze erhalten eine neue
 * Änderungszeit, damit der Cloud-Abgleich sie als neuer als den Grabstein erkennt.
 */
export function restoreRemoved(cur: DB, before: DB, after: DB, now = new Date().toISOString()): DB {
  const out = { ...cur } as Record<string, any[]>;
  for (const k of Object.keys(before) as Kind[]) {
    const curList = cur[k] as unknown as { id: string }[];
    const ids = new Set(curList.map((x) => x.id));
    const afterById = new Map((after[k] as unknown as { id: string }[]).map((x) => [x.id, x]));
    const beforeList = before[k] as unknown as { id: string }[];
    const removed = beforeList.filter((x) => !afterById.has(x.id) && !ids.has(x.id)).map((x) => ({ ...x, updatedAt: now }));
    const revert = new Map(beforeList.filter((x) => afterById.has(x.id) && JSON.stringify(afterById.get(x.id)) !== JSON.stringify(x)).map((x) => [x.id, x]));
    out[k] = [...curList.map((x) => (revert.has(x.id) && JSON.stringify(x) === JSON.stringify(afterById.get(x.id)) ? { ...revert.get(x.id)!, updatedAt: now } : x)), ...removed];
  }
  return out as unknown as DB;
}

/** Anzahl der Datensätze, die ein Löschen entfernt (für die Meldung „Gelöscht (n Einträge)“). */
export const removedCount = (before: DB, after: DB) => (Object.keys(before) as Kind[]).reduce((s, k) => s + (before[k] as unknown[]).length - (after[k] as unknown[]).length, 0);
