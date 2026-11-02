import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, EmptyState, LargeHeader, ListRow, Screen, SearchBar, Section, Segmented, Stat, StatGrid, useColors, Button, Gap } from '../ui';
import { dateDE, eur, initials, monthLabel, monthLong, openItems, totalOpen, today } from '../calc';
import { type } from '../theme';

const isActive = (t: { moveOut: string }) => !t.moveOut || t.moveOut >= today();

export function Dashboard({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const activeTenants = db.tenants.filter(isActive);
  const rentRoll = activeTenants.reduce((s, t) => {
    const u = db.units.find((x) => x.id === t.unitId);
    return s + (u ? u.coldRent + u.advance : 0);
  }, 0);
  const open = db.tenants.reduce((s, t) => s + totalOpen(db, t), 0);
  const occupiedUnitIds = new Set(activeTenants.map((t) => t.unitId));
  const vacant = db.units.filter((u) => !occupiedUnitIds.has(u.id));
  const occupancy = db.units.length ? Math.round(((db.units.length - vacant.length) / db.units.length) * 100) : 0;
  const thisMonth = today().slice(0, 7);
  const received = db.payments.filter((p) => p.kind === 'miete' && p.date.startsWith(thisMonth)).reduce((s, p) => s + p.amount, 0);

  // To-do-Liste: was braucht jetzt Aufmerksamkeit?
  const arrears = activeTenants.filter((t) => openItems(db, t).length > 0);
  const depositMissing = activeTenants.filter((t) => t.deposit > 0 && db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((s, p) => s + p.amount, 0) < t.deposit);
  const todoCount = arrears.length + vacant.length + depositMissing.length;

  // Erste Schritte
  if (db.properties.length === 0) {
    return (
      <Screen tab>
        <LargeHeader title="Willkommen" subtitle="Deine Immobilien an einem Ort" />
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
      <LargeHeader title="Übersicht" subtitle={`${db.properties.length} Objekt${db.properties.length === 1 ? '' : 'e'} · ${db.units.length} Wohneinheit${db.units.length === 1 ? '' : 'en'}`} />

      <StatGrid>
        <Stat label="Offene Posten" value={eur(open)} tone={open > 0 ? 'danger' : 'ok'} icon="alert-circle-outline" />
        <Stat label="Soll-Miete / Monat" value={eur(rentRoll)} icon="cash-outline" />
        <Stat label={`Eingang ${monthLabel(thisMonth)}`} value={eur(received)} icon="arrow-down-circle-outline" />
        <Stat label="Auslastung" value={`${occupancy} %`} icon="home-outline" />
      </StatGrid>

      {firstOpen !== -1 && (
        <Section title="Erste Schritte" footer={`${steps.filter((s) => s.done).length} von ${steps.length} erledigt`}>
          {steps.map((s, i) => (
            <ListRow key={s.label} title={s.label} icon={s.done ? 'checkmark-circle' : 'ellipse-outline'} iconTone={s.done ? 'ok' : i === firstOpen ? 'primary' : 'neutral'}
              onPress={s.done || i !== firstOpen ? undefined : () => (i === 0 ? navigation.navigate('PropertyForm', {}) : i === 1 ? navigation.navigate('Objekte') : i === 2 ? navigation.navigate('TenantForm', {}) : navigation.navigate('PaymentForm', {}))} />
          ))}
        </Section>
      )}

      <Section title={`Zu erledigen${todoCount ? ` (${todoCount})` : ''}`}>
        {todoCount === 0 && (
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge text="Alles erledigt" tone="ok" />
            <Text style={{ color: c.muted, fontSize: type.subhead, flex: 1 }}>Keine Rückstände, kein Leerstand.</Text>
          </View>
        )}
        {arrears.map((t) => {
          const items = openItems(db, t);
          return (
            <ListRow key={'a' + t.id} icon="alert-circle" iconTone="danger" title={t.name}
              subtitle={`${items.length} Monat${items.length === 1 ? '' : 'e'} offen seit ${monthLabel(items[0].month)}`} right={eur(totalOpen(db, t))} rightColor={c.danger}
              onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
          );
        })}
        {vacant.map((u) => (
          <ListRow key={'v' + u.id} icon="key-outline" iconTone="warn" title={`Leerstand: ${u.name}`} subtitle={db.properties.find((p) => p.id === u.propertyId)?.name}
            right={eur(u.coldRent + u.advance)} rightSub="Soll / Monat" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />
        ))}
        {depositMissing.map((t) => (
          <ListRow key={'d' + t.id} icon="shield-checkmark-outline" iconTone="warn" title={`Kaution offen: ${t.name}`} subtitle={`Vereinbart: ${eur(t.deposit)}`} onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
        ))}
      </Section>

      <Section title="Schnellzugriff">
        <ListRow icon="add-circle-outline" title="Zahlung erfassen" onPress={() => navigation.navigate('PaymentForm', {})} />
        <ListRow icon="person-add-outline" title="Mieter hinzufügen" onPress={() => navigation.navigate('TenantForm', {})} />
        <ListRow icon="business-outline" title="Objekt hinzufügen" onPress={() => navigation.navigate('PropertyForm', {})} />
      </Section>
    </Screen>
  );
}

export function Properties({ navigation }: any) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const list = db.properties.filter((p) => `${p.name} ${p.street} ${p.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen tab>
      <LargeHeader title="Objekte" action={{ label: 'Objekt hinzufügen', onPress: () => navigation.navigate('PropertyForm', {}) }} />
      {db.properties.length === 0 ? (
        <EmptyState icon="business" title="Noch keine Objekte" text="Lege Häuser oder Anlagen an und verwalte darin Wohnungen und Betriebskosten." actionLabel="Objekt anlegen" onAction={() => navigation.navigate('PropertyForm', {})} />
      ) : (
        <>
          {db.properties.length > 4 && <SearchBar value={q} onChangeText={setQ} placeholder="Objekte suchen" />}
          <Section>
            {list.map((p) => {
              const units = db.units.filter((u) => u.propertyId === p.id);
              const vacant = units.filter((u) => !db.tenants.some((t) => t.unitId === u.id && isActive(t))).length;
              return (
                <ListRow key={p.id} icon="business" title={p.name} subtitle={`${p.street}, ${p.zip} ${p.city}`}
                  badge={units.length === 0 ? { text: 'Keine Wohnungen', tone: 'neutral' } : vacant > 0 ? { text: `${units.length} Einheiten · ${vacant} frei`, tone: 'warn' } : { text: `${units.length} Einheiten · voll vermietet`, tone: 'ok' }}
                  onPress={() => navigation.navigate('PropertyDetail', { id: p.id })} />
              );
            })}
          </Section>
        </>
      )}
    </Screen>
  );
}

type Filter = 'alle' | 'rueckstand' | 'ehemalig';

export function Tenants({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const list = useMemo(
    () =>
      db.tenants
        .filter((t) => (filter === 'ehemalig' ? !isActive(t) : isActive(t)))
        .filter((t) => (filter === 'rueckstand' ? totalOpen(db, t) > 0 : true))
        .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [db, q, filter],
  );
  return (
    <Screen tab>
      <LargeHeader title="Mieter" action={{ label: 'Mieter hinzufügen', onPress: () => navigation.navigate('TenantForm', {}) }} />
      {db.tenants.length === 0 ? (
        <EmptyState icon="people" title="Noch keine Mieter" text={db.units.length === 0 ? 'Lege zuerst ein Objekt mit einer Wohnung an. Dann kannst du Mieter zuordnen.' : 'Erfasse Mieter und ordne sie einer Wohnung zu.'} actionLabel={db.units.length === 0 ? 'Zu den Objekten' : 'Mieter anlegen'} onAction={() => (db.units.length === 0 ? navigation.navigate('Objekte') : navigation.navigate('TenantForm', {}))} />
      ) : (
        <>
          <SearchBar value={q} onChangeText={setQ} placeholder="Mieter suchen" />
          <Segmented value={filter} onChange={setFilter} options={[{ label: 'Aktuelle', value: 'alle' }, { label: 'Mit Rückstand', value: 'rueckstand' }, { label: 'Ehemalige', value: 'ehemalig' }]} />
          {list.length === 0 ? (
            <Text style={{ color: c.muted, textAlign: 'center', marginVertical: 32, fontSize: type.body }}>Keine Treffer.</Text>
          ) : (
            <Section>
              {list.map((t) => {
                const u = db.units.find((x) => x.id === t.unitId);
                const p = db.properties.find((x) => x.id === u?.propertyId);
                const o = totalOpen(db, t);
                return (
                  <ListRow key={t.id} avatar={initials(t.name)} title={t.name} subtitle={`${p?.name ?? ''} · ${u?.name ?? '–'}`}
                    badge={o > 0 ? { text: `${eur(o)} offen`, tone: 'danger' } : { text: 'Ausgeglichen', tone: 'ok' }}
                    onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
                );
              })}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}

export function Payments({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const groups = useMemo(() => {
    const sorted = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, typeof sorted>();
    sorted.forEach((p) => map.set(p.date.slice(0, 7), [...(map.get(p.date.slice(0, 7)) ?? []), p]));
    return [...map.entries()];
  }, [db.payments]);
  const kindLabel = { miete: 'Miete', kaution: 'Kaution', nachzahlung: 'NK-Nachzahlung' } as const;
  return (
    <Screen tab>
      <LargeHeader title="Zahlungen" action={{ label: 'Zahlung erfassen', onPress: () => navigation.navigate('PaymentForm', {}) }} />
      {groups.length === 0 ? (
        <EmptyState icon="card" title="Noch keine Zahlungen" text="Erfasse eingehende Mieten, Kautionen und Nachzahlungen. Offene Posten berechnet die App automatisch." actionLabel={db.tenants.length ? 'Zahlung erfassen' : undefined} onAction={() => navigation.navigate('PaymentForm', {})} />
      ) : (
        groups.map(([month, list]) => (
          <View key={month}>
            <Section title={`${monthLong(month)} · ${eur(list.reduce((s, p) => s + p.amount, 0))}`}>
              {list.map((p) => (
                <ListRow key={p.id} icon="arrow-down" iconTone="ok" title={db.tenants.find((t) => t.id === p.tenantId)?.name ?? 'Unbekannt'}
                  subtitle={`${kindLabel[p.kind]}${p.kind === 'miete' ? ` ${monthLabel(p.month)}` : ''} · ${dateDE(p.date)}`}
                  right={`+ ${eur(p.amount)}`} rightColor={c.ok} onPress={() => navigation.navigate('PaymentForm', { id: p.id })} />
              ))}
            </Section>
          </View>
        ))
      )}
      <Gap h={4} />
    </Screen>
  );
}
