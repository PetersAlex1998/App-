import React, { useLayoutEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { Avatar, Badge, Button, EmptyState, Gap, ListRow, Note, Row, Screen, Section, Segmented, Stat, StatGrid, confirm, infoRows, notify, useColors } from '../ui';
import { CoverEmpty, CoverHero, DocumentsSection } from './Documents';
import { expiryState } from '../docs';
import { defaultUnitName, houseId, unitLetter, unitRef } from '../ids';
import { kindText, sourceLabel, sourceTone } from '../payments';
import { Platform } from 'react-native';
import { addDays, dateDE, dueMonths, eur, initials, kindLabel, kindOf, monthLabel, unitDue, nkStatement, openItems, reminderLabel, today, totalOpen } from '../calc';
import { exportPdf, nkHtml, reminderHtml } from '../pdf';
import { nkModel, reminderModel } from '../letters';
import { storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { useSettings } from '../settings';
import { dunningPlans, feeFor, makeReminder, overdueItems, relevantReminders } from '../dunning';
import { type } from '../theme';
import { fmtVal, latestReading, meterIcon, meterLabel, meterTypeLabel, meterUnitLabel } from '../meters';


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

      <Section title="Zähler" action={{ label: '+ Hinzufügen', onPress: () => navigation.navigate('MeterForm', { propertyId: p.id }) }}
        footer={meters.length ? 'Die Verbrauchswerte fließen in die Nebenkostenabrechnung ein, wenn eine Kostenposition „nach Verbrauch“ verteilt wird.' : undefined}>
        {meters.length === 0 && <Note>Noch keine Zähler. Lege Wasser-, Heiz- oder Stromzähler an, um nach Verbrauch abzurechnen.</Note>}
        {meters.map((m) => {
          const last = latestReading(db, m.id);
          return <ListRow key={m.id} icon={meterIcon(m.type)} title={meterLabel(db, m)} subtitle={`Nr. ${m.number}${last ? ` · Stand ${fmtVal(last.value)} ${meterUnitLabel(m.type)} (${dateDE(last.date)})` : ' · noch kein Stand'}`} onPress={() => navigation.navigate('MeterDetail', { id: m.id })} />;
        })}
      </Section>
      {meters.length > 0 && <><Button kind="secondary" icon="create-outline" title="Zählerstände erfassen" onPress={() => navigation.navigate('Ablesung', { propertyId: p.id })} /><Gap h={22} /></>}

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
  const createReminder = () => {
    if (!unit || !prop) return;
    const plan = dunningPlans(db, cfg).find((p) => p.tenant.id === t.id);
    if (!plan) return notify('Aktuell ist keine Miete überfällig. Die Miete des laufenden Monats gilt erst nach Fälligkeit und Karenz als überfällig.');
    confirm(`${reminderLabel(plan.level)} erstellen?`, async () => {
      const r = makeReminder(uid(), plan, cfg);
      save('reminders', r);
      if (filesSupported()) {
        const [doc] = await storeLetters([{ model: reminderModel(db, r, t, unit, prop, cfg), tenant: t, note: `Mahnung Stufe ${r.level}` }]);
        save('documents', doc);
        navigation.navigate('Outbox');
        return;
      }
      await exportPdf(reminderHtml(db, r, t, unit, prop, cfg));
    }, 'Erstellen', `Überfällig: ${eur(plan.open)}${plan.fee ? ` · Mahngebühr ${eur(plan.fee)}` : ''}. Frist: ${cfg.deadlineDays} Tage. Der Brief liegt danach als PDF im Briefausgang.`);
  };
  const createNk = async () => {
    if (!unit || !prop || !nk) return;
    if (nk.lines.length === 0) return notify(`Für ${year} sind noch keine Betriebskosten erfasst. Trage sie im Objekt ein.`);
    save('tenants', { ...t, nkDone: { ...(t.nkDone ?? {}), [String(year)]: today() } });
    if (filesSupported()) {
      const [doc] = await storeLetters([{ model: nkModel(nk, t, unit, prop, year, cfg), tenant: t, note: `Nebenkosten ${year}` }]);
      save('documents', doc);
      navigation.navigate('Outbox');
      return;
    }
    await exportPdf(nkHtml(nk, t, unit, prop, year, cfg));
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
      {dueNow.length > 0 && !ended && <><Button kind="destructive" icon="document-text" title={`${reminderLabel(nextLevel)} erstellen`} onPress={createReminder} /><Gap h={22} /></>}

      {(() => {
        const pays = db.payments.filter((p) => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        const paidRent = pays.filter((p) => p.kind === 'miete').reduce((s2, p) => s2 + p.amount, 0);
        const soll = unit ? dueMonths(t).length * unitDue(unit) : 0;
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
        <Row left="Kaltmiete" right={unit ? eur(unit.coldRent) : '–'} />
        <Row left="NK-Vorauszahlung" right={unit ? eur(unit.advance) : '–'} />
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
  const { db } = useStore();
  const c = useColors();
  const u = db.units.find((x) => x.id === route.params.id);
  useHeaderAction(navigation, 'Bearbeiten', () => u && navigation.navigate('UnitForm', { id: u.id }));
  if (!u) return <Screen><EmptyState icon="help-circle" title="Einheit nicht gefunden" text="Sie wurde vermutlich gelöscht." /></Screen>;
  const prop = db.properties.find((p) => p.id === u.propertyId);
  const tenant = db.tenants.find((t) => t.unitId === u.id && (!t.moveOut || t.moveOut >= today()));
  const meters = db.meters.filter((m) => m.unitId === u.id);
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
        <Stat label="Kaltmiete" value={eur(u.coldRent)} icon="pricetag-outline" />
      </StatGrid>
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
      <Section title="Mieter">
        {tenant ? <ListRow avatar={initials(tenant.name)} title={tenant.name} subtitle={`seit ${dateDE(tenant.moveIn)}`} onPress={() => navigation.navigate('TenantDetail', { id: tenant.id })} />
          : <ListRow icon="key-outline" iconTone="warn" title="Leerstand" subtitle="Mieter hinzufügen" onPress={() => navigation.navigate('TenantForm', { unitId: u.id })} />}
      </Section>
      {(() => {
        const past = db.tenants.filter((t) => t.unitId === u.id && t.id !== tenant?.id).sort((a, b) => (b.moveIn || b.moveOut).localeCompare(a.moveIn || a.moveOut));
        if (!past.length) return null;
        return (
          <Section title={`Mieterhistorie (${past.length})`} footer="Frühere Mieter dieser Wohnung, der neueste zuerst. Offene Posten zählen für sie nicht mehr.">
            {past.map((t) => (
              <ListRow key={t.id} avatar={initials(t.name)} title={t.name}
                subtitle={`${t.moveIn ? dateDE(t.moveIn) : 'Einzug unbekannt'} – ${t.moveOut ? dateDE(t.moveOut) : 'heute'}${t.coldRent ? ` · Kaltmiete ${eur(t.coldRent)}` : ''}`}
                onPress={() => navigation.navigate('TenantDetail', { id: t.id })} />
            ))}
          </Section>
        );
      })()}
      {(() => {
        const rows = infoRows([['Etage', u.floor], ['Lage', u.position], ['Balkon / Terrasse', u.balcony], ['Keller', u.cellar], ['Stellplatz', u.parking], ['Küche', u.kitchen], ['Ausstattung', u.equipment], ['Notizen', u.notes]]);
        return rows.length ? <Section title="Lage und Ausstattung">{rows}</Section> : null;
      })()}
      {meters.length > 0 && (
        <Section title="Zähler">
          {meters.map((m) => <ListRow key={m.id} icon={meterIcon(m.type)} title={meterTypeLabel(m.type)} subtitle={`Nr. ${m.number}${latestReading(db, m.id) ? ` · Stand ${fmtVal(latestReading(db, m.id)!.value)} ${meterUnitLabel(m.type)}` : ''}`} onPress={() => navigation.navigate('MeterDetail', { id: m.id })} />)}
        </Section>
      )}
      <DocumentsSection ownerKind="unit" ownerId={u.id} navigation={navigation} />
    </Screen>
  );
}
