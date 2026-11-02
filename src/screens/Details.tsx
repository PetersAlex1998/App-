import React, { useLayoutEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { Avatar, Badge, Button, EmptyState, Gap, ListRow, Note, Row, Screen, Section, Segmented, Stat, StatGrid, confirm, notify, useColors } from '../ui';
import { addDays, dateDE, eur, initials, kindLabel, kindOf, monthLabel, unitDue, nkStatement, openItems, reminderLabel, today, totalOpen } from '../calc';
import { exportPdf, nkHtml, reminderHtml } from '../pdf';
import { type } from '../theme';


function useHeaderAction(navigation: any, label: string, onPress: () => void) {
  const c = useColors();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={{ paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: type.body, fontWeight: '600' }}>{label}</Text>
        </Pressable>
      ),
    });
  });
}

export function PropertyDetail({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const p = db.properties.find((x) => x.id === route.params.id);
  useHeaderAction(navigation, 'Bearbeiten', () => p && navigation.navigate('PropertyForm', { id: p.id }));
  if (!p) return <Screen><EmptyState icon="help-circle" title="Objekt nicht gefunden" text="Es wurde vermutlich gelöscht." /></Screen>;
  const units = db.units.filter((u) => u.propertyId === p.id);
  const active = (u: string) => db.tenants.find((t) => t.unitId === u && (!t.moveOut || t.moveOut >= today()));
  const area = units.reduce((s, u) => s + u.area, 0);
  const rent = units.filter((u) => active(u.id)).reduce((s, u) => s + unitDue(u), 0);
  const occ = units.length ? Math.round((units.filter((u) => active(u.id)).length / units.length) * 100) : 0;
  const years = [...new Set(db.costs.filter((x) => x.propertyId === p.id).map((x) => x.year))].sort((a, b) => b - a);

  return (
    <Screen>
      <View style={{ marginBottom: 16, marginTop: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.4 }}>{p.name}</Text>
        <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 2 }}>{p.street}, {p.zip} {p.city}{p.yearBuilt ? ` · Baujahr ${p.yearBuilt}` : ''}</Text>
        {p.notes ? <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 6 }}>{p.notes}</Text> : null}
      </View>
      <StatGrid>
        <Stat label="Einheiten" value={String(units.length)} icon="home-outline" />
        <Stat label="Fläche" value={`${area.toLocaleString('de-DE')} m²`} icon="resize-outline" />
        <Stat label="Soll-Miete / Monat" value={eur(rent)} icon="cash-outline" />
        <Stat label="Auslastung" value={`${occ} %`} icon="pie-chart-outline" />
      </StatGrid>

      <Section title="Wohnungen" action={{ label: '+ Hinzufügen', onPress: () => navigation.navigate('UnitForm', { propertyId: p.id }) }}>
        {units.length === 0 && <Note>Noch keine Wohnungen. Füge die erste hinzu.</Note>}
        {units.map((u) => {
          const t = active(u.id);
          return (
            <ListRow key={u.id} icon={kindOf(u) === 'gewerbe' ? 'storefront' : 'home'} title={u.name} subtitle={`${kindOf(u) === 'wohnung' ? '' : kindLabel(kindOf(u)) + ' · '}${u.area} m² · ${eur(u.coldRent)} + ${eur(u.advance)} NK${kindOf(u) === 'gewerbe' && u.vat ? ` + ${u.vat} % USt` : ''}`}
              badge={t ? { text: t.name, tone: 'ok' } : { text: 'Leerstand', tone: 'warn' }}
              onPress={() => navigation.navigate('UnitForm', { id: u.id })} />
          );
        })}
      </Section>

      <Section title="Betriebskosten" action={{ label: '+ Hinzufügen', onPress: () => navigation.navigate('CostForm', { propertyId: p.id }) }}
        footer="Aus diesen Positionen entsteht die Nebenkostenabrechnung der Mieter.">
        {years.length === 0 && <Note>Noch keine Kosten erfasst.</Note>}
        {years.map((y) => {
          const list = db.costs.filter((x) => x.propertyId === p.id && x.year === y);
          return (
            <View key={y}>
              <Row bold left={`Abrechnungsjahr ${y}`} right={eur(list.reduce((s, x) => s + x.amount, 0))} />
              {list.map((x) => (
                <ListRow key={x.id} title={x.category} subtitle={x.key === 'area' ? 'nach Wohnfläche' : 'je Einheit'} right={eur(x.amount)} onPress={() => navigation.navigate('CostForm', { id: x.id })} />
              ))}
            </View>
          );
        })}
      </Section>
    </Screen>
  );
}

