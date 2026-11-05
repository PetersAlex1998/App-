import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, Button, ChipField, DateField, EmptyState, Field, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { dateDE, eur, num, today } from '../calc';
import { DepositRow, DepositStatus, RETURN_USUAL_DAYS, depositOverview, depositRow, returnDeadline } from '../deposit';
import { depositSettlement } from '../moveOut';
import { type } from '../theme';

const LABEL: Record<DepositStatus, string> = { fehlt: 'Fehlt', teilweise: 'Teilweise gezahlt', gehalten: 'Gehalten', rueckzahlung: 'Rückzahlung offen', zurueck: 'Zurückgezahlt' };
const TONE: Record<DepositStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = { fehlt: 'danger', teilweise: 'warn', gehalten: 'ok', rueckzahlung: 'warn', zurueck: 'neutral' };

const Title = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{children}</Text>;
};

const rowSub = (db: any, r: DepositRow) => `${r.unit ? db.properties.find((p: any) => p.id === r.unit!.propertyId)?.name + ' · ' + r.unit.name : ''}${r.status === 'rueckzahlung' ? ` · ausgezogen ${dateDE(r.tenant.moveOut)}` : ''}`;

/** Alle Kautionen im Überblick: was gehalten wird, was fehlt, was zurückzuzahlen ist. */
export function Kautionen({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const o = depositOverview(db);
  const group = (title: string, rows: DepositRow[]) => rows.length > 0 && (
    <Section title={title}>
      {rows.map((r) => (
        <ListRow key={r.tenant.id} icon="wallet-outline" title={r.tenant.name} subtitle={rowSub(db, r)} right={eur(r.status === 'zurueck' ? r.tenant.depositReturned!.amount : r.status === 'fehlt' ? r.agreed : r.held)} rightSub={LABEL[r.status]}
          onPress={() => navigation.navigate('Kaution', { tenantId: r.tenant.id })} />
      ))}
    </Section>
  );
  const byStatus = (s: DepositStatus) => o.rows.filter((r) => r.status === s);
  return (
    <Screen>
      <Title>Kautionen</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Vereinbart, gezahlt, angelegt und zurückgezahlt. Die Kaution gehört nicht in dein Vermögen: Sie muss getrennt angelegt werden (§ 551 BGB).</Text>
      <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18 }}>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>Gehaltene Kautionen inkl. Zinsen</Text>
        <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{eur(o.held)}</Text>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>{o.toReturn.length} Rückzahlung{o.toReturn.length === 1 ? '' : 'en'} offen · {o.missing.length} Kaution{o.missing.length === 1 ? '' : 'en'} unvollständig{o.notPlaced.length ? ` · ${o.notPlaced.length} ohne Anlage` : ''}</Text>
      </View>
      {o.rows.length === 0 && <EmptyState icon="wallet-outline" title="Noch keine Kautionen" text="Trage beim Mieter die vereinbarte Kaution ein und erfasse die Zahlung." />}
      {group('Rückzahlung offen', byStatus('rueckzahlung'))}
      {group('Kaution fehlt', [...byStatus('fehlt'), ...byStatus('teilweise')])}
      {group('Gehalten', byStatus('gehalten'))}
      {group('Zurückgezahlt', byStatus('zurueck'))}
    </Screen>
  );
}

