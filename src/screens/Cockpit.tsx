import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { useOnline } from '../pwa';
import { Badge, Button, EmptyState, Gap, LargeHeader, ListRow, Screen, Section, Stat, StatGrid, useColors } from '../ui';
import { dateDE, eur, initials, monthLabel, monthLong, openItems, today } from '../calc';
import { type } from '../theme';
import { actions, cockpit, deadlines } from '../cockpit';

const LIMIT = 5;
const shadow = { shadowColor: '#1B1D22', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 } as const;
const short = (m: string) => monthLabel(m).split(' ')[0];

/** Fortschrittsbalken (0–100 %). */
function Progress({ value, tone }: { value: number; tone: 'ok' | 'warn' | 'danger' | 'primary' }) {
  const c = useColors();
  const color = tone === 'ok' ? c.ok : tone === 'warn' ? c.warn : tone === 'danger' ? c.danger : c.primary;
  return (
    <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: c.fill, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

/** Soll gegen Ist der letzten Monate: heller Balken = Soll, farbiger Balken = eingegangen. */
function MonthBars({ months }: { months: { month: string; soll: number; ist: number }[] }) {
  const c = useColors();
  const max = Math.max(1, ...months.map((m) => Math.max(m.soll, m.ist)));
  const H = 96;
  const summary = months.map((m) => `${monthLabel(m.month)}: ${eur(m.ist)} von ${eur(m.soll)}`).join('. ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Mieteingang der letzten Monate. ${summary}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
      {months.map((m, i) => {
        const full = m.soll > 0 && m.ist >= m.soll;
        const last = i === months.length - 1;
        return (
          <View key={m.month} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ height: H, width: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: Math.max(3, (m.soll / max) * H), borderRadius: 8, backgroundColor: c.fill, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ height: m.soll > 0 ? `${Math.min(100, (m.ist / m.soll) * 100)}%` : 0, backgroundColor: full ? c.ok : last ? c.primary : c.warn, borderRadius: 8 }} />
              </View>
            </View>
            <Text style={{ fontSize: type.caption, color: last ? c.text : c.muted, fontWeight: last ? '700' : '500' }}>{short(m.month)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Große Karte: Mieteingang des laufenden Monats. */
function Hero({ month, soll, ist, rate }: { month: string; soll: number; ist: number; rate: number | null }) {
  const c = useColors();
  const open = Math.max(0, soll - ist);
  const tone = rate === null ? 'primary' : rate >= 95 ? 'ok' : rate >= 60 ? 'primary' : 'warn';
  return (
    <View accessible accessibilityLabel={`Mieteingang ${monthLong(month)}: ${eur(ist)} von ${eur(soll)}${rate !== null ? `, ${rate} Prozent` : ''}`}
      style={{ backgroundColor: c.card, borderRadius: 26, padding: 18, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14, ...shadow }}>
      <Text style={{ color: c.muted, fontSize: type.subhead, fontWeight: '600' }}>Mieteingang {monthLong(month)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <Text style={{ color: c.text, fontSize: 36, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{eur(ist)}</Text>
        <Text style={{ color: c.muted, fontSize: type.body, fontVariant: ['tabular-nums'] }}>von {eur(soll)}</Text>
      </View>
      <View style={{ marginTop: 12 }}><Progress value={rate ?? 0} tone={tone} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ color: c.text, fontSize: type.subhead, fontWeight: '700' }}>{rate === null ? 'Noch keine Miete fällig' : `${rate} % eingegangen`}</Text>
        <Text style={{ color: open > 0 ? c.warn : c.ok, fontSize: type.subhead, fontWeight: '600' }}>{open > 0 ? `${eur(open)} noch offen` : 'Vollständig'}</Text>
      </View>
    </View>
  );
}

/** Zeile je Haus: Auslastung als Balken, offene Posten daneben. */
function HouseRow({ h, onPress }: { h: { name: string; units: number; vacant: number; occupancy: number; soll: number; open: number }; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${h.name}: ${h.occupancy} Prozent vermietet, ${h.vacant} frei, offene Posten ${eur(h.open)}`} onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: type.body, fontWeight: '600', flex: 1 }}>{h.name}</Text>
        <Text style={{ color: h.open > 0 ? c.danger : c.muted, fontSize: type.subhead, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{h.open > 0 ? `${eur(h.open)} offen` : eur(h.soll)}</Text>
      </View>
      <Progress value={h.occupancy} tone={h.occupancy >= 95 ? 'ok' : h.occupancy >= 80 ? 'primary' : 'warn'} />
      <Text style={{ color: c.muted, fontSize: type.footnote }}>{h.occupancy} % vermietet · {h.units} {h.units === 1 ? 'Einheit' : 'Einheiten'}{h.vacant ? ` · ${h.vacant} frei` : ''}</Text>
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ flex: 1, minWidth: 76, minHeight: 78, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.glassBorder, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, ...shadow }}>
      <Ionicons name={icon} size={24} color={c.primary} />
      <Text numberOfLines={2} style={{ color: c.text, fontSize: type.caption, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function Cockpit({ navigation }: any) {
  const { db, saveError } = useStore();
  const online = useOnline();
  const { s: cfg } = useSettings();
  const c = useColors();
  const now = today();
  const k = React.useMemo(() => cockpit(db, now), [db, now]);
  const todo = React.useMemo(() => actions(db, cfg, now), [db, cfg, now]);
  const dl = React.useMemo(() => deadlines(db, now), [db, now]);
  const year = now.slice(0, 4);

  if (db.properties.length === 0) {
    return (
      <Screen tab>
        <LargeHeader navTitle="Übersicht" title="Willkommen" subtitle="Deine Immobilien an einem Ort" />
        <EmptyState icon="business" title="Legen wir los" text="Lege dein erstes Objekt an – danach Wohnungen und Mieter. Das dauert wenige Minuten." actionLabel="Erstes Objekt anlegen" onAction={() => navigation.navigate('PropertyForm', {})} />
        <Button kind="plain" title="Mit Beispieldaten ausprobieren" onPress={() => navigation.navigate('Daten')} />
      </Screen>
    );
  }
  const steps = [
    { done: db.properties.length > 0, label: 'Objekt anlegen' },
    { done: db.units.length > 0, label: 'Wohnung hinzufügen' },
    { done: db.tenants.length > 0, label: 'Mieter erfassen' },
    { done: db.payments.length > 0, label: 'Erste Zahlung buchen' },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);

  return (
    <Screen tab>
      <LargeHeader navTitle="Übersicht" title="Dein Bestand im Blick" action={{ label: 'Daten und Einstellungen', icon: 'settings-outline', onPress: () => navigation.navigate('Daten') }}
        subtitle={`${db.properties.length} Objekt${db.properties.length === 1 ? '' : 'e'} · ${db.units.length} Einheiten · ${k.activeTenants} Mieter`} />

      {!online && <Section><ListRow icon="cloud-offline" iconTone="warn" title="Du bist offline" subtitle="Alles funktioniert weiter. Deine Änderungen liegen sicher auf diesem Gerät." /></Section>}
      {saveError && <Section><ListRow icon="warning" iconTone="danger" title="Speichern fehlgeschlagen" subtitle="Änderungen sind noch nicht gesichert. Ist der Speicher voll? Erstelle jetzt eine Sicherung." onPress={() => navigation.navigate('Daten')} /></Section>}

      <Hero month={k.month} soll={k.sollMonth} ist={k.istMonth} rate={k.rate} />

      <StatGrid>
        <Stat label="Offene Posten" value={eur(k.openTotal)} tone={k.openTotal > 0 ? 'danger' : 'ok'} icon="alert-circle-outline" />
        <Stat label="Soll-Miete / Monat" value={eur(k.rentRoll)} icon="cash-outline" />
        <Stat label="Auslastung" value={`${k.occupancy} %`} icon="home-outline" />
        <Stat label="Leerstand / Monat" value={k.vacantLoss > 0 ? `− ${eur(k.vacantLoss)}` : eur(0)} tone={k.vacantLoss > 0 ? 'danger' : 'ok'} icon="key-outline" />
      </StatGrid>

      <Section title={todo.length ? `Jetzt wichtig (${todo.length})` : 'Jetzt wichtig'}>
        {todo.length === 0 && (
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge text="Alles erledigt" tone="ok" />
            <Text style={{ color: c.muted, fontSize: type.subhead, flex: 1 }}>Keine fälligen Aufgaben.</Text>
          </View>
        )}
        {todo.slice(0, LIMIT).map((a) => (
          <ListRow key={a.key} icon={a.icon as 'leaf'} iconTone={a.tone === 'neutral' ? undefined : a.tone} title={a.title} subtitle={a.subtitle} onPress={() => navigation.navigate(a.screen, a.params)} />
        ))}
        {todo.length > LIMIT && <ListRow icon="list" title="Alle Aufgaben ansehen" subtitle={`${todo.length - LIMIT} weitere`} onPress={() => navigation.navigate('Aufgaben')} />}
      </Section>

      <Section title="Mieteingang der letzten Monate" footer="Heller Balken: Soll. Farbig: eingegangen.">
        <MonthBars months={k.months} />
      </Section>

      <Section title={`Ergebnis ${year}`} action={{ label: 'Auswertung', onPress: () => navigation.navigate('AnlageV', { year }) }}>
        <ListRow icon="arrow-down-circle-outline" iconTone="ok" title="Einnahmen" right={eur(k.ytd.income)} chevron={false} />
        <ListRow icon="arrow-up-circle-outline" title="Ausgaben" right={eur(k.ytd.expenses)} chevron={false} />
        <ListRow icon="analytics-outline" iconTone={k.ytd.surplus < 0 ? 'danger' : 'ok'} title={k.ytd.surplus < 0 ? 'Verlust bisher' : 'Überschuss bisher'} right={eur(k.ytd.surplus)} rightColor={k.ytd.surplus < 0 ? c.danger : c.ok} chevron={false} />
      </Section>

      {k.houses.length > 1 && (
        <Section title="Objekte im Vergleich">
          {k.houses.map((h) => <HouseRow key={h.id} h={h} onPress={() => navigation.navigate('PropertyDetail', { id: h.id })} />)}
        </Section>
      )}

      {k.arrears.length > 0 && (
        <Section title={`Rückstände (${k.arrears.length})`}>
          {k.arrears.slice(0, LIMIT).map(({ tenant: t, open }) => {
            const items = openItems(db, t);
            return <ListRow key={t.id} avatar={initials(t.name)} title={t.name} subtitle={`${items.length} Monat${items.length === 1 ? '' : 'e'} offen seit ${monthLabel(items[0].month)}`} right={eur(open)} rightColor={c.danger} onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />;
          })}
          {k.arrears.length > LIMIT && <ListRow icon="list" title={`Alle ${k.arrears.length} Rückstände anzeigen`} onPress={() => navigation.navigate('Mieter')} />}
        </Section>
      )}

      {k.vacantUnits.length > 0 && (
        <Section title={`Leerstand (${k.vacantUnits.length})`}>
          {k.vacantUnits.slice(0, LIMIT).map((u) => (
            <ListRow key={u.id} icon="key-outline" iconTone="warn" title={u.name} subtitle={db.properties.find((p) => p.id === u.propertyId)?.name}
              right={eur(u.coldRent + u.advance)} rightSub="Soll / Monat" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />
          ))}
          {k.vacantUnits.length > LIMIT && <ListRow icon="list" title={`Weitere ${k.vacantUnits.length - LIMIT} Leerstände`} onPress={() => navigation.navigate('Objekte')} />}
        </Section>
      )}

      {dl.length > 0 && (
        <Section title={`Fristen (${dl.length})`} footer="Termine der nächsten Monate und Überfälliges.">
          {dl.slice(0, LIMIT).map((d) => <ListRow key={d.key} icon={d.icon as 'leaf'} iconTone={d.tone} title={d.title} subtitle={`${d.subtitle} · ${dateDE(d.date)}`} onPress={() => navigation.navigate(d.screen, d.params)} />)}
          {dl.length > LIMIT && <ListRow icon="list" title={`Weitere ${dl.length - LIMIT} Fristen`} onPress={() => navigation.navigate('Objekte')} />}
        </Section>
      )}

      {firstOpen !== -1 && (
        <Section title="Erste Schritte" footer={`${steps.filter((s) => s.done).length} von ${steps.length} erledigt`}>
          {steps.map((s, i) => (
            <ListRow key={s.label} title={s.label} icon={s.done ? 'checkmark-circle' : 'ellipse-outline'} iconTone={s.done ? 'ok' : i === firstOpen ? 'primary' : 'neutral'}
              onPress={s.done || i !== firstOpen ? undefined : () => (i === 0 ? navigation.navigate('PropertyForm', {}) : i === 1 ? navigation.navigate('Objekte') : i === 2 ? navigation.navigate('TenantForm', {}) : navigation.navigate('PaymentForm', {}))} />
          ))}
        </Section>
      )}

      <Text accessibilityRole="header" style={{ fontSize: type.footnote, fontWeight: '600', color: c.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 }}>Schnellzugriff</Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        <QuickAction icon="add-circle-outline" label="Zahlung" onPress={() => navigation.navigate('PaymentForm', {})} />
        <QuickAction icon="camera-outline" label="Beleg" onPress={() => navigation.navigate('ExpenseForm', { propertyId: db.properties[0]?.id })} />
        <QuickAction icon="speedometer-outline" label="Zähler" onPress={() => navigation.navigate('Ablesung', { propertyId: db.properties[0]?.id })} />
        <QuickAction icon="person-add-outline" label="Mieter" onPress={() => navigation.navigate('TenantForm', {})} />
      </View>
      <Gap h={4} />
    </Screen>
  );
}
