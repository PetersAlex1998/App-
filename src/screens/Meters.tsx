import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { Badge, Button, DateField, EmptyState, Field, Gap, ListRow, Note, OptionRow, Screen, Section, confirm, useColors } from '../ui';
import { METER_TYPES, fmtVal, latestReading, meterIcon, meterLabel, meterTypeLabel, meterUnitLabel, readingsOf } from '../meters';
import { dateDE, num, today } from '../calc';
import { type } from '../theme';
import { Meter, MeterType } from '../types';

type Errors = Record<string, string>;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

function HeaderAction({ navigation, label, onPress }: { navigation: any; label: string; onPress: () => void }) {
  const c = useColors();
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={{ paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.primary, fontSize: type.body, fontWeight: '600' }}>{label}</Text>
      </Pressable>) });
  });
  return null;
}

/* ───────── Zähler anlegen / bearbeiten ───────── */
export function MeterForm({ route, navigation }: any) {
  const { db, save, remove } = useStore();
  const old = db.meters.find((m) => m.id === route.params?.id);
  const propertyId: string = old?.propertyId ?? route.params.propertyId;
  const units = db.units.filter((u) => u.propertyId === propertyId);
  const [mtype, setMtype] = useState<MeterType>(old?.type ?? 'wasser_kalt');
  const [unitId, setUnitId] = useState(old ? old.unitId : route.params?.unitId ?? units[0]?.id ?? '');
  const [number, setNumber] = useState(old?.number ?? '');
  const [first, setFirst] = useState('');
  const [firstDate, setFirstDate] = useState(today());
  const [err, setErr] = useState<Errors>({});
  const submit = () => {
    const e: Errors = {};
    if (!number.trim()) e.number = 'Bitte die Zählernummer eingeben (steht auf dem Zähler).';
    if (!old && first.trim() && !isDate(firstDate)) e.firstDate = 'Bitte ein gültiges Datum wählen.';
    setErr(e);
    if (Object.keys(e).length) return;
    const m: Meter = { id: old?.id ?? uid(), propertyId, unitId, type: mtype, number: number.trim() };
    save('meters', m);
    if (!old && first.trim()) save('readings', { id: uid(), meterId: m.id, date: firstDate, value: num(first) });
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Zählerart">
        {METER_TYPES.map((t) => <OptionRow key={t} selected={mtype === t} onPress={() => setMtype(t)} title={meterTypeLabel(t)} subtitle={`Angabe in ${meterUnitLabel(t)}`} />)}
      </Section>
      <Section title="Zugeordnet zu">
        <OptionRow selected={unitId === ''} onPress={() => setUnitId('')} title="Haus allgemein" subtitle="z. B. Hauptzähler oder Allgemeinstrom" />
        {units.map((u) => <OptionRow key={u.id} selected={unitId === u.id} onPress={() => setUnitId(u.id)} title={u.name} />)}
      </Section>
      <Section title="Zähler">
        <Field label="Zählernummer" value={number} onChangeText={setNumber} error={err.number} />
      </Section>
      {!old && (
        <Section title="Erster Stand (optional)" footer="Der erste Stand dient später als Anfangsstand für den Verbrauch.">
          <Field label="Zählerstand" value={first} onChangeText={setFirst} keyboard="numeric" suffix={meterUnitLabel(mtype)} />
          <DateField label="Abgelesen am" value={firstDate} onChange={setFirstDate} error={err.firstDate} />
        </Section>
      )}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Zähler löschen" onPress={() => confirm('Zähler löschen?', () => { remove('meters', old.id); navigation.goBack(); }, 'Löschen', 'Alle Zählerstände dieses Zählers werden ebenfalls gelöscht.')} /></>)}
    </Screen>
  );
}

/* ───────── Zähler-Detail mit Verlauf ───────── */
export function MeterDetail({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const m = db.meters.find((x) => x.id === route.params.id);
  const list = useMemo(() => (m ? readingsOf(db, m.id) : []), [db, m]);
  if (!m) return <Screen><EmptyState icon="help-circle" title="Zähler nicht gefunden" text="Er wurde vermutlich gelöscht." /></Screen>;
  const u = meterUnitLabel(m.type);
  const rows = [...list].reverse();
  return (
    <Screen>
      <HeaderAction navigation={navigation} label="Bearbeiten" onPress={() => navigation.navigate('MeterForm', { id: m.id })} />
      <View style={{ marginBottom: 16, marginTop: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.4 }}>{meterTypeLabel(m.type)}</Text>
        <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 2 }}>{meterLabel(db, m)} · Nr. {m.number}</Text>
      </View>
      <Button icon="add" title="Stand hinzufügen" onPress={() => navigation.navigate('ReadingForm', { meterId: m.id })} />
      <Gap h={22} />
      <Section title="Verlauf">
        {rows.length === 0 && <Note>Noch keine Stände erfasst.</Note>}
        {rows.map((r, i) => {
          const prev = rows[i + 1];
          const diff = prev ? r.value - prev.value : null;
          return (
            <ListRow key={r.id} icon="speedometer-outline" title={`${fmtVal(r.value)} ${u}`} subtitle={dateDE(r.date)}
              right={diff === null ? undefined : `${diff >= 0 ? '+' : ''}${fmtVal(diff)} ${u}`} rightColor={diff !== null && diff < 0 ? c.danger : undefined}
              rightSub={diff === null ? 'Anfangsstand' : 'Verbrauch'} onPress={() => navigation.navigate('ReadingForm', { id: r.id })} />
          );
        })}
      </Section>
    </Screen>
  );
}

