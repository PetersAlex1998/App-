import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DB, Kind, emptyDB } from './types';
import { deleteBlob, filesSupported } from './files';
import { normalizeIds } from './ids';

const KEY = 'immo-db-v1';

interface Ctx {
  db: DB;
  ready: boolean;
  save: <K extends Kind>(kind: K, item: DB[K][number]) => void;
  remove: (kind: Kind, id: string) => void;
  replaceAll: (next: DB) => void;
}

const StoreCtx = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(StoreCtx);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(emptyDB);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setDb(normalizeIds({ ...emptyDB, ...JSON.parse(raw) })))
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  }, [db]);

  const save = useCallback<Ctx['save']>((kind, item) => {
    setDb((d) => {
      const list = d[kind] as { id: string }[];
      const exists = list.some((x) => x.id === item.id);
      const next = exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
      return normalizeIds({ ...d, [kind]: next });
    });
  }, []);

  const remove = useCallback((kind: Kind, id: string) => {
    setDb((d) => {
      // zugehörige Dokumente (samt Dateien) mit entfernen
      const ownerIds = new Set<string>([id]);
      if (kind === 'properties') {
        const unitIds = d.units.filter((u) => u.propertyId === id).map((u) => u.id);
        unitIds.forEach((x) => ownerIds.add(x));
        d.tenants.filter((t) => unitIds.includes(t.unitId)).forEach((t) => ownerIds.add(t.id));
      } else if (kind === 'units') d.tenants.filter((t) => t.unitId === id).forEach((t) => ownerIds.add(t.id));
      const gone = d.documents.filter((x) => (kind === 'documents' ? x.id === id : ownerIds.has(x.ownerId)));
      if (gone.length && filesSupported()) gone.forEach((x) => deleteBlob(x.id).catch(() => {}));

      let n = { ...d, [kind]: (d[kind] as { id: string }[]).filter((x) => x.id !== id) } as DB;
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
      n.documents = d.documents.filter((x) => !gone.includes(x));
      return n;
    });
  }, []);

  const replaceAll = useCallback((next: DB) => setDb(normalizeIds(next)), []);

  return <StoreCtx.Provider value={{ db, ready, save, remove, replaceAll }}>{children}</StoreCtx.Provider>;
}
