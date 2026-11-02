import React from 'react';
import { View, Text } from 'react-native';
import { useStore } from '../store';
import { Btn, Card, Empty, Body, Muted, Row, Screen, Title, useColors } from '../ui';
import { dateDE, eur, openItems, totalOpen } from '../calc';

export function Dashboard({ navigation }: any) {
  const colors = useColors();
  const { db } = useStore();
  const rentRoll = db.tenants.filter((t) => !t.moveOut || t.moveOut >= new Date().toISOString().slice(0, 10)).reduce((s, t) => {
    const u = db.units.find((x) => x.id === t.unitId);
    return s + (u ? u.coldRent + u.advance : 0);
  }, 0);
  const open = db.tenants.reduce((s, t) => s + totalOpen(db, t), 0);
  const arrears = db.tenants.filter((t) => openItems(db, t).length > 0);
  const vacant = db.units.filter((u) => !db.tenants.some((t) => t.unitId === u.id && !t.moveOut)).length;
  return (
    <Screen>
      <Card>
        <Row left="Objekte" right={String(db.properties.length)} />
        <Row left="Wohneinheiten" right={`${db.units.length} (${vacant} frei)`} />
        <Row left="Mieter" right={String(db.tenants.length)} />
        <Row left="Soll-Miete / Monat" right={eur(rentRoll)} bold />
        <Row left="Offene Posten" right={eur(open)} bold color={open > 0 ? colors.danger : colors.ok} />
      </Card>
      <Title>Rückstände</Title>
      {arrears.length === 0 && <Empty text="Keine offenen Mieten 🎉" />}
      {arrears.map((t) => (
        <Card key={t.id} onPress={() => navigation.navigate('TenantDetail', { id: t.id })}>
          <Body bold>{t.name}</Body>
          <Muted>{openItems(db, t).length} Monat(e) offen</Muted>
          <Body bold color={colors.danger}>{eur(totalOpen(db, t))}</Body>
        </Card>
      ))}
      {db.properties.length === 0 && <Btn title="Erstes Objekt anlegen" onPress={() => navigation.navigate('PropertyForm', {})} />}
    </Screen>
  );
}

export function Properties({ navigation }: any) {
  const { db } = useStore();
  return (
    <Screen>
      <Btn title="+ Objekt hinzufügen" onPress={() => navigation.navigate('PropertyForm', {})} />
      {db.properties.length === 0 && <Empty text="Noch keine Objekte." />}
      {db.properties.map((p) => (
        <Card key={p.id} onPress={() => navigation.navigate('PropertyDetail', { id: p.id })}>
          <Body bold>{p.name}</Body>
          <Muted>{p.street}, {p.zip} {p.city}</Muted>
          <Muted>{db.units.filter((u) => u.propertyId === p.id).length} Einheit(en)</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function Tenants({ navigation }: any) {
  const colors = useColors();
  const { db } = useStore();
  return (
    <Screen>
      <Btn title="+ Mieter hinzufügen" onPress={() => navigation.navigate('TenantForm', {})} />
      {db.tenants.length === 0 && <Empty text="Noch keine Mieter. Lege zuerst ein Objekt und eine Wohnung an." />}
      {db.tenants.map((t) => {
        const u = db.units.find((x) => x.id === t.unitId);
        const o = totalOpen(db, t);
        return (
          <Card key={t.id} onPress={() => navigation.navigate('TenantDetail', { id: t.id })}>
            <Body bold>{t.name}</Body>
            <Muted>{u?.name ?? '–'} · seit {dateDE(t.moveIn)}{t.moveOut ? ` bis ${dateDE(t.moveOut)}` : ''}</Muted>
            <Body color={o > 0 ? colors.danger : colors.ok}>{o > 0 ? `Offen: ${eur(o)}` : 'Ausgeglichen'}</Body>
          </Card>
        );
      })}
    </Screen>
  );
}

export function Payments({ navigation }: any) {
  const colors = useColors();
  const { db } = useStore();
  const list = [...db.payments].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Screen>
      <Btn title="+ Zahlung erfassen" onPress={() => navigation.navigate('PaymentForm', {})} />
      {list.length === 0 && <Empty text="Noch keine Zahlungen." />}
      {list.map((p) => (
        <Card key={p.id} onPress={() => navigation.navigate('PaymentForm', { id: p.id })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Body bold>{db.tenants.find((t) => t.id === p.tenantId)?.name ?? '?'}</Body>
            <Body bold color={colors.ok}>{eur(p.amount)}</Body>
          </View>
          <Muted>{dateDE(p.date)} · {p.kind}{p.kind === 'miete' ? ` ${p.month}` : ''}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
