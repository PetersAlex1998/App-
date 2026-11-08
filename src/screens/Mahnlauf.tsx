import { houseBank } from '../owners';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, uid } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, EmptyState, Gap, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { dunningPlans, makeReminder } from '../dunning';
import { exportPdf, reminderHtml } from '../pdf';
import { reminderModel } from '../letters';
import { storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { dateDE, eur, monthLabel, reminderLabel } from '../calc';
import { type } from '../theme';

export function Mahnlauf({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const plans = useMemo(() => dunningPlans(db, cfg), [db, cfg]);
  const due = plans.filter((p) => p.status === 'faellig');
  const [off, setOff] = useState<Record<string, boolean>>({}); // abgewählte Mieter
  const selected = due.filter((p) => !off[p.tenant.id]);
  const sum = selected.reduce((a, p) => a + p.open + p.fee, 0);
  const propOf = (p: (typeof plans)[number]) => db.properties.find((x) => x.id === p.unit.propertyId);
  const noBank = [...new Map(selected.map(propOf).filter((x): x is NonNullable<ReturnType<typeof propOf>> => !!x && !houseBank(x)).map((x) => [x.id, x])).values()];
  const missingSender = !cfg.name.trim() || noBank.length > 0;

  const run = () => {
    if (selected.length === 0) return;
    confirm(`${selected.length} Mahnung${selected.length === 1 ? '' : 'en'} erstellen?`, async () => {
      const reminders = selected.map((p) => makeReminder(uid(), p, cfg));
      if (filesSupported()) {
        try {
          const docs = await storeLetters(reminders.map((r, i) => ({ model: reminderModel(db, r, selected[i].tenant, selected[i].unit, selected[i].prop, cfg), tenant: selected[i].tenant, note: `Mahnung Stufe ${r.level}` })));
          replaceAll({ ...db, reminders: [...db.reminders, ...reminders], documents: [...db.documents, ...docs] });
          navigation.replace('Outbox');
        } catch (e: any) { notify(`PDF konnte nicht erstellt werden: ${e?.message ?? e}`); }
        return;
      }
      replaceAll({ ...db, reminders: [...db.reminders, ...reminders] });
      const html = reminders.map((r, i) => reminderHtml(db, r, selected[i].tenant, selected[i].unit, selected[i].prop, cfg)).join('');
      try { await exportPdf(html); } catch (e: any) { notify(String(e?.message ?? e)); }
      navigation.goBack();
    }, 'Erstellen', `Jeder Brief wird als PDF im Briefausgang abgelegt und die Mahnung beim Mieter vermerkt. Gesamtforderung: ${eur(sum)}.`);
  };

  const levelTone = (l: number) => (l === 1 ? 'warn' : 'danger') as 'warn' | 'danger';
  const row = (p: (typeof plans)[number], selectable: boolean) => {
    const on = selectable && !off[p.tenant.id];
    return (
      <View key={p.tenant.id} style={{ padding: 14, gap: 8, opacity: selectable ? 1 : 0.7 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          {selectable ? (
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`${p.tenant.name} mahnen`} accessibilityState={{ checked: on }} onPress={() => setOff({ ...off, [p.tenant.id]: on })} hitSlop={8} style={{ marginTop: 2 }}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? c.primary : c.muted} />
            </Pressable>
          ) : <Ionicons name={p.status === 'wartet' ? 'time-outline' : 'alert-circle-outline'} size={26} color={c.muted} style={{ marginTop: 2 }} />}
          <Pressable style={{ flex: 1, gap: 2 }} onPress={() => navigation.navigate('TenantDetail', { id: p.tenant.id })} accessibilityRole="button">
            <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{p.tenant.name}</Text>
            <Text style={{ fontSize: type.footnote, color: c.muted }}>{p.prop.name} · {p.unit.name}</Text>
            <Text style={{ fontSize: type.footnote, color: c.muted }}>{p.items.length} Monat{p.items.length === 1 ? '' : 'e'} offen seit {monthLabel(p.items[0].month)}</Text>
          </Pressable>
          <Text style={{ fontSize: type.body, fontWeight: '700', color: c.danger, fontVariant: ['tabular-nums'] }}>{eur(p.open)}</Text>
        </View>
        <View style={{ paddingLeft: 38 }}>
          {p.status === 'faellig' && <Badge text={`${reminderLabel(p.level)}${p.fee ? ` · + ${eur(p.fee)} Gebühr` : ''}`} tone={levelTone(p.level)} />}
          {p.status === 'wartet' && <Badge text={`Frist läuft bis ${dateDE(p.last!.deadline)}`} tone="neutral" />}
          {p.status === 'max' && <Badge text="Letzte Stufe erreicht – weitere Schritte prüfen" tone="danger" />}
        </View>
      </View>
    );
  };

  const wait = plans.filter((p) => p.status === 'wartet');
  const maxed = plans.filter((p) => p.status === 'max');

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Mahnlauf</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 18 }}>
        Überfällige Mieten aller Mieter. Die Miete des laufenden Monats zählt erst nach dem {cfg.rentDueDay + cfg.graceDays}. als überfällig.
      </Text>
      {missingSender && (
        <Section>
          <Pressable accessibilityRole="button" onPress={() => (cfg.name.trim() ? navigation.navigate('PropertyForm', { id: noBank[0].id }) : navigation.navigate('Briefe'))} style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="alert-circle" size={22} color={c.warn} />
            <Text style={{ flex: 1, color: c.text, fontSize: type.subhead }}>{cfg.name.trim() ? `Für ${noBank.map((x) => x.name).join(', ')} ist kein Bankkonto hinterlegt. Die Briefe haben sonst keine Bankverbindung. Jetzt ergänzen` : 'Der Absender fehlt. Jetzt ergänzen'}</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        </Section>
      )}
      {plans.length === 0 ? (
        <EmptyState icon="checkmark-circle" title="Keine überfälligen Mieten" text="Zurzeit gibt es nichts zu mahnen. Importiere den aktuellen Kontoauszug, damit die Eingänge berücksichtigt sind." actionLabel="Kontoauszug importieren" onAction={() => navigation.navigate('StatementImport')} />
      ) : (
        <>
          <Section title={`Jetzt mahnen (${due.length})`} footer={due.length ? 'Entfernte Häkchen werden nicht gemahnt. Antippen des Namens öffnet den Mieter.' : undefined}>
            {due.length === 0 ? <Note>Niemand ist aktuell mahnfähig.</Note> : due.map((p) => row(p, true))}
          </Section>
          {wait.length > 0 && <Section title={`Frist läuft (${wait.length})`}>{wait.map((p) => row(p, false))}</Section>}
          {maxed.length > 0 && <Section title={`Letzte Stufe erreicht (${maxed.length})`} footer="Hier kommen nur noch persönliche Gespräche, Ratenzahlung oder rechtliche Schritte infrage. Das entscheidest du, am besten mit Anwalt oder Verband.">{maxed.map((p) => row(p, false))}</Section>}
          {due.length > 0 && (
            <>
              <Button icon="document-text" title={selected.length ? `${selected.length} Mahnung${selected.length === 1 ? '' : 'en'} erstellen (${eur(sum)})` : 'Niemand ausgewählt'} onPress={run} disabled={selected.length === 0} />
              <Gap h={8} />
              <Button kind="plain" title="Regeln und Absender anpassen" onPress={() => navigation.navigate('Briefe')} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
