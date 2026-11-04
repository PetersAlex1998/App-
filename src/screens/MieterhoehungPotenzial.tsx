import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { EmptyState, ListRow, Note, Screen, Section, Segmented, useColors } from '../ui';
import { eur } from '../calc';
import { potential } from '../rentBasis';
import { type } from '../theme';

/** Wo ist eine Mieterhöhung möglich? Größter Gewinn zuerst, mit Kappung und Sperrfrist. */
export function MieterhoehungPotenzial({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [house, setHouse] = useState('alle');
  const all = useMemo(() => potential(db), [db]);
  const list = all.filter((x) => house === 'alle' || x.unit.propertyId === house);
  const ready = list.filter((x) => !x.blocked);
  const year = Math.round(ready.reduce((a, x) => a + x.gainMonth, 0) * 12 * 100) / 100;
  const houses = db.properties.filter((p) => all.some((x) => x.unit.propertyId === p.id));

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Mieterhöhungs-Potenzial</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Wohnungen, deren Miete unter dem Mietspiegel oder unter vergleichbaren Wohnungen liegt. Die Erhöhung ist bereits auf Kappungsgrenze und Sperrfrist begrenzt.</Text>
      {houses.length > 1 && <View style={{ marginBottom: 14 }}><Segmented<string> value={house} onChange={setHouse} options={[{ label: 'Alle', value: 'alle' }, ...houses.map((p) => ({ label: p.name, value: p.id }))]} /></View>}
      {ready.length > 0 && (
        <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18 }}>
          <Text style={{ color: c.muted, fontSize: type.subhead }}>Mögliches Plus pro Jahr</Text>
          <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{eur(year)}</Text>
          <Text style={{ color: c.muted, fontSize: type.subhead }}>bei {ready.length} Wohnung{ready.length === 1 ? '' : 'en'} sofort möglich</Text>
        </View>
      )}
      {list.length === 0 ? (
        <EmptyState icon="trending-up" title="Kein Potenzial gefunden" text="Hinterlege Mietspiegelwerte in den Wohnungen oder lege Wohnungen mit Flächen und Mietern an. Für Vergleichswohnungen braucht es mindestens drei passende Wohnungen im gleichen Ort." />
      ) : (
        <Section title="Nach Gewinn">
          {list.map((x) => (
            <ListRow
              key={x.unit.id}
              icon="trending-up"
              title={`${x.prop?.name ?? ''} · ${x.unit.name}`}
              subtitle={x.blocked ?? `${x.tenant.name} · jetzt ${eur(x.current)} (${x.perSqm.toFixed(2).replace('.', ',')} €/m²) → ${eur(x.target)}`}
              right={`+${eur(x.gainMonth)}`}
              rightSub={x.basis === 'mietspiegel' ? 'Mietspiegel' : `${x.count ?? 3} Vergleichswohnungen`}
              badge={x.blocked ? { text: "Gesperrt", tone: "warn" } : undefined}
              onPress={() => navigation.navigate('Mieterhoehung', { unitId: x.unit.id })}
            />
          ))}
        </Section>
      )}
      <Note>Das ist eine Orientierung, keine Rechtsberatung. Vor dem Versand wird die Erhöhung im Schreiben noch einmal geprüft.</Note>
    </Screen>
  );
}