/** Kaution eines Mieters: Hinterlegung, Zinsen und Rückzahlung. */
export function Kaution({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const t = db.tenants.find((x) => x.id === route.params?.tenantId);
  const unit = t ? db.units.find((u) => u.id === t.unitId) : undefined;
  const [art, setArt] = useState(t?.depositType ?? '');
  const [konto, setKonto] = useState(t?.depositAccount ?? '');
  const [placed, setPlaced] = useState(t?.depositPlaced ?? '');
  const [zins, setZins] = useState(t?.depositInterest ? String(t.depositInterest).replace('.', ',') : '');
  const [retDate, setRetDate] = useState(today());
  const [retAmount, setRetAmount] = useState('');
  const [retNote, setRetNote] = useState('');
  if (!t || !unit) return <Screen><EmptyState icon="help-circle" title="Mieter nicht gefunden" text="Öffne die Kaution aus der Kautionsübersicht oder beim Mieter." /></Screen>;
  const r = depositRow(db, t) ?? { agreed: t.deposit || 0, paid: 0, interest: t.depositInterest || 0, held: 0, status: 'fehlt' as DepositStatus, ended: false, daysSinceMoveOut: 0, tooHigh: false, notPlaced: false, maxAllowed: 0 };
  const k = depositSettlement(db, t, unit);
  const ended = !!t.moveOut && t.moveOut < today();
  const suggestion = String(k.refund).replace('.', ',');

  const saveInfo = () => {
    save('tenants', { ...t, depositType: art, depositAccount: konto.trim(), depositPlaced: placed || undefined, depositInterest: num(zins) || undefined });
    notify('Gespeichert.');
  };
  const giveBack = () => {
    const amount = num(retAmount || suggestion);
    if (!(amount >= 0)) return notify('Bitte den zurückgezahlten Betrag eingeben.');
    confirm('Rückzahlung erfassen?', () => save('tenants', { ...t, depositReturned: { date: retDate, amount, note: retNote.trim() || undefined } }), 'Erfassen', `${eur(amount)} am ${dateDE(retDate)} an ${t.name}. Die Kaution gilt danach als zurückgezahlt.`);
  };
  const undo = () => confirm('Rückzahlung rückgängig machen?', () => save('tenants', { ...t, depositReturned: undefined }), 'Rückgängig');

  return (
    <Screen>
      <Title>Kaution</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{t.name} · {unit.name}</Text>
      <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.text, fontSize: type.headline, fontWeight: '700' }}>{eur(r.paid)} von {eur(r.agreed)}</Text>
          <Badge text={LABEL[r.status]} tone={TONE[r.status]} />
        </View>
        {r.interest > 0 && <Text style={{ color: c.muted, fontSize: type.subhead }}>Zinsen {eur(r.interest)} · insgesamt {eur(r.paid + r.interest)}</Text>}
      </View>
      {r.tooHigh && <Note>Die vereinbarte Kaution liegt über drei Nettokaltmieten ({eur(r.maxAllowed)}). Das übersteigt die Grenze des § 551 Abs. 1 BGB. Der übersteigende Teil ist unwirksam.</Note>}
      {r.notPlaced && <Note>Die Kaution ist noch nicht als getrennt angelegt vermerkt. Lege sie auf einem Treuhand- oder Sparkonto an und trage das Datum unten ein (§ 551 Abs. 3 BGB).</Note>}
      {r.status !== 'zurueck' && r.paid < r.agreed - 0.005 && !ended && <Note>Der Mieter darf die Kaution in drei gleichen Monatsraten zahlen, die erste zu Mietbeginn (§ 551 Abs. 2 BGB).</Note>}

      <Section title="Zahlungen">
        <ListRow icon="add-circle-outline" title="Kautionszahlung erfassen" subtitle={r.paid ? `Bisher ${eur(r.paid)}` : 'Noch nichts eingegangen'} onPress={() => navigation.navigate('PaymentForm', { tenantId: t.id, kind: 'kaution' })} />
        <ListRow icon="document-text-outline" title="Kautionsquittung erstellen" onPress={() => navigation.navigate('VorlageForm', { templateId: 'kautionsquittung', tenantId: t.id, unitId: unit.id })} />
      </Section>

      <Section title="Hinterlegung und Zinsen">
        <ChipField label="Art" value={art} options={['Barkaution', 'Kautionskonto', 'Bürgschaft']} onChange={setArt} />
        <Field label="Konto oder Bürgschaft" value={konto} onChangeText={setKonto} placeholder="z. B. IBAN oder Bürgschaftsnummer" />
        <DateField label="Getrennt angelegt am" value={placed} onChange={setPlaced} optional />
        <Field label="Aufgelaufene Zinsen" value={zins} onChangeText={setZins} keyboard="numeric" suffix="€" hint="Zinsen gehören dem Mieter und werden bei der Rückzahlung mit ausgezahlt." />
        <View style={{ padding: 12 }}><Button icon="checkmark" title="Speichern" onPress={saveInfo} /></View>
      </Section>

      {t.depositReturned ? (
        <Section title="Rückzahlung">
          <ListRow icon="checkmark-circle" iconTone="ok" title={`${eur(t.depositReturned.amount)} zurückgezahlt`} subtitle={`am ${dateDE(t.depositReturned.date)}${t.depositReturned.note ? ` · ${t.depositReturned.note}` : ''}`} />
          <View style={{ padding: 12 }}><Button kind="plain" title="Rückzahlung rückgängig machen" onPress={undo} /></View>
        </Section>
      ) : (
        <Section title="Rückzahlung" footer={ended ? `Üblich ist die Rückzahlung innerhalb von bis zu ${RETURN_USUAL_DAYS / 30} Monaten nach dem Auszug (bis ${dateDE(returnDeadline(t))}). Eine feste gesetzliche Frist gibt es nicht.` : 'Die Rückzahlung kommt nach dem Auszug. Öffne dazu den Mieterwechsel.'}>
          {ended && (
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={{ color: c.text, fontSize: type.body }}>Kaution {eur(k.paid)}{k.interest ? ` + Zinsen ${eur(k.interest)}` : ''}</Text>
              <Text style={{ color: c.text, fontSize: type.body }}>offene Mieten − {eur(k.openRent)}</Text>
              {k.nkKnown && <Text style={{ color: c.text, fontSize: type.body }}>Nebenkosten {k.year} − {eur(k.nkClaim)}</Text>}
              <Text style={{ color: c.text, fontSize: type.body, fontWeight: '700' }}>Rückzahlbar {eur(k.refund)}</Text>
            </View>
          )}
          <ListRow icon="calculator-outline" title="Kautionsabrechnung erstellen" subtitle="Schreiben mit Verrechnung" onPress={() => navigation.navigate('VorlageForm', { templateId: 'kautionsabrechnung', tenantId: t.id, unitId: unit.id })} />
          {ended && (
            <>
              <DateField label="Zurückgezahlt am" value={retDate} onChange={setRetDate} />
              <Field label="Betrag" value={retAmount} onChangeText={setRetAmount} placeholder={suggestion} keyboard="numeric" suffix="€" />
              <Field label="Notiz" value={retNote} onChangeText={setRetNote} placeholder="optional, z. B. Überweisung vom …" />
              <View style={{ padding: 12 }}><Button icon="cash-outline" title="Rückzahlung erfassen" onPress={giveBack} /></View>
            </>
          )}
        </Section>
      )}
    </Screen>
  );
}