export function TenantDetail({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const t = db.tenants.find((x) => x.id === route.params.id);
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  useHeaderAction(navigation, 'Bearbeiten', () => t && navigation.navigate('TenantForm', { id: t.id }));
  if (!t) return <Screen><EmptyState icon="help-circle" title="Mieter nicht gefunden" text="Er wurde vermutlich gelöscht." /></Screen>;

  const unit = db.units.find((u) => u.id === t.unitId);
  const prop = db.properties.find((p) => p.id === unit?.propertyId);
  const items = openItems(db, t);
  const open = totalOpen(db, t);
  const reminders = db.reminders.filter((r) => r.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  const paidDeposit = db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((s, p) => s + p.amount, 0);
  const nextLevel = Math.min(3, reminders.length + 1) as 1 | 2 | 3;
  const ended = !!t.moveOut && t.moveOut < today();
  const nk = unit ? nkStatement(db, t, unit, year) : null;
  const years = [0, 1, 2, 3].map((o) => new Date().getFullYear() - o);

  const link = (url: string) => Linking.openURL(url).catch(() => notify('Das konnte nicht geöffnet werden.'));
  const createReminder = () => {
    if (!unit || !prop || open <= 0) return;
    confirm(`${reminderLabel(nextLevel)} erstellen?`, async () => {
      const r = { id: uid(), tenantId: t.id, date: today(), level: nextLevel, amount: open, fee: nextLevel === 1 ? 0 : nextLevel === 2 ? 5 : 10, deadline: addDays(today(), 7) };
      save('reminders', r);
      await exportPdf(reminderHtml(db, r, t, unit, prop));
    }, 'Erstellen', `Offen: ${eur(open)}${nextLevel > 1 ? ` · Mahngebühr ${nextLevel === 2 ? '5' : '10'} €` : ''}. Frist: 7 Tage. Das PDF kannst du danach teilen oder drucken.`);
  };
  const createNk = async () => {
    if (!unit || !prop || !nk) return;
    if (nk.lines.length === 0) return notify(`Für ${year} sind noch keine Betriebskosten erfasst. Trage sie im Objekt ein.`);
    await exportPdf(nkHtml(nk, t, unit, prop, year));
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 16, gap: 6 }}>
        <Avatar text={initials(t.name)} size={72} />
        <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', color: c.text, marginTop: 4 }}>{t.name}</Text>
        <Text style={{ fontSize: type.subhead, color: c.muted, textAlign: 'center' }}>{prop?.name} · {unit?.name}</Text>
        <View style={{ marginTop: 2 }}><Badge text={ended ? `Ausgezogen ${dateDE(t.moveOut)}` : open > 0 ? `${eur(open)} offen` : 'Alles bezahlt'} tone={ended ? 'neutral' : open > 0 ? 'danger' : 'ok'} /></View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
        <View style={{ flex: 1 }}><Button kind="primary" icon="add" title="Zahlung" onPress={() => navigation.navigate('PaymentForm', { tenantId: t.id })} /></View>
        {t.phone ? <View style={{ flex: 1 }}><Button kind="secondary" icon="call" title="Anrufen" onPress={() => link(`tel:${t.phone.replace(/\s/g, '')}`)} /></View> : null}
        {t.email ? <View style={{ flex: 1 }}><Button kind="secondary" icon="mail" title="Mail" onPress={() => link(`mailto:${t.email}`)} /></View> : null}
      </View>

      <Section title="Offene Posten">
        {items.length === 0 && <Note>Keine offenen Mieten – alles ausgeglichen.</Note>}
        {items.map((i) => (
          <ListRow key={i.month} icon="alert-circle" iconTone="danger" title={monthLabel(i.month)} subtitle={i.paid > 0 ? `Soll ${eur(i.due)} · gezahlt ${eur(i.paid)}` : `Soll ${eur(i.due)}`} right={eur(i.open)} rightColor={c.danger}
            onPress={() => navigation.navigate('PaymentForm', { tenantId: t.id, month: i.month, amount: i.open })} />
        ))}
        {items.length > 1 && <Row bold left="Summe offen" right={eur(open)} color={c.danger} />}
      </Section>
      {open > 0 && !ended && <><Button kind="destructive" icon="document-text" title={`${reminderLabel(nextLevel)} erstellen`} onPress={createReminder} /><Gap h={22} /></>}

      {reminders.length > 0 && (
        <Section title="Mahnhistorie" footer="Antippen, um das PDF erneut zu erzeugen.">
          {reminders.map((r) => (
            <ListRow key={r.id} icon="mail-unread-outline" iconTone="warn" title={reminderLabel(r.level)} subtitle={`${dateDE(r.date)} · Frist ${dateDE(r.deadline)}`} right={eur(r.amount + r.fee)}
              onPress={() => unit && prop && exportPdf(reminderHtml(db, r, t, unit, prop))} />
          ))}
        </Section>
      )}

      <Section title="Mietvertrag">
        <Row left="Wohnung" right={unit ? `${unit.area} m² · ${unit.rooms} Zi.` : '–'} />
        <Row left="Kaltmiete" right={unit ? eur(unit.coldRent) : '–'} />
        <Row left="NK-Vorauszahlung" right={unit ? eur(unit.advance) : '–'} />
        <Row left="Einzug" right={dateDE(t.moveIn)} />
        {t.moveOut ? <Row left="Auszug" right={dateDE(t.moveOut)} /> : null}
        <Row left="Kaution" right={t.deposit ? `${eur(paidDeposit)} von ${eur(t.deposit)}` : '–'} color={t.deposit > paidDeposit ? c.warn : undefined} />
      </Section>

      <Section title="Nebenkostenabrechnung" footer="Anteilig nach Mietmonaten. Kosten und Verteilerschlüssel pflegst du im Objekt.">
        <View style={{ padding: 12 }}>
          <Segmented value={year} onChange={setYear} options={years.map((y) => ({ label: String(y), value: y }))} />
          {nk && nk.lines.length > 0 ? (
            <View style={{ gap: 2 }}>
              <Row left="Kostenanteil" right={eur(nk.costs)} />
              <Row left="Vorauszahlungen" right={eur(nk.advances)} />
              <Row bold left={nk.balance > 0 ? 'Nachzahlung' : 'Guthaben'} right={eur(Math.abs(nk.balance))} color={nk.balance > 0 ? c.danger : c.ok} />
            </View>
          ) : (
            <Text style={{ color: c.muted, fontSize: type.subhead }}>Für {year} sind keine Betriebskosten erfasst.</Text>
          )}
        </View>
      </Section>
      <Button kind="secondary" icon="document-text-outline" title={`Abrechnung ${year} als PDF`} onPress={createNk} />
    </Screen>
  );
}
