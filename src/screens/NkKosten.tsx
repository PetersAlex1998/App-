import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { Badge, Button, ChipField, EmptyState, FilterChips, Gap, Note, Screen, Section, Segmented, notify, useColors } from '../ui';
import { Chosen, CostSuggestion, applySuggestions, suggestCosts } from '../nkCosts';
import { eur } from '../calc';
import { meterTypeLabel } from '../meters';
import { type } from '../theme';
import { CostKey, MeterType } from '../types';

const METERS: MeterType[] = ['heizung', 'wasser_kalt', 'wasser_warm'];

/** Betriebskosten aus den Ausgaben übernehmen: Vorschläge prüfen, Verteilung wählen, in die Abrechnung übernehmen. */
export function NkKosten({ route, navigation }: any) {
  const { db, replaceAll } = useStore();
  const c = useColors();
  const [propertyId, setPropertyId] = useState<string>(route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [year, setYear] = useState<number>(Number(route.params?.year) || new Date().getFullYear() - 1);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [dist, setDist] = useState<Record<string, { key: CostKey; meterType?: MeterType; share?: number }>>({});
  const years = [0, 1, 2, 3].map((o) => new Date().getFullYear() - o);
  const list = useMemo(() => suggestCosts(db, propertyId, year), [db, propertyId, year]);
  const reset = () => { setOff({}); setDist({}); };

  // Standard: Vorschläge mit manueller Position gleicher Art sind abgewählt (nichts überschreiben ohne Absicht)
  const isOn = (s: CostSuggestion) => (s.id in off ? !off[s.id] : !(s.existing && !s.existing.fromExpenses));
  const get = (s: CostSuggestion) => dist[s.id] ?? { key: s.existing?.fromExpenses ? s.existing.key : s.key, meterType: s.existing?.fromExpenses ? s.existing.meterType : s.meterType, share: s.existing?.fromExpenses ? s.existing.consumptionShare ?? 100 : s.consumptionShare };
  const chosen = list.filter(isOn);
  const total = chosen.reduce((a, s) => a + s.amount, 0);
  const prop = db.properties.find((p) => p.id === propertyId);
  const unassigned = db.expenses.filter((e) => e.propertyId === propertyId && e.date.startsWith(`${year}-`) && !e.allocatable).length;

  const apply = () => {
    if (!chosen.length) return;
    const picks: Chosen[] = chosen.map((s) => { const d = get(s); return { s, key: d.key, meterType: d.meterType ?? 'heizung', consumptionShare: d.share }; });
    replaceAll(applySuggestions(db, propertyId, year, picks));
    notify(`${picks.length} Kostenposition${picks.length === 1 ? '' : 'en'} für ${year} übernommen (${eur(total)}).`);
    navigation.goBack();
  };

  if (!prop) return <Screen><EmptyState icon="business" title="Kein Objekt" text="Lege zuerst ein Objekt an." /></Screen>;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Kosten aus Ausgaben</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 16 }}>Ausgaben, die du als „umlagefähig“ markiert hast, werden zu Kostenpositionen der Nebenkostenabrechnung. Prüfe die Vorschläge und die Verteilung.</Text>
      {db.properties.length > 1 && <FilterChips value={propertyId} onChange={(v) => { setPropertyId(v); reset(); }} options={db.properties.map((p) => ({ label: p.name, value: p.id }))} />}
      <Segmented value={year} onChange={(v) => { setYear(v); reset(); }} options={years.map((y) => ({ label: String(y), value: y }))} />
      <Gap h={14} />

      {list.length === 0 ? (
        <EmptyState icon="receipt-outline" title={`Keine umlagefähigen Ausgaben ${year}`} text={unassigned ? `Es gibt ${unassigned} Ausgabe${unassigned === 1 ? '' : 'n'} in ${year}, die nicht als umlagefähig markiert ${unassigned === 1 ? 'ist' : 'sind'}. Öffne eine Ausgabe und setze „Auf Mieter umlagefähig“.` : 'Erfasse Rechnungen unter Ausgaben und markiere umlagefähige als „Auf Mieter umlagefähig“.'} actionLabel="Zu den Ausgaben" onAction={() => navigation.navigate('Ausgaben', { propertyId })} />
      ) : (
        <Section title={`Vorschläge (${list.length})`} footer="Antippen wählt ab oder an. Wasser und Heizung sind nach Verbrauch vorgeschlagen, alles andere nach Wohnfläche.">
          {list.map((s) => {
            const on = isOn(s);
            const d = get(s);
            return (
              <View key={s.id} style={{ padding: 14, gap: 10 }}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`${s.category} übernehmen`} accessibilityState={{ checked: on }} onPress={() => setOff({ ...off, [s.id]: on })} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? c.primary : c.muted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{s.category}</Text>
                    <Text style={{ fontSize: type.footnote, color: c.muted }}>{s.expenseIds.length} Beleg{s.expenseIds.length === 1 ? '' : 'e'}</Text>
                  </View>
                  <Text style={{ fontSize: type.body, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] }}>{eur(s.amount)}</Text>
                </Pressable>
                <View style={{ paddingLeft: 38, gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {s.existing ? <Badge text={s.existing.fromExpenses ? `Wird aktualisiert (bisher ${eur(s.existing.amount)})` : `Gibt es schon manuell (${eur(s.existing.amount)}) – wird ersetzt`} tone={s.existing.fromExpenses ? 'neutral' : 'warn'} /> : null}
                    {s.warning ? <Badge text={s.warning} tone="warn" /> : null}
                  </View>
                  {on && !(s.existing?.fromExpenses) && (
                    <>
                      <Segmented value={d.key} onChange={(k) => setDist({ ...dist, [s.id]: { ...d, key: k, meterType: d.meterType ?? 'heizung', share: d.share ?? (d.meterType === 'heizung' ? 70 : 100) } })} options={[{ label: 'Nach m²', value: 'area' as CostKey }, { label: 'Je Einheit', value: 'units' as CostKey }, { label: 'Verbrauch', value: 'consumption' as CostKey }]} />
                      {d.key === 'consumption' && (
                        <>
                          <ChipField label="Zähler" value={meterTypeLabel(d.meterType ?? 'heizung')} options={METERS.map(meterTypeLabel)} onChange={(v) => { const m = METERS.find((x) => meterTypeLabel(x) === v); if (m) setDist({ ...dist, [s.id]: { ...d, key: 'consumption', meterType: m, share: m === 'wasser_kalt' ? 100 : 70 } }); }} />
                          <Segmented value={d.share ?? 100} onChange={(v) => setDist({ ...dist, [s.id]: { ...d, key: 'consumption', share: v } })} options={[100, 70, 60, 50].map((v) => ({ label: `${v} %`, value: v }))} />
                          <Text style={{ color: c.muted, fontSize: type.footnote }}>Anteil nach Verbrauch. Der Rest wird nach Wohnfläche verteilt. Dafür brauchst du Zählerstände zum Jahresende.</Text>
                        </>
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </Section>
      )}

      {list.length > 0 && (
        <>
          <Text style={{ color: c.muted, fontSize: type.subhead, textAlign: 'center', marginBottom: 12 }}>{chosen.length} von {list.length} gewählt · {eur(total)}</Text>
          <Button icon="checkmark" title={chosen.length ? `${chosen.length} Position${chosen.length === 1 ? '' : 'en'} übernehmen` : 'Nichts gewählt'} onPress={apply} disabled={!chosen.length} />
          <Gap h={8} />
          <Note>Die Positionen erscheinen im Objekt unter Betriebskosten und fließen in den Nebenkosten-Lauf ein. Erneutes Übernehmen aktualisiert sie, ohne zu verdoppeln.</Note>
        </>
      )}
    </Screen>
  );
}
