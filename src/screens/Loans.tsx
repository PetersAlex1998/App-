import { BIG_MONEY, MAX_AREA, tooBig } from '../inputs';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { Badge, Button, ChipField, DateField, EmptyState, Field, Gap, ListRow, Note, Screen, Section, Segmented, notify, useColors } from '../ui';
import { dateDE, eur, num, today } from '../calc';
import { houseId } from '../ids';
import { balanceAt, balanceAtFixedEnd, interestInYear, isPaidOff, monthlyPayment, monthsToFixedEnd, payoffMonth, principalInYear, propertyDebt, schedule } from '../loans';
import { type } from '../theme';
import { Loan } from '../types';

const propLabel = (p: { houseNo?: number; name: string }) => `${p.houseNo ? houseId(p) + ' ' : ''}${p.name}`;
const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`;
const monthText = (m: string) => `${m.slice(5)}.${m.slice(0, 4)}`;
const Title = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{children}</Text>;
};

/** Alle Darlehen: Restschuld, Zinsen, Kapitaldienst und Ende der Zinsbindung. */
export function Darlehen({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const year = new Date().getFullYear();
  const only: string | undefined = route.params?.propertyId;
  const props = db.properties.filter((p) => (!only || p.id === only) && db.loans.some((l) => l.propertyId === p.id));
  const active = db.loans.filter((l) => (!only || l.propertyId === only) && !isPaidOff(l));
  const debt = active.reduce((a, l) => a + balanceAt(l), 0);
  const rate = active.reduce((a, l) => a + monthlyPayment(l), 0);
  const interest = active.reduce((a, l) => a + interestInYear(l, year), 0);
  const soon = active.map((l) => ({ l, m: monthsToFixedEnd(l) })).filter((x) => x.m !== null && x.m <= 24).sort((a, b) => a.m! - b.m!)[0];
  return (
    <Screen>
      <Title>Darlehen</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Restschuld, Zinsen und Zinsbindung pro Haus. Die Zinsen fließen in die Auswertung für die Steuer ein.</Text>
      {active.length > 0 && (
        <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18, gap: 2 }}>
          <Text style={{ color: c.muted, fontSize: type.subhead }}>Restschuld heute</Text>
          <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{eur(debt)}</Text>
          <Text style={{ color: c.muted, fontSize: type.subhead }}>Raten {eur(rate)} pro Monat · Zinsen {year} ca. {eur(interest)}</Text>
          {soon && <Text style={{ color: c.warn, fontSize: type.subhead, fontWeight: '600', marginTop: 4 }}>Zinsbindung „{soon.l.name}“ endet {soon.m! < 0 ? 'bereits' : soon.m === 0 ? 'diesen Monat' : `in ${soon.m} Monat${soon.m === 1 ? '' : 'en'}`} ({dateDE(soon.l.fixedUntil!)})</Text>}
        </View>
      )}
      {db.loans.length === 0 && <EmptyState icon="cash-outline" title="Noch keine Darlehen" text="Erfasse ein Darlehen mit Betrag, Zins und Tilgung. Die App rechnet Restschuld und Zinsen aus." actionLabel="Darlehen anlegen" onAction={() => navigation.navigate('LoanForm', { propertyId: only ?? db.properties[0]?.id })} />}
      {props.map((p) => {
        const d = propertyDebt(db, p.id);
        return (
          <Section key={p.id} title={propLabel(p)} footer={d.coverage !== null ? `Die Kaltmiete der vermieteten Wohnungen (${eur(d.rentYear)} pro Jahr) deckt den Kapitaldienst (${eur(d.service)}) zu ${Math.round(d.coverage * 100)} %. Das ist vor Betriebskosten, Instandhaltung und Leerstand.` : undefined}>
            {db.loans.filter((l) => l.propertyId === p.id).map((l) => {
              const paid = isPaidOff(l);
              const m = monthsToFixedEnd(l);
              return <ListRow key={l.id} icon="cash-outline" title={l.name || 'Darlehen'} subtitle={`${pct(l.rate)} · Rate ${eur(monthlyPayment(l))}${l.fixedUntil ? ` · gebunden bis ${monthText(l.fixedUntil.slice(0, 7))}` : ''}`}
                right={paid ? 'getilgt' : eur(balanceAt(l))} rightSub={paid ? undefined : 'Restschuld'} badge={!paid && m !== null && m <= 12 ? { text: m < 0 ? 'Zinsbindung abgelaufen' : 'Zinsbindung endet bald', tone: 'warn' } : undefined}
                onPress={() => navigation.navigate('LoanDetail', { id: l.id })} />;
            })}
          </Section>
        );
      })}
      {db.properties.length > 0 && db.loans.length > 0 && <Button icon="add" kind="secondary" title="Darlehen hinzufügen" onPress={() => navigation.navigate('LoanForm', { propertyId: only ?? db.properties[0].id })} />}
      <Gap h={14} />
      <Note>Die Werte sind berechnet. Maßgeblich sind Darlehensvertrag, Jahreskontoauszug und Zinsbescheinigung der Bank. Trage zur Genauigkeit die Restschuld laut Bank ein.</Note>
    </Screen>
  );
}

/** Ein Darlehen: Kennzahlen, Jahresübersicht und Tilgungsplan. */
export function LoanDetail({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const l = db.loans.find((x) => x.id === route.params?.id);
  const [all, setAll] = useState(false);
  useEffect(() => { if (!l) navigation.goBack(); }, [l]);
  if (!l) return <Screen><EmptyState icon="help-circle" title="Darlehen nicht gefunden" text="Es wurde vermutlich gelöscht." /></Screen>;
  const p = db.properties.find((x) => x.id === l.propertyId);
  const rows = schedule(l);
  const years = [...new Set(rows.map((r) => Number(r.month.slice(0, 4))))];
  const end = payoffMonth(l);
  const m = monthsToFixedEnd(l);
  const fixedBal = balanceAtFixedEnd(l);
  const shown = all ? years : years.filter((y) => y >= new Date().getFullYear() - 1 && y <= new Date().getFullYear() + 5);
  const bad = monthlyPayment(l) <= (l.amount * l.rate) / 1200 && !end;
  return (
    <Screen>
      <Title>{l.name || 'Darlehen'}</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{p ? propLabel(p) : ''}</Text>
      <Section>
        <ListRow icon="cash-outline" title="Restschuld heute" right={eur(balanceAt(l))} />
        <ListRow icon="repeat-outline" title="Rate pro Monat" subtitle={`${pct(l.rate)} Zins${l.repayment ? ` · ${pct(l.repayment)} Tilgung` : ''}`} right={eur(monthlyPayment(l))} />
        <ListRow icon="calendar-outline" title="Voraussichtlich getilgt" right={end ? monthText(end) : '–'} />
        {l.fixedUntil && <ListRow icon="lock-closed-outline" title="Zinsbindung bis" subtitle={fixedBal !== null ? `Restschuld dann ca. ${eur(fixedBal)} – das muss neu finanziert werden` : undefined} right={monthText(l.fixedUntil.slice(0, 7))} rightSub={m !== null ? (m < 0 ? 'abgelaufen' : `in ${m} Mon.`) : undefined} />}
      </Section>
      {bad && <Note>Die Rate deckt nicht einmal die Zinsen. Das Darlehen würde nie getilgt. Prüfe Rate oder Tilgung.</Note>}
      <Section title="Pro Jahr" footer="Zinsen sind die Werbungskosten (Anlage V).">
        {shown.map((y) => <ListRow key={y} title={String(y)} subtitle={`Tilgung ${eur(principalInYear(l, y))}`} right={eur(interestInYear(l, y))} rightSub="Zinsen" />)}
        {years.length > shown.length && <ListRow icon="chevron-down" title="Alle Jahre anzeigen" onPress={() => setAll(true)} />}
      </Section>
      {l.anchor && <Note>Berechnet ab {dateDE(l.anchor.date)} mit der Restschuld {eur(l.anchor.balance)} laut Bank.</Note>}
      <Button icon="create-outline" kind="secondary" title="Bearbeiten" onPress={() => navigation.navigate('LoanForm', { id: l.id })} />
    </Screen>
  );
}

export function LoanForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const del = useDelete();
  const old = db.loans.find((l) => l.id === route.params?.id);
  const [propertyId, setPropertyId] = useState<string>(old?.propertyId ?? route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [name, setName] = useState(old?.name ?? '');
  const [amount, setAmount] = useState(old ? String(old.amount).replace('.', ',') : '');
  const [rate, setRate] = useState(old ? String(old.rate).replace('.', ',') : '');
  const [mode, setMode] = useState<'tilgung' | 'rate'>(old?.payment ? 'rate' : 'tilgung');
  const [repay, setRepay] = useState(old?.repayment ? String(old.repayment).replace('.', ',') : '');
  const [pay, setPay] = useState(old?.payment ? String(old.payment).replace('.', ',') : '');
  const [start, setStart] = useState(old?.start ?? today());
  const [fixed, setFixed] = useState(old?.fixedUntil ?? '');
  const [anchorDate, setAnchorDate] = useState(old?.anchor?.date ?? '');
  const [anchorBal, setAnchorBal] = useState(old?.anchor ? String(old.anchor.balance).replace('.', ',') : '');
  const [specials, setSpecials] = useState(old?.specials ?? []);
  const [sDate, setSDate] = useState(today());
  const [sAmount, setSAmount] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const labels = db.properties.map(propLabel);

  const addSpecial = () => {
    if (!(num(sAmount) > 0)) return notify('Bitte den Betrag der Sondertilgung eingeben.');
    setSpecials([...specials, { date: sDate, amount: num(sAmount) }].sort((a, b) => a.date.localeCompare(b.date)));
    setSAmount('');
  };
  const submit = () => {
    const e: Record<string, string> = {};
    if (!propertyId) e.property = 'Bitte ein Haus wählen.';
    if (!(num(amount) > 0)) e.amount = 'Bitte den Darlehensbetrag eingeben.';
    else if (tooBig(num(amount))) e.amount = BIG_MONEY;
    if (!(num(rate) >= 0) || rate.trim() === '') e.rate = 'Bitte den Sollzins eingeben (z. B. 3,5).';
    else if (num(rate) > 25) e.rate = 'Der Zins wirkt zu hoch. Bitte in Prozent pro Jahr angeben.';
    if (mode === 'tilgung' && !(num(repay) > 0)) e.repay = 'Bitte die anfängliche Tilgung in Prozent eingeben.';
    if (mode === 'rate' && !(num(pay) > 0)) e.pay = 'Bitte die monatliche Rate eingeben.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) e.start = 'Bitte ein Datum wählen.';
    if (fixed && fixed < start) e.fixed = 'Die Zinsbindung endet nach dem Start.';
    if (anchorDate || anchorBal) { if (!anchorDate || !(num(anchorBal) >= 0) || anchorBal.trim() === '') e.anchor = 'Bitte Datum und Restschuld laut Bank eintragen.'; }
    setErr(e);
    if (Object.keys(e).length) return;
    const loan: Loan = { id: old?.id ?? uid(), propertyId, name: name.trim(), amount: num(amount), start, rate: num(rate), repayment: mode === 'tilgung' ? num(repay) : undefined, payment: mode === 'rate' ? num(pay) : undefined, fixedUntil: fixed || undefined, anchor: anchorDate ? { date: anchorDate, balance: num(anchorBal) } : undefined, specials: specials.length ? specials : undefined };
    save('loans', loan);
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Darlehen">
        {db.properties.length > 1 && <ChipField label="Haus" value={propLabel(db.properties.find((p) => p.id === propertyId) ?? { name: '' })} options={labels} onChange={(v) => { const p = db.properties[labels.indexOf(v)]; if (p) setPropertyId(p.id); }} />}
        <Field label="Bank oder Bezeichnung" value={name} onChangeText={setName} placeholder="z. B. Sparkasse Paderborn, Kauf Westernstr." />
        <Field label="Darlehensbetrag" value={amount} onChangeText={setAmount} keyboard="numeric" suffix="€" error={err.amount} hint="Ursprünglich ausgezahlter Betrag laut Vertrag" />
        <Field label="Sollzins" value={rate} onChangeText={setRate} keyboard="numeric" suffix="% p. a." error={err.rate} />
        <DateField label="Erste Rate am" value={start} onChange={setStart} error={err.start} />
        <DateField label="Zinsbindung bis" value={fixed} onChange={setFixed} error={err.fixed} optional />
      </Section>
      <Section title="Rate" footer="Gib entweder die anfängliche Tilgung oder die feste Monatsrate an, so wie sie im Vertrag steht.">
        <View style={{ padding: 12 }}><Segmented<'tilgung' | 'rate'> value={mode} onChange={setMode} options={[{ label: 'Anfängliche Tilgung', value: 'tilgung' }, { label: 'Feste Monatsrate', value: 'rate' }]} /></View>
        {mode === 'tilgung'
          ? <Field label="Anfängliche Tilgung" value={repay} onChangeText={setRepay} keyboard="numeric" suffix="% p. a." error={err.repay} />
          : <Field label="Rate pro Monat" value={pay} onChangeText={setPay} keyboard="numeric" suffix="€" error={err.pay} />}
      </Section>
      <Section title="Genauer rechnen (empfohlen)" footer="Die Bank nennt die Restschuld zum Jahresende im Kontoauszug. Ab diesem Stand rechnet die App weiter. Zinsen davor sind dann nicht enthalten.">
        <DateField label="Stichtag" value={anchorDate} onChange={setAnchorDate} error={err.anchor} optional />
        <Field label="Restschuld laut Bank" value={anchorBal} onChangeText={setAnchorBal} keyboard="numeric" suffix="€" />
      </Section>
      <Section title="Sondertilgungen" footer={specials.length ? 'Tippe auf einen Eintrag, um ihn zu entfernen.' : undefined}>
        {specials.map((s, i) => <ListRow key={i} icon="close-circle-outline" title={eur(s.amount)} subtitle={dateDE(s.date)} onPress={() => setSpecials(specials.filter((_, j) => j !== i))} />)}
        <DateField label="Datum" value={sDate} onChange={setSDate} />
        <Field label="Betrag" value={sAmount} onChangeText={setSAmount} keyboard="numeric" suffix="€" />
        <View style={{ padding: 12 }}><Button kind="secondary" icon="add" title="Sondertilgung hinzufügen" onPress={addSpecial} /></View>
      </Section>
      {err.property ? <View style={{ marginBottom: 12 }}><Badge text={err.property} tone="danger" /></View> : null}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('loans', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}
