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

const LIMIT = 5;
const isActive = (t: { moveOut: string }) => !t.moveOut || t.moveOut >= today();

export function Dashboard({ navigation }: any) {
  const { db, saveError } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const activeTenants = db.tenants.filter(isActive);
  const rentRoll = activeTenants.reduce((s, t) => {
    const u = db.units.find((x) => x.id === t.unitId);
    return s + unitDue(u);
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
  const duePlans = dunningPlans(db, cfg).filter((p) => p.status === 'faellig');
  // Fristen: Energieausweis, Dokumente mit Ablaufdatum, befristete Mietverträge, Mietanpassungen
  type Due = { key: string; icon: any; tone: 'danger' | 'warn'; title: string; subtitle: string; go: () => void };
  const dues: Due[] = [];
  const propName = (id?: string) => db.properties.find((p) => p.id === id)?.name ?? '';
  db.properties.forEach((p) => {
    const hasDoc = db.documents.some((d) => d.ownerKind === 'property' && d.ownerId === p.id && d.category === 'energieausweis');
    const ex = expiryState(p.eaValidUntil);
    if (ex && ex.tone !== 'ok') dues.push({ key: 'ea' + p.id, icon: 'leaf', tone: ex.tone, title: `Energieausweis: ${p.name}`, subtitle: ex.text, go: () => navigation.navigate('PropertyDetail', { id: p.id }) });
    else if (!p.eaValidUntil && !hasDoc && !p.eaClass) dues.push({ key: 'eafehlt' + p.id, icon: 'leaf-outline', tone: 'warn', title: `Energieausweis fehlt: ${p.name}`, subtitle: 'Beim Vermieten und Verkaufen vorgeschrieben', go: () => navigation.navigate('PropertyDetail', { id: p.id }) });
  });
  db.documents.forEach((d) => {
    const ex = expiryState(d.validUntil);
    if (ex && ex.tone !== 'ok' && d.category !== 'energieausweis') dues.push({ key: 'doc' + d.id, icon: 'document-text', tone: ex.tone, title: `${d.name}`, subtitle: ex.text, go: () => navigation.navigate('DocumentViewer', { id: d.id }) });
  });
  activeTenants.forEach((t) => {
    if (t.contractEnd && daysUntil(t.contractEnd) <= 180) dues.push({ key: 'ce' + t.id, icon: 'calendar', tone: daysUntil(t.contractEnd) < 0 ? 'danger' : 'warn', title: `Befristung endet: ${t.name}`, subtitle: daysUntil(t.contractEnd) < 0 ? `Seit ${dateDE(t.contractEnd)} abgelaufen` : `Am ${dateDE(t.contractEnd)}`, go: () => navigation.navigate('TenantDetail', { id: t.id }) });
    if (t.nextAdjust && daysUntil(t.nextAdjust) <= 60) dues.push({ key: 'na' + t.id, icon: 'trending-up', tone: 'warn', title: `Mietanpassung: ${t.name}`, subtitle: `${t.rentAdjust ?? 'Anpassung'} am ${dateDE(t.nextAdjust)}`, go: () => navigation.navigate('TenantDetail', { id: t.id }) });
  });
  dueStatements(db).forEach((d) => {
    const left = daysUntil(d.deadline);
    dues.push({ key: 'nk' + d.prop.id, icon: 'calculator', tone: left <= 90 ? 'danger' : 'warn', title: `Nebenkosten ${d.year}: ${d.prop.name}`, subtitle: `${d.open} von ${d.total} Abrechnungen offen · Frist ${dateDE(d.deadline)}`, go: () => navigation.navigate('NkLauf', { propertyId: d.prop.id }) });
  });
  // Sicherung fällig?
  const lastBk = cfg.lastBackupAt ? Date.parse(cfg.lastBackupAt) : 0;
  const bkDays = lastBk ? Math.floor((Date.now() - lastBk) / 86400000) : null;
  if (cfg.backupRemindDays > 0 && db.properties.length > 0 && (bkDays === null || bkDays >= cfg.backupRemindDays)) {
    dues.unshift({ key: 'backup', icon: 'cloud-upload', tone: bkDays === null || bkDays >= cfg.backupRemindDays * 2 ? 'danger' : 'warn', title: 'Sicherung fällig', subtitle: bkDays === null ? 'Noch nie gesichert. Deine Daten liegen nur auf diesem Gerät.' : `Die letzte Sicherung ist ${bkDays} Tage alt.`, go: () => navigation.navigate('Daten') });
  }
  const todoCount = dues.length + arrears.length + vacant.length + depositMissing.length;

  // Erste Schritte
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
      <LargeHeader navTitle="Übersicht" title="Dein Bestand im Blick" action={{ label: 'Daten und Einstellungen', icon: 'settings-outline', onPress: () => navigation.navigate('Daten') }} subtitle={`${db.properties.length} Objekt${db.properties.length === 1 ? '' : 'e'} · ${db.units.length} Wohneinheit${db.units.length === 1 ? '' : 'en'}`} />

      {saveError && (
        <Section>
          <ListRow icon="warning" iconTone="danger" title="Speichern fehlgeschlagen" subtitle="Änderungen sind noch nicht gesichert. Ist der Speicher voll? Erstelle jetzt eine Sicherung." onPress={() => navigation.navigate('Daten')} />
        </Section>
      )}
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

      {db.documents.some((d) => d.category === 'brief' && (d.status ?? 'bereit') === 'bereit') && (
        <Section>
          <ListRow icon="mail" iconTone="warn" title={`Briefausgang (${db.documents.filter((d) => d.category === 'brief' && (d.status ?? 'bereit') === 'bereit').length})`} subtitle="Briefe sind bereit zum Versand" onPress={() => navigation.navigate('Outbox')} />
        </Section>
      )}

      {duePlans.length > 0 && (
        <Section>
          <ListRow icon="mail-unread" iconTone="danger" title={`Mahnlauf starten (${duePlans.length})`} subtitle={`${duePlans.length} Mieter mit überfälliger Miete · ${eur(duePlans.reduce((a, p) => a + p.open, 0))}`} onPress={() => navigation.navigate('Mahnlauf')} />
        </Section>
      )}

      <Section title={`Zu erledigen${todoCount ? ` (${todoCount})` : ''}`}>
        {todoCount === 0 && (
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge text="Alles erledigt" tone="ok" />
            <Text style={{ color: c.muted, fontSize: type.subhead, flex: 1 }}>Keine Rückstände, kein Leerstand.</Text>
          </View>
        )}
        {arrears.slice(0, LIMIT).map((t) => {
          const items = openItems(db, t);
          return (
            <ListRow key={'a' + t.id} icon="alert-circle" iconTone="danger" title={t.name}
              subtitle={`${items.length} Monat${items.length === 1 ? '' : 'e'} offen seit ${monthLabel(items[0].month)}`} right={eur(totalOpen(db, t))} rightColor={c.danger}
              onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
          );
        })}
        {vacant.slice(0, LIMIT).map((u) => (
          <ListRow key={'v' + u.id} icon="key-outline" iconTone="warn" title={`Leerstand: ${u.name}`} subtitle={db.properties.find((p) => p.id === u.propertyId)?.name}
            right={eur(unitDue(u))} rightSub="Soll / Monat" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />
        ))}
        {dues.slice(0, LIMIT).map((d) => (
          <ListRow key={d.key} icon={d.icon} iconTone={d.tone} title={d.title} subtitle={d.subtitle} onPress={d.go} />
        ))}
        {dues.length > LIMIT && <ListRow icon="list" title={`Weitere ${dues.length - LIMIT} Fristen`} onPress={() => navigation.navigate('Objekte')} />}
        {depositMissing.slice(0, LIMIT).map((t) => (
          <ListRow key={'d' + t.id} icon="shield-checkmark-outline" iconTone="warn" title={`Kaution offen: ${t.name}`} subtitle={`Vereinbart: ${eur(t.deposit)}`} onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
        ))}
        {arrears.length > LIMIT && <ListRow icon="list" title={`Alle ${arrears.length} Rückstände anzeigen`} onPress={() => navigation.navigate('Mieter')} />}
        {vacant.length > LIMIT && <ListRow icon="list" title={`Weitere ${vacant.length - LIMIT} Leerstände`} onPress={() => navigation.navigate('Objekte')} />}
        {depositMissing.length > LIMIT && <ListRow icon="list" title={`Weitere ${depositMissing.length - LIMIT} offene Kautionen`} onPress={() => navigation.navigate('Mieter')} />}
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
  const [shown, setShown] = useState(6);
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
          {groups.length > shown && <Button kind="secondary" title="Ältere Monate anzeigen" onPress={() => setShown(shown + 6)} />}
        </>
      )}
      <Gap h={4} />
    </Screen>
  );
}
