import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { Badge, Button, ChipField, DateField, EmptyState, Field, FilterChips, Gap, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { dateDE, today } from '../calc';
import { PRESETS, checkState, counts, markDone, missingPresets, nextDue, presetOf, sortChecks, CheckStatus } from '../checks';
import { type } from '../theme';
import { Check } from '../types';

const Title = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{children}</Text>;
};
const rel = (days: number | null) => (days === null ? '' : days < 0 ? `seit ${-days} Tag${days === -1 ? '' : 'en'} überfällig` : days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`);
const TONE: Record<CheckStatus, 'danger' | 'warn' | 'ok' | 'neutral'> = { ueberfaellig: 'danger', bald: 'warn', ok: 'ok', unbekannt: 'neutral' };
const LABEL: Record<CheckStatus, string> = { ueberfaellig: 'Überfällig', bald: 'Bald fällig', ok: 'In Ordnung', unbekannt: 'Datum fehlt' };

/** Prüf- und Wartungskalender. */
export function Wartung({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const [house, setHouse] = useState<string>(route.params?.propertyId ?? (db.properties.length === 1 ? db.properties[0].id : ''));
  const k = counts(db, today(), house || undefined);
  const list = sortChecks(db.checks.filter((x) => !house || x.propertyId === house));
  const missing = house ? missingPresets(db, house) : [];
  const groups: { title: string; status: CheckStatus }[] = [{ title: 'Überfällig', status: 'ueberfaellig' }, { title: 'Bald fällig', status: 'bald' }, { title: 'Datum fehlt', status: 'unbekannt' }, { title: 'In Ordnung', status: 'ok' }];
  const add = (key: string) => {
    const p = PRESETS.find((x) => x.key === key)!;
    save('checks', { id: uid(), propertyId: house, title: p.title, preset: p.key, intervalMonths: p.months });
  };
  return (
    <Screen>
      <Title>Prüfungen und Wartung</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Wiederkehrende Fristen je Haus: Heizung, Rauchmelder, Schornsteinfeger, Legionellen und mehr.</Text>
      <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14 }}>
        <Text style={{ color: k.overdue ? c.danger : c.text, fontSize: 30, fontWeight: '800' }}>{k.overdue}</Text>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>überfällig · {k.soon} bald fällig · {k.unknown} ohne Datum · {k.total} insgesamt</Text>
      </View>
      {db.properties.length > 1 && <FilterChips value={house} onChange={setHouse} options={[{ label: 'Alle Häuser', value: '' }, ...db.properties.map((p) => ({ label: p.name, value: p.id }))]} />}
      <Button icon="add" title="Prüfung anlegen" onPress={() => navigation.navigate('CheckForm', { propertyId: house || db.properties[0]?.id })} disabled={db.properties.length === 0} />
      <Gap h={14} />
      {list.length === 0 && <EmptyState icon="calendar-outline" title="Noch keine Prüfungen" text={house ? 'Tippe unten auf einen Vorschlag oder lege eine eigene Prüfung an.' : 'Wähle ein Haus, dann bekommst du passende Vorschläge.'} />}
      {groups.map((g) => {
        const rows = list.filter((x) => checkState(x).status === g.status);
        return rows.length > 0 && (
          <Section key={g.status} title={g.title}>
            {rows.map((x) => {
              const st = checkState(x);
              const p = db.properties.find((y) => y.id === x.propertyId);
              return <ListRow key={x.id} icon={g.status === 'ueberfaellig' ? 'alert-circle' : 'calendar-outline'} iconTone={g.status === 'ueberfaellig' ? 'danger' : g.status === 'bald' ? 'warn' : undefined} title={x.title}
                subtitle={`${house ? '' : (p?.name ?? '') + ' · '}${st.due ? `${dateDE(st.due)} · ${rel(st.days)}` : 'Wann war die letzte Prüfung?'}`} right={`alle ${x.intervalMonths >= 12 && x.intervalMonths % 12 === 0 ? `${x.intervalMonths / 12} J.` : `${x.intervalMonths} M.`}`} onPress={() => navigation.navigate('CheckDetail', { id: x.id })} />;
            })}
          </Section>
        );
      })}
      {missing.length > 0 && (
        <Section title="Vorschläge" footer="Richtwerte. Welche Pflichten für dein Haus gelten, hängt von Anlage, Baujahr und Bundesland ab. Frag im Zweifel den Fachbetrieb oder den Schornsteinfeger.">
          {missing.map((p) => <ListRow key={p.key} icon="add-circle-outline" title={p.title} subtitle={`${p.hint} · alle ${p.months >= 12 && p.months % 12 === 0 ? `${p.months / 12} Jahre` : `${p.months} Monate`}`} onPress={() => add(p.key)} />)}
        </Section>
      )}
    </Screen>
  );
}

export function CheckDetail({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const x = db.checks.find((y) => y.id === route.params?.id);
  const [date, setDate] = useState(today());
  useEffect(() => { if (!x) navigation.goBack(); }, [x]);
  if (!x) return <Screen><EmptyState icon="help-circle" title="Prüfung nicht gefunden" text="Sie wurde vermutlich gelöscht." /></Screen>;
  const st = checkState(x);
  const p = db.properties.find((y) => y.id === x.propertyId);
  const k = db.contractors.find((y) => y.id === x.contractorId);
  const pre = presetOf(x.preset);
  const hist = [...(x.history ?? []), ...(x.last ? [x.last] : [])].filter((d, i, a) => a.indexOf(d) === i).sort().reverse();
  const open = (url: string) => Linking.openURL(url).catch(() => notify('Das konnte nicht geöffnet werden.'));
  const done = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notify('Bitte ein Datum wählen.');
    save('checks', markDone(x, date));
  };
  return (
    <Screen>
      <Title>{x.title}</Title>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}><Badge text={LABEL[st.status]} tone={TONE[st.status]} /></View>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{p?.name}{st.due ? ` · nächster Termin ${dateDE(st.due)} (${rel(st.days)})` : ''}{pre ? `\n${pre.hint}` : ''}</Text>
      <Section title="Erledigt" footer="Danach rechnet die App den nächsten Termin mit dem Intervall aus.">
        <DateField label="Erledigt am" value={date} onChange={setDate} />
        <View style={{ padding: 12 }}><Button icon="checkmark" title="Als erledigt eintragen" onPress={done} /></View>
      </Section>
      {k && (
        <Section title="Handwerker">
          <ListRow icon="person-outline" title={k.name} subtitle={k.trade} onPress={() => navigation.navigate('ContractorForm', { id: k.id })} />
          {k.phone ? <ListRow icon="call-outline" title="Anrufen" subtitle={k.phone} onPress={() => open(`tel:${k.phone.replace(/\s/g, '')}`)} /> : null}
          {k.email ? <ListRow icon="mail-outline" title="E-Mail schreiben" onPress={() => open(`mailto:${k.email}?subject=${encodeURIComponent(`Termin: ${x.title} – ${p?.street ?? ''}`)}`)} /> : null}
        </Section>
      )}
      {hist.length > 0 && <Section title="Bisher erledigt">{hist.map((d) => <ListRow key={d} icon="checkmark-circle" iconTone="ok" title={dateDE(d)} />)}</Section>}
      {x.notes ? <Note>{x.notes}</Note> : null}
      <Button kind="secondary" icon="create-outline" title="Bearbeiten" onPress={() => navigation.navigate('CheckForm', { id: x.id })} />
    </Screen>
  );
}

export function CheckForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const del = useDelete();
  const old = db.checks.find((y) => y.id === route.params?.id);
  const [propertyId, setPropertyId] = useState<string>(old?.propertyId ?? route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [preset, setPreset] = useState<string>(old?.preset ?? '');
  const [title, setTitle] = useState(old?.title ?? '');
  const [months, setMonths] = useState(old ? String(old.intervalMonths) : '12');
  const [last, setLast] = useState(old?.last ?? '');
  const [due, setDue] = useState(old?.due ?? '');
  const [contractorId, setContractorId] = useState<string>(old?.contractorId ?? '');
  const [notes, setNotes] = useState(old?.notes ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  const pickPreset = (name: string) => {
    const p = PRESETS.find((x) => x.title === name);
    setPreset(p?.key ?? '');
    if (p) { setTitle(p.title); setMonths(String(p.months)); }
  };
  const submit = () => {
    const e: Record<string, string> = {};
    const m = Number(months.replace(',', '.'));
    if (!propertyId) e.property = 'Bitte ein Haus wählen.';
    if (!title.trim()) e.title = 'Bitte einen Namen eingeben.';
    if (!Number.isInteger(m) || m < 1 || m > 240) e.months = 'Bitte das Intervall in ganzen Monaten angeben (1 bis 240).';
    setErr(e);
    if (Object.keys(e).length) return;
    const x: Check = { id: old?.id ?? uid(), propertyId, title: title.trim(), preset: preset || undefined, intervalMonths: m, last: last || undefined, due: due || undefined, history: old?.history, contractorId: contractorId || undefined, notes: notes.trim() || undefined };
    save('checks', x);
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Prüfung">
        {db.properties.length > 1 && <ChipField label="Haus" value={db.properties.find((p) => p.id === propertyId)?.name ?? ''} options={db.properties.map((p) => p.name)} onChange={(v) => { const p = db.properties.find((x) => x.name === v); if (p) setPropertyId(p.id); }} />}
        <ChipField label="Vorlage" value={presetOf(preset)?.title ?? ''} options={PRESETS.map((p) => p.title)} onChange={pickPreset} />
        <Field label="Name" value={title} onChangeText={setTitle} placeholder="z. B. Heizungswartung" error={err.title} />
        <Field label="Alle wie viele Monate?" value={months} onChangeText={setMonths} keyboard="numeric" suffix="Monate" error={err.months} hint="12 = jährlich, 36 = alle drei Jahre" />
      </Section>
      <Section title="Termine" footer="Trage ein, wann es zuletzt erledigt wurde. Hat dir jemand schon einen festen nächsten Termin genannt, trage ihn unten ein.">
        <DateField label="Zuletzt erledigt am" value={last} onChange={setLast} optional />
        <DateField label="Nächster Termin (wenn bekannt)" value={due} onChange={setDue} optional />
      </Section>
      <Section title="Weiteres">
        {db.contractors.length > 0 && <ChipField label="Handwerker" value={db.contractors.find((y) => y.id === contractorId)?.name ?? 'Keiner'} options={['Keiner', ...db.contractors.map((y) => y.name)]} onChange={(v) => setContractorId(db.contractors.find((y) => y.name === v)?.id ?? '')} />}
        <Field label="Notizen" value={notes} onChangeText={setNotes} multiline placeholder="optional" />
      </Section>
      {err.property ? <View style={{ marginBottom: 12 }}><Badge text={err.property} tone="danger" /></View> : null}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('checks', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}
