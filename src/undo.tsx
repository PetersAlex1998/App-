import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from './store';
import { removeItem, removedCount, restoreRemoved } from './dbops';
import { deleteBlob, filesSupported } from './files';
import { Kind } from './types';
import { useColors } from './ui';

interface Offer { message: string; undo: () => void; commit: () => void }
const Ctx = createContext<{ offer: (o: Offer) => void }>({ offer: () => {} });
const VISIBLE_MS = 8000;

/** Meldung mit „Rückgängig“ am unteren Rand. Läuft die Zeit ab (oder kommt eine neue Meldung), wird das Löschen endgültig. */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [cur, setCur] = useState<Offer | null>(null);
  const curRef = useRef<Offer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const finish = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const o = curRef.current;
    curRef.current = null; setCur(null);
    o?.commit();
  }, []);
  const offer = useCallback((o: Offer) => {
    if (curRef.current) curRef.current.commit(); // vorherige Meldung endgültig machen
    if (timer.current) clearTimeout(timer.current);
    curRef.current = o; setCur(o);
    timer.current = setTimeout(finish, VISIBLE_MS);
  }, [finish]);
  const undo = () => {
    const o = curRef.current;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    curRef.current = null; setCur(null);
    o?.undo();
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Ctx.Provider value={{ offer }}>
      <View style={{ flex: 1 }}>
        {children}
        {cur && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 92, zIndex: 200, alignItems: 'center' }} pointerEvents="box-none">
            <View style={{ backgroundColor: c.ink, borderRadius: 16, paddingVertical: 10, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 520, width: '100%' }}>
              <Text style={{ color: c.onInk, fontSize: 15, fontWeight: '600', flex: 1 }}>{cur.message}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Rückgängig" onPress={undo} hitSlop={8} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
                <Text style={{ color: c.onInk, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' }}>Rückgängig</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Ctx.Provider>
  );
}

/** Löschen ohne Rückfrage, dafür mit „Rückgängig“. Dateien (Belege, Fotos) werden erst nach Ablauf endgültig entfernt. */
export function useDelete() {
  const { db, mergeRemote } = useStore();
  const { offer } = useContext(Ctx);
  const live = useRef(db);
  live.current = db;
  return useCallback((kind: Kind, id: string) => {
    const before = live.current;
    const { db: after, goneDocs } = removeItem(before, kind, id);
    const n = removedCount(before, after);
    mergeRemote((d) => removeItem(d, kind, id).db);
    offer({
      message: n > 1 ? `Gelöscht (${n} Einträge)` : 'Gelöscht',
      undo: () => mergeRemote((d) => restoreRemoved(d, before, after)),
      commit: () => { if (filesSupported()) goneDocs.forEach((x) => deleteBlob(x.id).catch(() => {})); },
    });
  }, [mergeRemote, offer]);
}