/* ───────── Einzelnen Stand erfassen ───────── */
export function ReadingForm({ route, navigation }: any) {
  const { db, save, remove } = useStore();
  const old = db.readings.find((r) => r.id === route.params?.id);
  const meter = db.meters.find((m) => m.id === (old?.meterId ?? route.params.meterId));
  const [value, setValue] = useState(old ? String(old.value) : '');
  const [date, setDate] = useState(old?.date ?? today());
  const [err, setErr] = useState<Errors>({});
  if (!meter) return <Screen><EmptyState icon="help-circle" title="Zähler nicht gefunden" text="" /></Screen>;
  const u = meterUnitLabel(meter.type);
  const submit = () => {
    const e: Errors = {};
    if (!value.trim()) e.value = 'Bitte den Zählerstand eingeben.';
    if (!isDate(date)) e.date = 'Bitte ein gültiges Datum wählen.';
    const prev = readingsOf(db, meter.id).filter((r) => r.id !== old?.id && r.date <= date).slice(-1)[0];
    if (!e.value && prev && num(value) < prev.value) e.value = `Der Stand ist kleiner als der vorherige (${fmtVal(prev.value)} ${u} am ${dateDE(prev.date)}). Bei einem Zählertausch lege einen neuen Zähler an.`;
    setErr(e);
    if (Object.keys(e).length) return;
    save('readings', { id: old?.id ?? uid(), meterId: meter.id, date, value: num(value) });
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title={meterLabel(db, meter)}>
        <Field label="Zählerstand" value={value} onChangeText={setValue} keyboard="numeric" suffix={u} error={err.value} />
        <DateField label="Abgelesen am" value={date} onChange={setDate} error={err.date} />
      </Section>
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Stand löschen" onPress={() => confirm('Stand löschen?', () => { remove('readings', old.id); navigation.goBack(); })} /></>)}
    </Screen>
  );
}

/* ───────── Ablesung: alle Zähler eines Hauses auf einmal ───────── */
export function Ablesung({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const propertyId: string = route.params.propertyId;
  const meters = db.meters.filter((m) => m.propertyId === propertyId).sort((a, b) => (a.unitId === b.unitId ? a.type.localeCompare(b.type) : (db.units.find((x) => x.id === a.unitId)?.name ?? '').localeCompare(db.units.find((x) => x.id === b.unitId)?.name ?? '', 'de', { numeric: true })));
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Errors>({});
  const filled = meters.filter((m) => (vals[m.id] ?? '').trim());

  const submit = () => {
    const e: Errors = {};
    if (!isDate(date)) e.date = 'Bitte ein gültiges Datum wählen.';
    for (const m of filled) {
      const prev = readingsOf(db, m.id).filter((r) => r.date <= date).slice(-1)[0];
      if (prev && num(vals[m.id]) < prev.value) e[m.id] = `Kleiner als der letzte Stand (${fmtVal(prev.value)})`;
    }
    setErr(e);
    if (Object.keys(e).length) return;
    filled.forEach((m) => save('readings', { id: uid(), meterId: m.id, date, value: num(vals[m.id]) }));
    navigation.goBack();
  };
  if (meters.length === 0) return <Screen><EmptyState icon="speedometer" title="Noch keine Zähler" text="Lege zuerst Zähler an." actionLabel="Zähler anlegen" onAction={() => navigation.replace('MeterForm', { propertyId })} /></Screen>;
  return (
    <Screen>
      <Section title="Ablesedatum" footer="Für die Jahresabrechnung am besten zum Jahreswechsel (31.12.) ablesen.">
        <DateField label="Abgelesen am" value={date} onChange={setDate} error={err.date} />
      </Section>
      <Section title={`Zählerstände (${filled.length} von ${meters.length} eingetragen)`}>
        {meters.map((m) => {
          const last = latestReading(db, m.id);
          return (
            <Field key={m.id} label={`${meterLabel(db, m)} · Nr. ${m.number}`} value={vals[m.id] ?? ''} onChangeText={(v) => setVals({ ...vals, [m.id]: v })} keyboard="numeric" suffix={meterUnitLabel(m.type)}
              error={err[m.id]} hint={last ? `Letzter Stand: ${fmtVal(last.value)} am ${dateDE(last.date)}` : 'Noch kein Stand'} />
          );
        })}
      </Section>
      <Button icon="checkmark" title={filled.length ? `${filled.length} Stände speichern` : 'Nichts eingetragen'} onPress={submit} disabled={filled.length === 0} />
      <Gap h={8} />
      <Text style={{ color: c.muted, fontSize: type.footnote, textAlign: 'center' }}>Leere Felder werden übersprungen.</Text>
    </Screen>
  );
}
