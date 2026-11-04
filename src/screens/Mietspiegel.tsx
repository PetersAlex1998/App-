import React from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, DateField, EmptyState, Field, Note, Screen, Section, Segmented, useColors } from '../ui';
import { type } from '../theme';
import { basisNotes } from '../rentBasis';
import { Property } from '../types';

type Kind = 'eigene' | 'andere' | 'keiner';
const KIND_LABEL: Record<Kind, string> = { eigene: 'Eigener Mietspiegel', andere: 'Anderer Ort', keiner: 'Keiner' };

/** Pro Haus festhalten, auf welcher Grundlage Mieterhöhungen begründet werden (Mietspiegel des Ortes, eines vergleichbaren Ortes oder keiner). */
export function MietspiegelScreen({ route }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const only = route?.params?.propertyId as string | undefined;
  const props = [...db.properties].sort((a, b) => (a.id === only ? -1 : b.id === only ? 1 : a.name.localeCompare(b.name)));

  const set = (p: Property, patch: Partial<NonNullable<Property['rentBasis']>> & { kind?: Kind }) => {
    const cur = p.rentBasis ?? { kind: 'keiner' as Kind };
    save('properties', { ...p, rentBasis: { ...cur, ...patch } });
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Mietspiegel</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Lege je Haus fest, womit du Mieterhöhungen begründest. Die App schlägt dann die passende Begründung vor und weist auf abgelaufene Mietspiegel hin.</Text>
      <Note>Ob dein Ort einen Mietspiegel hat, kann die App nicht selbst prüfen. Frage bei der Stadt, beim Mieterverein oder bei Haus & Grund nach. Hat der Ort keinen, ist der Mietspiegel einer vergleichbaren Gemeinde zulässig (§ 558a Abs. 4 Satz 2 BGB), sonst brauchst du mindestens drei Vergleichswohnungen oder ein Gutachten.</Note>
      {props.length === 0 && <EmptyState icon="home-outline" title="Noch keine Häuser" text="Lege zuerst ein Haus an." />}
      {props.map((p) => {
        const b = p.rentBasis;
        const notes = basisNotes(p);
        return (
          <Section key={p.id} title={`${p.name}${p.city ? ' · ' + p.city : ''}`}>
            <View style={{ padding: 12, gap: 10 }}>
              <Segmented<Kind> value={(b?.kind ?? 'keiner') as Kind} onChange={(v) => set(p, { kind: v })} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ label: KIND_LABEL[k], value: k }))} />
              {!b && <Badge text="Noch nicht festgelegt" tone="warn" />}
            </View>
            {b && b.kind !== 'keiner' && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 4 }}>
                <Field label="Name des Mietspiegels" value={b.name ?? ''} onChangeText={(v) => set(p, { name: v })} placeholder="z. B. Mietspiegel Paderborn 2024" />
                {b.kind === 'andere' && <Field label="Vergleichbare Gemeinde" value={b.gemeinde ?? ''} onChangeText={(v) => set(p, { gemeinde: v })} placeholder="z. B. Paderborn" />}
                <DateField label="Stand" value={b.stand ?? ''} onChange={(v) => set(p, { stand: v })} optional />
                <DateField label="Gültig bis" value={b.validUntil ?? ''} onChange={(v) => set(p, { validUntil: v })} optional />
                <Text style={{ color: c.muted, fontSize: type.subhead, marginTop: 6 }}>Qualifizierter Mietspiegel (wissenschaftlich erstellt und anerkannt)</Text>
                <Segmented<string> value={b.qualified ? 'ja' : 'nein'} onChange={(v) => set(p, { qualified: v === 'ja' })} options={[{ label: 'Ja', value: 'ja' }, { label: 'Nein oder unbekannt', value: 'nein' }]} />
              </View>
            )}
            {notes.map((n, i) => <View key={i} style={{ paddingHorizontal: 12, paddingBottom: 12 }}><Note>{n}</Note></View>)}
          </Section>
        );
      })}
    </Screen>
  );
}
