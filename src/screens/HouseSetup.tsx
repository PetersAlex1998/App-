import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, EmptyState, ListRow, Note, Screen, Section, useColors } from '../ui';
import { SetupItem, houseSetup } from '../setup';
import { type } from '../theme';

/** Checkliste: was fehlt noch, damit das Haus vollständig eingerichtet ist? */
export function HouseSetup({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const p = db.properties.find((x) => x.id === route.params?.propertyId);
  if (!p) return <Screen><EmptyState icon="home" title="Haus nicht gefunden" text="Öffne die Einrichtung aus einem Haus." /></Screen>;
  const s = houseSetup(db, p);
  const skip = (i: SetupItem, on: boolean) => save('properties', { ...p, setupSkip: on ? [...(p.setupSkip ?? []), i.id] : (p.setupSkip ?? []).filter((x) => x !== i.id) });
  const row = (i: SetupItem) => (
    <View key={i.id}>
      <ListRow icon={(i.done ? 'checkmark-circle' : i.skipped ? 'remove-circle-outline' : 'ellipse-outline') as 'leaf'} iconTone={i.done ? 'ok' : i.core ? 'warn' : 'primary'} title={i.title} subtitle={i.skipped ? 'Nicht nötig' : i.detail} onPress={() => navigation.navigate(i.screen, i.params)} />
      {!i.done && i.skippable && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${i.title}: ${i.skipped ? 'wieder aufnehmen' : 'nicht nötig'}`} onPress={() => skip(i, !i.skipped)} style={{ paddingLeft: 66, paddingBottom: 10, minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: type.subhead, fontWeight: '600' }}>{i.skipped ? 'Wieder aufnehmen' : 'Nicht nötig'}</Text>
        </Pressable>
      )}
    </View>
  );
  const todo = s.items.filter((i) => !i.done && !i.skipped);
  const rest = s.items.filter((i) => i.done || i.skipped);
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 4 }}>Haus einrichten</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{p.name}</Text>
      <View accessible accessibilityLabel={`${s.done} von ${s.total} Angaben vollständig`} style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: c.text, fontSize: type.headline, fontWeight: '700' }}>{todo.length === 0 ? 'Alles eingerichtet' : `${s.done} von ${s.total} erledigt`}</Text>
          {todo.length === 0 && <Badge text="Fertig" tone="ok" />}
        </View>
        <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: c.fill, overflow: 'hidden' }}>
          <View style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%`, height: '100%', backgroundColor: todo.length ? c.primary : c.ok, borderRadius: 5 }} />
        </View>
      </View>
      {todo.length > 0 && <Section title="Noch offen">{todo.map(row)}</Section>}
      {rest.length > 0 && <Section title="Erledigt">{rest.map(row)}</Section>}
      <Note>Was nicht zu deinem Haus passt, markierst du mit „Nicht nötig“. Es zählt dann nicht mehr als offen.</Note>
    </Screen>
  );
}
