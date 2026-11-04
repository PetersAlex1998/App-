import React, { useLayoutEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, uid } from '../store';
import { ActionTile, Avatar, Badge, Button, EmptyState, Gap, ListRow, Note, Row, Screen, Section, Segmented, Stat, StatGrid, confirm, infoRows, notify, useColors } from '../ui';
import { CoverEmpty, CoverHero, DocumentsSection } from './Documents';
import { expiryState } from '../docs';
import { defaultUnitName, houseId, unitLetter, unitRef } from '../ids';
import { kindText, sourceLabel, sourceTone } from '../payments';
import { Platform } from 'react-native';
import { addDays, dateDE, dueMonths, eur, initials, kindLabel, kindOf, monthLabel, rentNow, unitDue, unitDueAt, nkStatement, openItems, reminderLabel, today, totalOpen } from '../calc';
import { exportPdf, nkHtml, reminderHtml } from '../pdf';
import { nkModel, reminderModel } from '../letters';
import { storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { useSettings } from '../settings';
import { dunningPlans, feeFor, makeReminder, overdueItems, relevantReminders } from '../dunning';
import { type } from '../theme';
import { fmtVal, meterIcon, meterTypeLabel, readingsOf } from '../meters';
import { useTenantActions } from '../tenantActions';
import { addTerm } from '../rent';
import { durationText, tenancyTimeline } from '../history';


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
  const { db, save } = useStore();
  const c = useColors();
  const p = db.properties.find((x) => x.id === route.params.id);
  useHeaderAction(navigation, 'Bearbeiten', () => p && navigation.navigate('PropertyForm', { id: p.id }));
  if (!p) return <Screen><EmptyState icon="help-circle" title="Objekt nicht gefunden" text="Es wurde vermutlich gelöscht." /></Screen>;
  const units = db.units.filter((u) => u.propertyId === p.id).sort((a, b) => (unitLetter(a.kind) === unitLetter(b.kind) ? (a.no ?? 0) - (b.no ?? 0) : unitLetter(a.kind) === 'W' ? -1 : 1));
  const active = (u: string) => db.tenants.find((t) => t.unitId === u && (!t.moveOut || t.moveOut >= today()));
  const area = units.reduce((s, u) => s + u.area, 0);
  const rent = units.filter((u) => active(u.id)).reduce((s, u) => s + unitDue(u), 0);
  const occ = units.length ? Math.round((units.filter((u) => active(u.id)).length / units.length) * 100) : 0;
  const years = [...new Set(db.costs.filter((x) => x.propertyId === p.id).map((x) => x.year))].sort((a, b) => b - a);
  const meters = db.meters.filter((m) => m.propertyId === p.id);
  const lastReadingDate = db.readings.filter((r) => meters.some((m) => m.id === r.meterId)).reduce((d, r) => (r.date > d ? r.date : d), '');

  return (
    <Screen>
      <View style={{ marginBottom: 16, marginTop: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.4 }}>{p.name}</Text>
        <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 2 }}>{p.street}, {p.zip} {p.city}{p.yearBuilt ? ` · Baujahr ${p.yearBuilt}` : ''}</Text>
        {houseId(p) ? <Text style={{ fontSize: type.subhead, color: c.primary, fontWeight: '700', marginTop: 4 }}>Haus-ID {houseId(p)}</Text> : null}
        {p.notes ? <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 6 }}>{p.notes}</Text> : null}
      </View>
      {filesSupported() && (() => {
        const cover = p.coverId ? db.documents.find((d) => d.id === p.coverId) : undefined;
        const pick = () => navigation.navigate('DocumentForm', { ownerKind: 'property', ownerId: p.id, cover: '1' });
        return cover ? <CoverHero doc={cover} onPress={() => navigation.navigate('DocumentViewer', { id: cover.id })} onChange={pick} /> : <CoverEmpty onPress={pick} />;
      })()}
      <StatGrid>
        <Stat label="Einheiten" value={String(units.length)} icon="home-outline" />
        <Stat label="Fläche" value={`${area.toLocaleString('de-DE')} m²`} icon="resize-outline" />
        <Stat label="Soll-Miete / Monat" value={eur(rent)} icon="cash-outline" />
        <Stat label="Auslastung" value={`${occ} %`} icon="pie-chart-outline" />
      </StatGrid>

      {(() => {
        const rows = infoRows([
          ['Grundstück', p.plotArea && `${p.plotArea} m²`], ['Etagen', p.floors],
          ['Heizung', [p.heatingType, p.heatingYear && `Bj. ${p.heatingYear}`].filter(Boolean).join(' · ')], ['Energieträger', p.energySource],
          ['Grundbuch', p.landRegister], ['Flurstück', p.parcel],
          ['Kauf', [p.purchaseDate && dateDE(p.purchaseDate), p.purchasePrice && eur(Number(p.purchasePrice.replace(',', '.')) || 0)].filter(Boolean).join(' · ')],
          ['Versicherung', [p.insurer, p.policyNo].filter(Boolean).join(' · ')], ['Jahresprämie', p.premium && eur(Number(p.premium.replace(',', '.')) || 0)],
          ['Ansprechpartner', [p.contactName, p.contactPhone].filter(Boolean).join(' · ')],
        ]);
        return rows.length > 0 ? <Section title="Stammdaten">{rows}</Section> : null;
      })()}

      <Section title="Wohnungen" action={{ label: '+ Hinzufügen', onPress: () => navigation.navigate('UnitForm', { propertyId: p.id }) }}>
        {units.length === 0 && <Note>Noch keine Wohnungen. Füge die erste hinzu.</Note>}
        {units.map((u) => {
          const t = active(u.id);
          return (
            <ListRow key={u.id} icon={kindOf(u) === 'gewerbe' ? 'storefront' : 'home'} title={u.name} subtitle={`${unitRef(p, u) ? unitRef(p, u) + ' · ' : ''}${kindOf(u) === 'wohnung' ? '' : kindLabel(kindOf(u)) + ' · '}${u.area} m² · ${eur(u.coldRent)} + ${eur(u.advance)} NK${kindOf(u) === 'gewerbe' && u.vat ? ` + ${u.vat} % USt` : ''}`}
              badge={t ? { text: t.name, tone: 'ok' } : { text: 'Leerstand', tone: 'warn' }}
              onPress={() => navigation.navigate('UnitDetail', { id: u.id })} />
          );
        })}
        {units.some((u) => u.no && u.name !== defaultUnitName(u.kind, u.no)) && (
          <ListRow icon="swap-horizontal-outline" title="Namen vereinheitlichen" subtitle="Alle Einheiten heißen dann Wohnung 1, Wohnung 2 …"
            onPress={() => confirm('Namen vereinheitlichen?', () => units.forEach((u) => {
              if (!u.no || u.name === defaultUnitName(u.kind, u.no)) return;
              save('units', { ...u, name: defaultUnitName(u.kind, u.no), notes: [u.notes, `Früher: ${u.name}`].filter(Boolean).join('\n') });
            }), 'Umbenennen', 'Die Namen folgen der Nummer, die Wohnungs-IDs bleiben gleich. Die bisherige Bezeichnung wird in den Notizen der Einheit aufbewahrt.')} />
        )}
        <ListRow icon="copy-outline" title="Mehrere Einheiten auf einmal anlegen" subtitle="z. B. Wohnung 1 bis Wohnung 20" onPress={() => navigation.navigate('UnitSeries', { propertyId: p.id })} />
      </Section>

      <Section title="Zähler" footer="Die Stände siehst du in den einzelnen Wohnungen. Verbrauchswerte fließen in die Nebenkostenabrechnung ein.">
        <ListRow icon="create-outline" title="Zählerstände erfassen" subtitle={meters.length ? `${meters.length} Zähler${lastReadingDate ? ` · letzte Ablesung ${dateDE(lastReadingDate)}` : ''}` : 'Zuerst einen Zähler hinzufügen'}
          onPress={() => (meters.length ? navigation.navigate('Ablesung', { propertyId: p.id }) : navigation.navigate('MeterForm', { propertyId: p.id }))} />
        <ListRow icon="add-circle-outline" title="Zähler hinzufügen" subtitle="Heizung, Wasser, Strom oder Gas" onPress={() => navigation.navigate('MeterForm', { propertyId: p.id })} />
      </Section>

      {years.length > 0 && <><Button kind="secondary" icon="calculator-outline" title="Nebenkostenabrechnung für alle Mieter" onPress={() => navigation.navigate('NkLauf', { propertyId: p.id })} /><Gap h={22} /></>}

      <Section title="Ausgaben und Belege">
        <ListRow icon="receipt-outline" title="Ausgaben dieses Objekts" subtitle={`${db.expenses.filter((x) => x.propertyId === p.id).length} erfasst`} onPress={() => navigation.navigate('Ausgaben', { propertyId: p.id })} />
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
                <ListRow key={x.id} title={x.category} subtitle={x.key === 'area' ? 'nach Wohnfläche' : x.key === 'consumption' ? `nach Verbrauch (${x.meterType ? meterTypeLabel(x.meterType) : ''}${x.consumptionShare && x.consumptionShare < 100 ? `, ${x.consumptionShare} % Verbrauch / ${100 - x.consumptionShare} % Fläche` : ''})` : 'je Einheit'} right={eur(x.amount)} onPress={() => navigation.navigate('CostForm', { id: x.id })} />
              ))}
            </View>
          );
        })}
      </Section>

      {(() => {
        const ea = expiryState(p.eaValidUntil);
        const hasEa = p.eaClass || p.eaValue || p.eaValidUntil || p.eaIssued || p.eaType;
        return hasEa ? (
          <Section title="Energieausweis" action={{ label: 'Bearbeiten', onPress: () => navigation.navigate('PropertyForm', { id: p.id }) }}>
            <ListRow icon="leaf" title={`Energieausweis${p.eaType ? ` (${p.eaType})` : ''}`}
              subtitle={[p.eaClass && `Klasse ${p.eaClass}`, p.eaValue && `${p.eaValue} kWh/(m²·a)`, p.eaValidUntil && `gültig bis ${dateDE(p.eaValidUntil)}`].filter(Boolean).join(' · ') || 'Angaben unvollständig'}
              badge={ea && ea.tone !== 'ok' ? { text: ea.text, tone: ea.tone } : ea ? { text: 'Gültig', tone: 'ok' } : undefined} />
            {infoRows([['Ausgestellt am', p.eaIssued && dateDE(p.eaIssued)]])}
          </Section>
        ) : null;
      })()}

      <DocumentsSection ownerKind="property" ownerId={p.id} navigation={navigation} />
    </Screen>
  );
}

