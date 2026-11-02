import React, { useState } from 'react';
import { Text } from 'react-native';
import { useStore } from '../store';
import { ListRow, Screen, SearchBar, Section, useColors } from '../ui';
import { eur, initials } from '../calc';
import { type } from '../theme';

export function SearchScreen({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const has = (...v: string[]) => v.join(' ').toLowerCase().includes(n);
  const props = n ? db.properties.filter((p) => has(p.name, p.street, p.city, p.zip)) : [];
  const units = n ? db.units.filter((u) => has(u.name)) : [];
  const tenants = n ? db.tenants.filter((t) => has(t.name, t.email, t.phone)) : [];
  const none = n && !props.length && !units.length && !tenants.length;
  return (
    <Screen>
      <SearchBar value={q} onChangeText={setQ} placeholder="Objekte, Wohnungen, Mieter suchen" autoFocus />
      {!n && <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40, fontSize: type.body }}>Suche nach Name, Straße, Ort oder Wohnung.</Text>}
      {none ? <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40, fontSize: type.body }}>Keine Treffer für „{q}“.</Text> : null}
      {props.length > 0 && (
        <Section title="Objekte">
          {props.map((p) => <ListRow key={p.id} icon="business" title={p.name} subtitle={`${p.street}, ${p.zip} ${p.city}`} onPress={() => navigation.navigate('PropertyDetail', { id: p.id })} />)}
        </Section>
      )}
      {units.length > 0 && (
        <Section title="Wohnungen">
          {units.map((u) => <ListRow key={u.id} icon="home" title={u.name} subtitle={db.properties.find((p) => p.id === u.propertyId)?.name} right={eur(u.coldRent + u.advance)} onPress={() => navigation.navigate('UnitForm', { id: u.id })} />)}
        </Section>
      )}
      {tenants.length > 0 && (
        <Section title="Mieter">
          {tenants.map((t) => <ListRow key={t.id} avatar={initials(t.name)} title={t.name} subtitle={db.units.find((u) => u.id === t.unitId)?.name} onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />)}
        </Section>
      )}
    </Screen>
  );
}
