import { counts } from '../checks';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, EmptyState, LargeHeader, ListRow, Screen, SearchBar, Section, Segmented, Stat, StatGrid, useColors, Button, Gap, FilterChips } from '../ui';
import { dateDE, eur, initials, monthLabel, monthLong, openItems, totalOpen, today, unitDue, kindOf, kindLabel } from '../calc';
import { type } from '../theme';
import { useSettings } from '../settings';
import { houseId, unitRef } from '../ids';
import { CoverThumb } from './Documents';
import { sourceLabel, sourceOf, sourceTone } from '../payments';
import { dunningPlans } from '../dunning';
import { daysUntil, expiryState } from '../docs';
import { dueStatements } from '../nk';
import { useOnline } from '../pwa';
import { computeTasks } from '../tasks';
import { MODULES, MODULE_GROUPS } from '../modules';

const LIMIT = 5;
const isActive = (t: { moveOut: string }) => !t.moveOut || t.moveOut >= today();

export function Properties({ navigation }: any) {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const list = db.properties.filter((p) => `${p.name} ${p.street} ${p.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen tab>
      <LargeHeader navTitle="Objekte" title="Deine Immobilien" action={{ label: 'Objekt hinzufügen', onPress: () => navigation.navigate('PropertyForm', {}) }} />
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
                <ListRow key={p.id} leading={<CoverThumb docId={p.coverId} />} title={p.name}
                  badge={units.length === 0 ? { text: 'Keine Einheiten', tone: 'neutral' } : vacant > 0 ? { text: `${units.length} ${units.length === 1 ? 'Einheit' : 'Einheiten'} · ${vacant} frei`, tone: 'warn' } : { text: `${units.length} ${units.length === 1 ? 'Einheit' : 'Einheiten'} · voll vermietet`, tone: 'ok' }}
                  subtitle={`${houseId(p) ? houseId(p) + ' · ' : ''}${p.street}, ${p.zip} ${p.city}${units.some((u) => kindOf(u) === 'gewerbe') ? ` · ${units.filter((u) => kindOf(u) === 'gewerbe').length} Gewerbe` : ''}`}
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
  const [house, setHouse] = useState('all');
  const [kind, setKind] = useState<'all' | 'wohnung' | 'gewerbe'>('all');
  const list = useMemo(
    () =>
      db.tenants
        .filter((t) => (filter === 'ehemalig' ? !isActive(t) : isActive(t)))
        .filter((t) => (filter === 'rueckstand' ? totalOpen(db, t) > 0 : true))
        .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
        .filter((t) => {
          const u = db.units.find((x) => x.id === t.unitId);
          return (house === 'all' || u?.propertyId === house) && (kind === 'all' || (kind === 'gewerbe' ? kindOf(u) === 'gewerbe' : kindOf(u) !== 'gewerbe'));
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [db, q, filter, house, kind],
  );
  return (
    <Screen tab>
      <LargeHeader navTitle="Mieter" title="Deine Mieter" action={{ label: 'Mieter hinzufügen', onPress: () => navigation.navigate('TenantForm', {}) }} />
      {db.tenants.length === 0 ? (
        <EmptyState icon="people" title="Noch keine Mieter" text={db.units.length === 0 ? 'Lege zuerst ein Objekt mit einer Wohnung an. Dann kannst du Mieter zuordnen.' : 'Erfasse Mieter und ordne sie einer Wohnung zu.'} actionLabel={db.units.length === 0 ? 'Zu den Objekten' : 'Mieter anlegen'} onAction={() => (db.units.length === 0 ? navigation.navigate('Objekte') : navigation.navigate('TenantForm', {}))} />
      ) : (
        <>
          <SearchBar value={q} onChangeText={setQ} placeholder="Mieter suchen" />
          {db.properties.length > 1 && <FilterChips value={house} onChange={setHouse} options={[{ label: 'Alle Häuser', value: 'all' }, ...db.properties.map((p) => ({ label: p.name, value: p.id }))]} />}
          {db.units.some((u) => kindOf(u) === 'gewerbe') && <FilterChips value={kind} onChange={setKind} options={[{ label: 'Alle Arten', value: 'all' }, { label: 'Wohnungen', value: 'wohnung' }, { label: 'Gewerbe', value: 'gewerbe' }]} />}
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
                  <ListRow key={t.id} avatar={initials(t.name)} title={t.name} subtitle={`${unitRef(p, u) ? unitRef(p, u) + ' · ' : ''}${p?.name ?? ''} · ${u?.name ?? '–'}`}
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
  const [shown, setShown] = useState(4);
  const [src, setSrc] = useState<'alle' | 'manuell' | 'import'>('alle');
  const c = useColors();
  const groups = useMemo(() => {
    const sorted = db.payments.filter((p) => src === 'alle' || sourceOf(p) === src).sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, typeof sorted>();
    sorted.forEach((p) => map.set(p.date.slice(0, 7), [...(map.get(p.date.slice(0, 7)) ?? []), p]));
    return [...map.entries()];
  }, [db.payments, src]);
  const kindLabel2 = { miete: 'Miete', kaution: 'Kaution', nachzahlung: 'NK-Nachzahlung' } as const;
  return (
    <Screen tab>
      <LargeHeader navTitle="Zahlungen" title="Geldeingänge" action={{ label: 'Zahlung erfassen', onPress: () => navigation.navigate('PaymentForm', {}) }} />
      {db.tenants.length > 0 && (
        <Section>
          <ListRow icon="swap-vertical-outline" title="Kontoauszug importieren" subtitle="CSV hochladen, Eingänge automatisch zuordnen" onPress={() => navigation.navigate('StatementImport')} />
        </Section>
      )}
      {db.payments.length > 0 && <Segmented value={src} onChange={setSrc} options={[{ label: 'Alle', value: 'alle' }, { label: 'Manuell', value: 'manuell' }, { label: 'Kontoauszug', value: 'import' }]} />}
      {groups.length === 0 ? (
        <EmptyState icon="card" title={db.payments.length ? 'Keine Zahlungen in dieser Ansicht' : 'Noch keine Zahlungen'} text="Erfasse eingehende Mieten, Kautionen und Nachzahlungen oder importiere deinen Kontoauszug. Offene Posten berechnet die App automatisch." actionLabel={db.tenants.length ? 'Zahlung erfassen' : undefined} onAction={() => navigation.navigate('PaymentForm', {})} />
      ) : (
        <>
          {groups.slice(0, shown).map(([month, list]) => (
            <View key={month}>
              <Section title={`${monthLong(month)} · ${eur(list.reduce((s, p) => s + p.amount, 0))}`}>
                {list.map((p) => (
                  <ListRow key={p.id} icon="arrow-down" iconTone="ok" title={db.tenants.find((t) => t.id === p.tenantId)?.name ?? 'Unbekannt'}
                    subtitle={`${kindLabel2[p.kind]}${p.kind === 'miete' ? ` ${monthLabel(p.month)}` : ''} · ${dateDE(p.date)}`}
                    right={`+ ${eur(p.amount)}`} rightColor={c.ok} badge={{ text: sourceLabel(p) + (p.editedAt ? ' · geändert' : ''), tone: sourceTone(p) }} onPress={() => navigation.navigate('PaymentForm', { id: p.id })} />
                ))}
              </Section>
            </View>
          ))}
          {groups.length > shown && <Button kind="secondary" title="Ältere Monate anzeigen" onPress={() => setShown(shown + 4)} />}
        </>
      )}
      <Gap h={4} />
    </Screen>
  );
}

/** „Alle Module“: Übersicht aller Funktionen der App. Neue Funktionen kommen über src/modules.ts hierher. */
export function Modules({ navigation }: any) {
  const { db } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const tasks = computeTasks(db, { dismissed: cfg.dismissedTasks }).length;
  return (
    <Screen tab>
      <LargeHeader navTitle="Module" title="Alle Module" subtitle="Alle Funktionen an einem Ort" />
      {MODULE_GROUPS.map((g) => (
        <Section key={g} title={g}>
          {MODULES.filter((m) => m.group === g).map((m) => (
            <ListRow key={m.id} icon={m.icon as 'leaf'} title={m.title} subtitle={m.subtitle}
              badge={m.badge === 'aufgaben' && tasks > 0 ? { text: String(tasks), tone: 'warn' } : m.badge === 'schaeden' && db.issues.some((i) => i.status !== 'erledigt') ? { text: `${db.issues.filter((i) => i.status !== 'erledigt').length} offen`, tone: 'warn' } : m.badge === 'wartung' && counts(db).overdue > 0 ? { text: `${counts(db).overdue} überfällig`, tone: 'danger' } : undefined}
              onPress={() => navigation.navigate(m.screen)} />
          ))}
        </Section>
      ))}
    </Screen>
  );
}
