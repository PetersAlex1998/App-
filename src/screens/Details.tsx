import React, { useState } from 'react';
import { View } from 'react-native';
import { useStore, uid } from '../store';
import { Btn, Card, Choice, Empty, Field, Muted, Row, Screen, Title, useColors, notify, Body } from '../ui';
import { addDays, dateDE, eur, nkStatement, num, openItems, today, totalOpen } from '../calc';
import { exportPdf, nkHtml, reminderHtml } from '../pdf';

export function PropertyDetail({ route, navigation }: any) {
  const colors = useColors();
  const { db } = useStore();
  const p = db.properties.find((x) => x.id === route.params.id);
  if (!p) return <Screen><Empty text="Objekt nicht gefunden" /></Screen>;
  const units = db.units.filter((u) => u.propertyId === p.id);
  const costs = db.costs.filter((c) => c.propertyId === p.id).sort((a, b) => b.year - a.year);
  return (
    <Screen>
      <Title>{p.name}</Title>
      <Muted>{p.street}, {p.zip} {p.city}{p.yearBuilt ? ` · Baujahr ${p.yearBuilt}` : ''}</Muted>
      {p.notes ? <Muted>{p.notes}</Muted> : null}
      <Btn kind="ghost" title="Stammdaten bearbeiten" onPress={() => navigation.navigate('PropertyForm', { id: p.id })} />
      <Title>Wohnungen</Title>
      {units.length === 0 && <Empty text="Noch keine Wohnungen" />}
      {units.map((u) => {
        const t = db.tenants.find((x) => x.unitId === u.id && !x.moveOut);
        return (
          <Card key={u.id} onPress={() => navigation.navigate('UnitForm', { id: u.id })}>
            <Body bold>{u.name}</Body>
            <Muted>{u.area} m² · {u.rooms} Zi. · {eur(u.coldRent)} + {eur(u.advance)} NK</Muted>
            <Body color={t ? colors.text : colors.muted}>{t ? `Mieter: ${t.name}` : 'Leerstand'}</Body>
          </Card>
        );
      })}
      <Btn title="+ Wohnung hinzufügen" onPress={() => navigation.navigate('UnitForm', { propertyId: p.id })} />
      <Title>Betriebskosten</Title>
      {costs.length === 0 && <Empty text="Noch keine Kosten erfasst" />}
      {costs.map((c) => (
        <Card key={c.id} onPress={() => navigation.navigate('CostForm', { id: c.id })}>
          <Row left={`${c.year} · ${c.category}`} right={eur(c.amount)} />
          <Muted>{c.key === 'area' ? 'nach Wohnfläche' : 'je Einheit'}</Muted>
        </Card>
      ))}
      <Btn title="+ Kostenposition hinzufügen" onPress={() => navigation.navigate('CostForm', { propertyId: p.id })} />
    </Screen>
  );
}

export function TenantDetail({ route, navigation }: any) {
  const colors = useColors();
  const { db, save } = useStore();
  const t = db.tenants.find((x) => x.id === route.params.id);
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  if (!t) return <Screen><Empty text="Mieter nicht gefunden" /></Screen>;
  const unit = db.units.find((u) => u.id === t.unitId);
  const prop = db.properties.find((p) => p.id === unit?.propertyId);
  const items = openItems(db, t);
  const open = totalOpen(db, t);
  const reminders = db.reminders.filter((r) => r.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  const paidDeposit = db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((s, p) => s + p.amount, 0);

  const createReminder = async () => {
    if (!unit || !prop || open <= 0) return notify('Keine offenen Posten.');
    const level = Math.min(3, reminders.length + 1) as 1 | 2 | 3;
    const r = { id: uid(), tenantId: t.id, date: today(), level, amount: open, fee: level === 1 ? 0 : level === 2 ? 5 : 10, deadline: addDays(today(), 7) };
    save('reminders', r);
    await exportPdf(reminderHtml(db, r, t, unit, prop));
  };
  const createNk = async () => {
    if (!unit || !prop) return;
    const res = nkStatement(db, t, unit, year);
    if (res.lines.length === 0) return notify(`Für ${year} sind keine Betriebskosten erfasst (im Objekt anlegen).`);
    await exportPdf(nkHtml(res, t, unit, prop, year));
  };
  const nk = unit ? nkStatement(db, t, unit, year) : null;

  return (
    <Screen>
      <Title>{t.name}</Title>
      <Muted>{prop?.name} – {unit?.name}</Muted>
      <Muted>{t.email} {t.phone}</Muted>
      <Muted>Einzug {dateDE(t.moveIn)}{t.moveOut ? ` · Auszug ${dateDE(t.moveOut)}` : ''}</Muted>
      <Muted>Kaution: {eur(paidDeposit)} von {eur(t.deposit)} gezahlt</Muted>
      <Btn kind="ghost" title="Stammdaten bearbeiten" onPress={() => navigation.navigate('TenantForm', { id: t.id })} />
      <Btn title="+ Zahlung erfassen" onPress={() => navigation.navigate('PaymentForm', { tenantId: t.id })} />

      <Title>Offene Posten</Title>
      <Card>
        {items.length === 0 && <Body color={colors.ok}>Alles bezahlt</Body>}
        {items.map((i) => <Row key={i.month} left={i.month} right={eur(i.open)} color={colors.danger} />)}
        {items.length > 0 && <Row bold left="Summe" right={eur(open)} color={colors.danger} />}
      </Card>
      {open > 0 && <Btn kind="danger" title={`Mahnung erstellen (Stufe ${Math.min(3, reminders.length + 1)}) als PDF`} onPress={createReminder} />}
      {reminders.map((r) => (
        <Muted key={r.id}>{dateDE(r.date)} · Stufe {r.level} · {eur(r.amount + r.fee)}</Muted>
      ))}

      <Title>Nebenkostenabrechnung</Title>
      <Choice label="Jahr" value={year} onChange={setYear} options={[0, 1, 2, 3].map((o) => ({ label: String(new Date().getFullYear() - o), value: new Date().getFullYear() - o }))} />
      {nk && nk.lines.length > 0 && (
        <Card>
          <Row left="Kostenanteil" right={eur(nk.costs)} />
          <Row left="Vorauszahlungen" right={eur(nk.advances)} />
          <Row bold left={nk.balance > 0 ? 'Nachzahlung' : 'Guthaben'} right={eur(Math.abs(nk.balance))} color={nk.balance > 0 ? colors.danger : colors.ok} />
        </Card>
      )}
      <Btn title="NK-Abrechnung als PDF" onPress={createNk} />
    </Screen>
  );
}