export function TenantDetail({ route, navigation }: any) {
  const { db, save } = useStore();
  const [showAllPay, setShowAllPay] = useState(false);
  const c = useColors();
  const { s: cfg } = useSettings();
  const t = db.tenants.find((x) => x.id === route.params.id);
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const act = useTenantActions(t, navigation); // vor jedem frühen Return (Regeln der Hooks)
  useHeaderAction(navigation, 'Bearbeiten', () => t && navigation.navigate('TenantForm', { id: t.id }));
  if (!t) return <Screen><EmptyState icon="help-circle" title="Mieter nicht gefunden" text="Er wurde vermutlich gelöscht." /></Screen>;

  const unit = db.units.find((u) => u.id === t.unitId);
  const prop = db.properties.find((p) => p.id === unit?.propertyId);
  const items = openItems(db, t);
  const open = totalOpen(db, t);
  const reminders = db.reminders.filter((r) => r.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  const paidDeposit = db.payments.filter((p) => p.tenantId === t.id && p.kind === 'kaution').reduce((s, p) => s + p.amount, 0);
  const dueNow = overdueItems(db, t, cfg);
  const nextLevel = Math.min(3, relevantReminders(db, t, dueNow).length + 1) as 1 | 2 | 3;
  const ended = !!t.moveOut && t.moveOut < today();
  const nk = unit ? nkStatement(db, t, unit, year) : null;
  const years = [0, 1, 2, 3].map((o) => new Date().getFullYear() - o);

  const link = (url: string) => Linking.openURL(url).catch(() => notify('Das konnte nicht geöffnet werden.'));
  const createReminder = act.createReminder;
  const createNk = () => act.createNk(year);

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
      {dueNow.length > 0 && !ended && <><Button kind="destructive" icon="document-text" title={`${reminderLabel(nextLevel)} erstellen`} onPress={createReminder} /><Gap h={22} /></>}

      {(() => {
        const pays = db.payments.filter((p) => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        const paidRent = pays.filter((p) => p.kind === 'miete').reduce((s2, p) => s2 + p.amount, 0);
        const soll = unit ? dueMonths(t).reduce((a, m) => a + unitDueAt(unit, m), 0) : 0;
        const shown = showAllPay ? pays : pays.slice(0, 8);
        return (
          <Section title={`Zahlungen (${pays.length})`} action={{ label: '+ Erfassen', onPress: () => navigation.navigate('PaymentForm', { tenantId: t.id }) }}
            footer={pays.length ? `Seit Kontoführung: Soll ${eur(soll)} · Mietzahlungen ${eur(paidRent)}. „Manuell“ = von Hand erfasst, „Kontoauszug“ = aus einer CSV eingelesen.` : undefined}>
            {pays.length === 0 && <Note>Noch keine Zahlungen. Erfasse eine Zahlung von Hand oder importiere den Kontoauszug.</Note>}
            {shown.map((p) => (
              <ListRow key={p.id} icon="arrow-down" iconTone="ok" title={kindText(p.kind) + (p.kind === 'miete' ? ` ${monthLabel(p.month)}` : '')}
                subtitle={`${dateDE(p.date)}${p.note ? ` · ${p.note}` : ''}`} right={`+ ${eur(p.amount)}`} rightColor={c.ok}
                badge={{ text: sourceLabel(p) + (p.editedAt ? ' · geändert' : ''), tone: sourceTone(p) }} onPress={() => navigation.navigate('PaymentForm', { id: p.id })} />
            ))}
            {pays.length > 8 && <ListRow icon={showAllPay ? 'chevron-up' : 'chevron-down'} title={showAllPay ? 'Weniger anzeigen' : `Alle ${pays.length} Zahlungen anzeigen`} onPress={() => setShowAllPay(!showAllPay)} chevron={false} />}
          </Section>
        );
      })()}

      {reminders.length > 0 && (
        <Section title="Mahnhistorie" footer="Antippen, um das PDF erneut zu erzeugen.">
          {reminders.map((r) => (
            <ListRow key={r.id} icon="mail-unread-outline" iconTone="warn" title={reminderLabel(r.level)} subtitle={`${dateDE(r.date)} · Frist ${dateDE(r.deadline)}`} right={eur(r.amount + r.fee)}
              onPress={() => unit && prop && exportPdf(reminderHtml(db, r, t, unit, prop, cfg))} />
          ))}
        </Section>
      )}

      <Section title="Mietvertrag">
        <Row left="Wohnung" right={unit ? `${unit.area} m² · ${unit.rooms} Zi.` : '–'} />
        {unitRef(prop, unit) ? <Row left="Zahlungsreferenz" right={unitRef(prop, unit)} bold /> : null}
        <Row left="Kaltmiete" right={unit ? eur(rentNow(unit).coldRent) : '–'} />
        <Row left="NK-Vorauszahlung" right={unit ? eur(rentNow(unit).advance) : '–'} />
        <Row left="Einzug" right={dateDE(t.moveIn)} />
        {t.moveOut ? <Row left="Auszug" right={dateDE(t.moveOut)} /> : null}
        <Row left="Kaution" right={t.deposit ? `${eur(paidDeposit)} von ${eur(t.deposit)}` : '–'} color={t.deposit > paidDeposit ? c.warn : undefined} />
        {infoRows([
          ['Befristet bis', t.contractEnd && dateDE(t.contractEnd)], ['Kündigungsfrist', t.noticeMonths && `${t.noticeMonths} Monate`],
          ['Mietanpassung', [t.rentAdjust, t.nextAdjust && `nächste am ${dateDE(t.nextAdjust)}`].filter(Boolean).join(' · ')],
          ['Kautionsart', [t.depositType, t.depositAccount].filter(Boolean).join(' · ')],
        ])}
      </Section>
      {(t.salutation || t.mobile || t.postalAddress || t.emergencyContact || t.notes || t.iban) ? (
        <Section title="Persönliches">
          {infoRows([['Anrede', t.salutation], ['Mobil', t.mobile], ['Postanschrift', t.postalAddress], ['Notfallkontakt', t.emergencyContact], ['IBAN', t.iban], ['Notizen', t.notes]])}
        </Section>
      ) : null}
      <Section><ListRow icon="documents-outline" title="Schreiben aus Vorlage" subtitle="Bescheinigung, Kündigung, Übergabeprotokoll …" onPress={() => navigation.navigate('Vorlagen', { tenantId: t.id })} /></Section>
      <DocumentsSection ownerKind="tenant" ownerId={t.id} navigation={navigation} />

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
          {nk && nk.warnings.length > 0 && (
            <View style={{ marginTop: 10, gap: 6 }}>{nk.warnings.map((w) => <Text key={w} style={{ color: c.warn, fontSize: type.footnote }}>⚠ {w}</Text>)}</View>
          )}
        </View>
      </Section>
      <Button kind="secondary" icon="document-text-outline" title={`Abrechnung ${year} erstellen`} onPress={createNk} />
    </Screen>
  );
}

export function UnitDetail({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const { s: cfg } = useSettings();
  const u = db.units.find((x) => x.id === route.params.id);
  const tenant = db.tenants.find((t) => t.unitId === route.params.id && (!t.moveOut || t.moveOut >= today()));
  const act = useTenantActions(tenant, navigation); // vor jedem frühen Return (Regeln der Hooks)
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [showHistory, setShowHistory] = useState(false);
  useHeaderAction(navigation, 'Bearbeiten', () => u && navigation.navigate('UnitForm', { id: u.id }));
  if (!u) return <Screen><EmptyState icon="help-circle" title="Einheit nicht gefunden" text="Sie wurde vermutlich gelöscht." /></Screen>;
  const prop = db.properties.find((p) => p.id === u.propertyId);
  const meters = db.meters.filter((m) => m.unitId === u.id);
  const open = tenant ? totalOpen(db, tenant) : 0;
  const pays = tenant ? db.payments.filter((p) => p.tenantId === tenant.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')) : [];
  const nk = tenant ? nkStatement(db, tenant, u, year) : null;
  const years = [0, 1, 2, 3].map((o) => new Date().getFullYear() - o);
  const timeline = tenancyTimeline(db, u.id);
  const tenantCount = timeline.filter((e) => e.kind === 'tenant').length;
  const readingTarget = () => (meters.length === 0 ? navigation.navigate('MeterForm', { propertyId: u.propertyId, unitId: u.id })
    : meters.length === 1 ? navigation.navigate('ReadingForm', { meterId: meters[0].id }) : navigation.navigate('Ablesung', { propertyId: u.propertyId, unitId: u.id }));
  const noTenant = () => notify('Diese Einheit ist leer. Lege zuerst einen Mieter an.');

  return (
    <Screen>
      <View style={{ marginBottom: 16, marginTop: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.4 }}>{u.name}</Text>
        <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 2 }}>{prop?.name} · {kindLabel(kindOf(u))}{unitRef(prop, u) ? ` · ${unitRef(prop, u)}` : ''}</Text>
      </View>
      <StatGrid>
        <Stat label="Fläche" value={`${u.area} m²`} icon="resize-outline" />
        <Stat label="Zimmer" value={String(u.rooms || '–')} icon="bed-outline" />
        <Stat label="Miete / Monat" value={eur(unitDue(u))} icon="cash-outline" />
        <Stat label="Kaltmiete" value={eur(rentNow(u).coldRent)} icon="pricetag-outline" />
      </StatGrid>

      <Section title="Mieter">
        {tenant ? <ListRow avatar={initials(tenant.name)} title={tenant.name} subtitle={`seit ${tenant.moveIn ? dateDE(tenant.moveIn) : 'unbekannt'}`}
          badge={open > 0 ? { text: `${eur(open)} offen`, tone: 'danger' } : { text: 'Alles bezahlt', tone: 'ok' }} onPress={() => navigation.navigate('TenantDetail', { id: tenant.id })} />
          : <ListRow icon="key-outline" iconTone="warn" title="Leerstand" subtitle="Mieter hinzufügen" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />}
      </Section>

      <Text accessibilityRole="header" style={{ fontSize: type.footnote, fontWeight: '600', color: c.muted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 }}>Schnellaktionen</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <ActionTile icon="add-circle-outline" label="Zahlung" onPress={() => (tenant ? navigation.navigate('PaymentForm', { tenantId: tenant.id }) : noTenant())} disabled={!tenant} />
        <ActionTile icon="speedometer-outline" label={meters.length ? 'Ablesung' : 'Zähler anlegen'} hint={meters.length ? 'Zählerstand erfassen' : undefined} onPress={readingTarget} />
        <ActionTile icon="mail-unread-outline" label={act.plan ? act.plan.level === 1 ? 'Erinnerung' : 'Mahnung' : 'Mahnung'} onPress={act.createReminder} disabled={!tenant} badge={act.plan ? '!' : undefined} hint={act.plan ? 'Miete überfällig' : 'Keine Miete überfällig'} />
        <ActionTile icon="calculator-outline" label={`NK ${year}`} hint="Nebenkostenabrechnung erstellen" onPress={() => act.createNk(year)} disabled={!tenant} />
        <ActionTile icon="trending-up-outline" label="Miete erhöhen" onPress={() => navigation.navigate('Mieterhoehung', { unitId: u.id })} />
        <ActionTile icon="person-add-outline" label="Neuer Mieter" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />
        <ActionTile icon="documents-outline" label="Schreiben" hint="Dokument aus Vorlage erstellen" onPress={() => navigation.navigate('Vorlagen', { unitId: u.id, tenantId: tenant?.id })} />
        <ActionTile icon="document-attach-outline" label="Dokument" onPress={() => navigation.navigate('DocumentForm', { ownerKind: 'unit', ownerId: u.id })} />
        <ActionTile icon="add-outline" label="Zähler +" onPress={() => navigation.navigate('MeterForm', { propertyId: u.propertyId, unitId: u.id })} />
      </View>

      {(() => {
        const ref = unitRef(prop, u);
        const copy = () => {
          if (Platform.OS === 'web' && navigator.clipboard) navigator.clipboard.writeText(ref).then(() => notify(`Kopiert: ${ref}`)).catch(() => notify(ref));
          else notify(ref);
        };
        return ref ? (
          <Section title="Kennung" footer="Diese ID geben Mieter bei jeder Zahlung als Verwendungszweck an.">
            <ListRow icon="finger-print" title="Wohnungs-ID" subtitle="Verwendungszweck für Zahlungen" right={ref} onPress={copy} chevron={false} />
          </Section>
        ) : null;
      })()}

      {tenant && (
        <Section title={`Zahlungen (${pays.length})`} action={{ label: '+ Erfassen', onPress: () => navigation.navigate('PaymentForm', { tenantId: tenant.id }) }}
          footer={pays.length > 5 ? 'Alle Zahlungen siehst du beim Mieter.' : undefined}>
          {pays.length === 0 && <Note>Noch keine Zahlungen erfasst.</Note>}
          {pays.slice(0, 5).map((p) => (
            <ListRow key={p.id} icon="arrow-down" iconTone="ok" title={kindText(p.kind) + (p.kind === 'miete' ? ` ${monthLabel(p.month)}` : '')} subtitle={`${dateDE(p.date)}${p.note ? ` · ${p.note}` : ''}`}
              right={`+ ${eur(p.amount)}`} rightColor={c.ok} badge={{ text: sourceLabel(p), tone: sourceTone(p) }} onPress={() => navigation.navigate('PaymentForm', { id: p.id })} />
          ))}
          {pays.length > 5 && <ListRow icon="list" title={`Alle ${pays.length} Zahlungen ansehen`} onPress={() => navigation.navigate('TenantDetail', { id: tenant.id })} />}
        </Section>
      )}

      {tenant?.rentChange && (
        <Section title="Angekündigte Mieterhöhung" footer={tenant.rentChange.kind === 'vergleich' ? `Der Mieter muss zustimmen${tenant.rentChange.consentUntil ? ` (bis ${dateDE(tenant.rentChange.consentUntil)})` : ''}. Übernimm die Miete erst, wenn die Zustimmung vorliegt.` : 'Bei Indexmiete ist keine Zustimmung nötig. Übernimm die Miete, sobald sie gilt.'}>
          <ListRow icon="trending-up" iconTone={tenant.rentChange.from <= today() ? 'warn' : undefined} title={`Kaltmiete ab ${dateDE(tenant.rentChange.from)}: ${eur(tenant.rentChange.coldRent)}`} subtitle={`bisher ${eur(rentNow(u).coldRent)} · Schreiben vom ${dateDE(tenant.rentChange.letterDate)}`}
            right={tenant.rentChange.kind === 'vergleich' ? 'Zustimmung erhalten' : 'Übernehmen'}
            onPress={() => { const rc = tenant.rentChange!; save('units', addTerm(u, rc.from, { coldRent: rc.coldRent, reason: rc.kind === 'index' ? 'Indexmiete' : 'Vergleichsmiete' })); save('tenants', { ...tenant, rentChange: undefined }); }} />
          <ListRow icon="close-circle-outline" title="Zurückziehen oder abgelehnt" subtitle="Die Erhöhung wird nicht übernommen" onPress={() => save('tenants', { ...tenant, rentChange: undefined })} />
        </Section>
      )}

      {tenant?.advanceChange && (
        <Section title="Angekündigte Änderung" footer="Die neue Vorauszahlung ist dem Mieter mitgeteilt. Übernimm sie in der Wohnung, sobald sie gilt, damit das Soll stimmt.">
          <ListRow icon="trending-up" iconTone={tenant.advanceChange.from <= today() ? 'warn' : undefined} title={`Vorauszahlung ab ${dateDE(tenant.advanceChange.from)}: ${eur(tenant.advanceChange.amount)}`} subtitle={`bisher ${eur(rentNow(u).advance)} · Mitteilung vom ${dateDE(tenant.advanceChange.letterDate)}`}
            right={tenant.advanceChange.from <= today() ? 'Übernehmen' : 'Jetzt übernehmen'} onPress={() => { save('units', addTerm(u, tenant.advanceChange!.from, { advance: tenant.advanceChange!.amount, reason: 'Vorauszahlung angepasst' })); save('tenants', { ...tenant, advanceChange: undefined }); }} />
        </Section>
      )}

      {tenant && (
        <Section title="Mahnung und Abrechnung">
          <ListRow icon="mail-unread-outline" iconTone={act.plan ? 'danger' : 'ok'} title={act.plan ? `${reminderLabel(act.plan.level)} erstellen` : 'Keine Mahnung nötig'}
            subtitle={act.plan ? `${eur(act.plan.open)} überfällig${act.plan.fee ? ` · Gebühr ${eur(act.plan.fee)}` : ''}` : open > 0 ? 'Die Miete ist noch nicht überfällig.' : 'Alle Mieten sind ausgeglichen.'}
            onPress={act.plan ? act.createReminder : undefined} chevron={!!act.plan} />
          <View style={{ padding: 12 }}><Segmented value={year} onChange={setYear} options={years.map((y) => ({ label: String(y), value: y }))} /></View>
          <ListRow icon="calculator-outline" title={`Nebenkostenabrechnung ${year} erstellen`}
            subtitle={nk && nk.lines.length > 0 ? `${nk.balance > 0 ? 'Nachzahlung' : 'Guthaben'} ${eur(Math.abs(nk.balance))}${tenant.nkDone?.[String(year)] ? ` · erstellt am ${dateDE(tenant.nkDone[String(year)])}` : ''}` : `Für ${year} sind keine Betriebskosten erfasst`}
            onPress={() => act.createNk(year)} />
        </Section>
      )}

      {(u.terms?.length ?? 0) > 0 && (
        <Section title="Mietverlauf" footer="Jede Änderung gilt ab dem genannten Datum. Offene Posten und Abrechnungen rechnen jeden Monat mit der damals geltenden Miete.">
          {[...(u.terms ?? [])].reverse().map((t) => (
            <ListRow key={t.from} icon="trending-up-outline" title={`Ab ${dateDE(t.from)}: ${eur(t.coldRent)} Kaltmiete`} subtitle={`Vorauszahlung ${eur(t.advance)}${t.reason ? ` · ${t.reason}` : ''}`} right={eur(t.coldRent + t.advance)} chevron={false} />
          ))}
          <ListRow icon="time-outline" title={`Vorher: ${eur(u.coldRent)} Kaltmiete`} subtitle={`Vorauszahlung ${eur(u.advance)}`} chevron={false} />
        </Section>
      )}

      {tenantCount > 0 && (
        <View style={{ marginBottom: showHistory ? 8 : 22 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHistory }} accessibilityLabel={`Mieterhistorie ${showHistory ? 'ausblenden' : 'anzeigen'}, ${tenantCount} Mieter`} onPress={() => setShowHistory(!showHistory)}
            style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.glassBorder, paddingHorizontal: 16, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{showHistory ? 'Mieterhistorie ausblenden' : 'Mieterhistorie anzeigen'}</Text>
              <Text style={{ fontSize: type.footnote, color: c.muted }}>{tenantCount} {tenantCount === 1 ? 'Mieter' : 'Mieter'} seit {(() => { const first = [...timeline].reverse().find((e) => e.kind === 'tenant') as any; return first?.from ? dateDE(first.from) : 'unbekannt'; })()}</Text>
            </View>
            <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
          </Pressable>
        </View>
      )}
      {showHistory && (
        <Section footer="Alle Mieter dieser Wohnung, der neueste zuerst, mit Mietdauer und Leerständen. Offene Posten zählen nur für den aktuellen Mieter.">
          {timeline.map((e, i) => e.kind === 'vacancy' ? (
            <ListRow key={`v${i}`} icon="key-outline" iconTone="warn" title={`Leerstand · ${durationText(e.months)}`} subtitle={`${dateDE(e.from)} – ${dateDE(e.to)}`} chevron={false} />
          ) : (
            <ListRow key={e.tenant.id} avatar={initials(e.tenant.name)} title={e.tenant.name}
              subtitle={`${e.from ? dateDE(e.from) : 'Einzug unbekannt'} – ${e.current ? 'heute' : e.tenant.moveOut ? dateDE(e.tenant.moveOut) : 'unbekannt'}${e.months ? ` · ${durationText(e.months)}` : ''}${e.tenant.coldRent ? ` · Kaltmiete ${eur(e.tenant.coldRent)}` : ''}${e.tenant.deposit ? ` · Kaution ${eur(e.tenant.deposit)}` : ''}`}
              badge={e.current ? { text: 'Aktuell', tone: 'ok' } : undefined} onPress={() => navigation.navigate('TenantDetail', { id: e.tenant.id })} />
          ))}
        </Section>
      )}

      {(() => {
        const rows = infoRows([['Etage', u.floor], ['Lage', u.position], ['Balkon / Terrasse', u.balcony], ['Keller', u.cellar], ['Stellplatz', u.parking], ['Küche', u.kitchen], ['Ausstattung', u.equipment], ['Notizen', u.notes]]);
        return rows.length ? <Section title="Lage und Ausstattung">{rows}</Section> : null;
      })()}
      <Section title={`Zähler${meters.length ? ` (${meters.length})` : ''}`} action={{ label: '+ Zähler', onPress: () => navigation.navigate('MeterForm', { propertyId: u.propertyId, unitId: u.id }) }}
        footer={meters.length ? 'Tippe auf einen Zähler, um alle Ablesungen zu sehen. „Zählerstand“ oben trägt neue Stände ein.' : undefined}>
        {meters.length === 0 && <Note>Noch keine Zähler. Lege Heiz-, Wasser- oder Stromzähler dieser Wohnung an.</Note>}
        {meters.map((m) => {
          const list = readingsOf(db, m.id);
          const last = list[list.length - 1], prev = list[list.length - 2];
          const used = last && prev ? Math.round((last.value - prev.value) * 1000) / 1000 : null;
          return (
            <ListRow key={m.id} icon={meterIcon(m.type)} title={meterTypeLabel(m.type)}
              subtitle={`Nr. ${m.number}${last ? ` · Stand ${fmtVal(last.value)} (${dateDE(last.date)})` : ' · noch kein Stand'}${used !== null ? ` · ${used >= 0 ? '+' : ''}${fmtVal(used)} seit ${dateDE(prev.date)}` : ''}`}
              onPress={() => navigation.navigate('MeterDetail', { id: m.id })} />
          );
        })}
      </Section>
      <DocumentsSection ownerKind="unit" ownerId={u.id} navigation={navigation} />
    </Screen>
  );
}
