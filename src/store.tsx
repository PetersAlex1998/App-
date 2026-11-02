import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DB, Kind, emptyDB } from './types';

const KEY = 'immo-db-v1';

interface Ctx {
  db: DB;
  ready: boolean;
  save: <K extends Kind>(kind: K, item: DB[K][number]) => void;
  remove: (kind: Kind, id: string) => void;
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
      .then((raw) => raw && setDb({ ...emptyDB, ...JSON.parse(raw) }))
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
      return { ...d, [kind]: next };
    });
  }, []);

  const remove = useCallback((kind: Kind, id: string) => {
    setDb((d) => {
      let n = { ...d, [kind]: (d[kind] as { id: string }[]).filter((x) => x.id !== id) } as DB;
      if (kind === 'properties') {
        const unitIds = d.units.filter((u) => u.propertyId === id).map((u) => u.id);
        n.units = d.units.filter((u) => u.propertyId !== id);
        n.costs = d.costs.filter((c) => c.propertyId !== id);
        const tIds = d.tenants.filter((t) => unitIds.includes(t.unitId)).map((t) => t.id);
        n.tenants = d.tenants.filter((t) => !tIds.includes(t.id));
        n.payments = d.payments.filter((p) => !tIds.includes(p.tenantId));
        n.reminders = d.reminders.filter((r) => !tIds.includes(r.tenantId));
      } else if (kind === 'units') {
        const tIds = d.tenants.filter((t) => t.unitId === id).map((t) => t.id);
        n.tenants = d.tenants.filter((t) => t.unitId !== id);
        n.payments = d.payments.filter((p) => !tIds.includes(p.tenantId));
        n.reminders = d.reminders.filter((r) => !tIds.includes(r.tenantId));
      } else if (kind === 'tenants') {
        n.payments = d.payments.filter((p) => p.tenantId !== id);
        n.reminders = d.reminders.filter((r) => r.tenantId !== id);
      }
      return n;
    });
  }, []);

  return <StoreCtx.Provider value={{ db, ready, save, remove }}>{children}</StoreCtx.Provider>;
}
