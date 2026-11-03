import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { EmptyState, ListRow, Screen, Section, useColors } from '../ui';
import { computeTasks } from '../tasks';
import { type } from '../theme';

const LEVEL = { hoch: { label: 'Wichtig', tone: 'danger' as const }, normal: { label: 'Zu prüfen', tone: 'warn' as const }, hinweis: { label: 'Hinweise', tone: 'neutral' as const } };

export function TasksScreen({ navigation }: any) {
  const { db } = useStore();
  const { s, update } = useSettings();
  const c = useColors();
  const tasks = computeTasks(db, { dismissed: s.dismissedTasks });
  const done = (id: string) => update({ dismissedTasks: [...(s.dismissedTasks ?? []), id] });
  const groups = (['hoch', 'normal', 'hinweis'] as const).map((l) => ({ l, list: tasks.filter((t) => t.level === l) })).filter((g) => g.list.length);
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 6, marginTop: 6 }}>Aufgaben</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 20 }}>Das hat die App in deinen Daten bemerkt. Tippe auf einen Punkt, um ihn zu klären, oder markiere ihn als erledigt.</Text>
      {tasks.length === 0 && <EmptyState icon="checkmark-circle" title="Alles in Ordnung" text="Die Datenprüfung findet nichts, was du klären müsstest." />}
      {groups.map(({ l, list }) => (
        <Section key={l} title={`${LEVEL[l].label} (${list.length})`}>
          {list.map((t) => (
            <View key={t.id}>
              <ListRow icon={t.icon as 'leaf'} iconTone={LEVEL[l].tone === 'neutral' ? undefined : LEVEL[l].tone} title={t.title} subtitle={t.detail} onPress={() => navigation.navigate(t.screen, t.params)} />
              <View style={{ paddingHorizontal: 14, paddingBottom: 8, alignItems: 'flex-start' }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Erledigt: ${t.title}`} onPress={() => done(t.id)} hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
                  <Text style={{ color: c.primary, fontSize: type.subhead, fontWeight: '600' }}>Erledigt – nicht mehr anzeigen</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
