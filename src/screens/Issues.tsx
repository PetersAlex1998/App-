import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { useSettings } from '../settings';
import { Badge, Button, ChipField, DateField, EmptyState, Field, FilterChips, Gap, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { dateDE, eur, today } from '../calc';
import { STATUS_LABEL, ageDays, contractorStats, isOpen, issueCost, issueExpenses, orderMail, placeOf, sortIssues } from '../issues';
import { type } from '../theme';
import { Contractor, Issue } from '../types';

const Title = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{children}</Text>;
};
const TONE = { offen: 'danger', beauftragt: 'warn', erledigt: 'ok' } as const;
const open = (url: string) => Linking.openURL(url).catch(() => notify('Das konnte nicht geöffnet werden.'));

/** Schadensmeldungen und Aufträge. */
export function Schaeden({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [f, setF] = useState<'offen' | 'erledigt' | 'alle'>('offen');
  const propertyId: string | undefined = route.params?.propertyId;
  const unitId: string | undefined = route.params?.unitId;
  const scoped = db.issues.filter((i) => (!propertyId || i.propertyId === propertyId) && (!unitId || i.unitId === unitId));
  const list = sortIssues(scoped.filter((i) => f === 'alle' || (f === 'offen' ? isOpen(i) : !isOpen(i))));
  const nOpen = scoped.filter(isOpen).length;
  const urgent = scoped.filter((i) => isOpen(i) && i.urgent).length;
  return (
    <Screen>
      <Title>Schäden</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Meldungen und Aufträge an Häusern und Wohnungen, mit Handwerker und Kosten.</Text>
      <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14 }}>
        <Text style={{ color: c.text, fontSize: 30, fontWeight: '800' }}>{nOpen}</Text>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>offen{urgent ? ` · davon ${urgent} dringend` : ''}</Text>
      </View>
      <Button icon="add" title="Schaden melden" onPress={() => navigation.navigate('IssueForm', { propertyId: propertyId ?? db.properties[0]?.id, unitId })} disabled={db.properties.length === 0} />
      <Gap h={14} />
      <FilterChips value={f} onChange={setF} options={[{ label: 'Offen', value: 'offen' }, { label: 'Erledigt', value: 'erledigt' }, { label: 'Alle', value: 'alle' }]} />
      {list.length === 0 ? <EmptyState icon="construct-outline" title={f === 'offen' ? 'Nichts offen' : 'Keine Einträge'} text={f === 'offen' ? 'Es gibt keine offenen Schäden. Neue Meldungen erfasst du oben.' : 'Hier erscheinen die Meldungen, sobald es welche gibt.'} /> : (
        <Section>
          {list.map((i) => {
            const k = db.contractors.find((x) => x.id === i.contractorId);
            const cost = issueCost(db, i);
            return <ListRow key={i.id} icon={i.urgent && isOpen(i) ? 'alert-circle' : 'construct-outline'} iconTone={i.urgent && isOpen(i) ? 'danger' : undefined} title={i.title}
              subtitle={`${placeOf(db, i)} · ${isOpen(i) ? `seit ${ageDays(i)} Tag${ageDays(i) === 1 ? '' : 'en'}` : `erledigt ${dateDE(i.done ?? i.reported)}`}${k ? ` · ${k.name}` : ''}`}
              right={cost ? eur(cost) : undefined} rightSub={STATUS_LABEL[i.status]} onPress={() => navigation.navigate('IssueDetail', { id: i.id })} />;
          })}
        </Section>
      )}
    </Screen>
  );
}

export function IssueDetail({ route, navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const i = db.issues.find((x) => x.id === route.params?.id);
  useEffect(() => { if (!i) navigation.goBack(); }, [i]);
  if (!i) return <Screen><EmptyState icon="help-circle" title="Meldung nicht gefunden" text="Sie wurde vermutlich gelöscht." /></Screen>;
  const k = db.contractors.find((x) => x.id === i.contractorId);
  const exp = issueExpenses(db, i);
  const tenant = db.tenants.find((t) => t.id === i.tenantId);
  const set = (patch: Partial<Issue>) => save('issues', { ...i, ...patch });
  const mail = k?.email ? orderMail(db, i, k, cfg.name || cfg.owner || '') : null;
  return (
    <Screen>
      <Title>{i.title}</Title>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <Badge text={STATUS_LABEL[i.status]} tone={TONE[i.status]} />
        {i.urgent && isOpen(i) && <Badge text="Dringend" tone="danger" />}
      </View>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{placeOf(db, i)} · gemeldet {dateDE(i.reported)}{tenant ? ` von ${tenant.name}` : ''}{i.description ? `\n${i.description}` : ''}</Text>

      <Section title="Stand">
        {i.ordered && <ListRow icon="send-outline" title="Beauftragt" right={dateDE(i.ordered)} />}
        {i.done && <ListRow icon="checkmark-circle" iconTone="ok" title="Erledigt" right={dateDE(i.done)} />}
        <View style={{ padding: 12, gap: 8 }}>
          {i.status === 'offen' && <Button icon="send-outline" title="Als beauftragt markieren" onPress={() => set({ status: 'beauftragt', ordered: today() })} />}
          {i.status !== 'erledigt' && <Button kind={i.status === 'offen' ? 'secondary' : 'primary'} icon="checkmark" title="Als erledigt markieren" onPress={() => set({ status: 'erledigt', done: today() })} />}
          {i.status === 'erledigt' && <Button kind="secondary" icon="refresh" title="Wieder öffnen" onPress={() => set({ status: i.ordered ? 'beauftragt' : 'offen', done: undefined })} />}
        </View>
      </Section>

      <Section title="Handwerker">
        {k ? (
          <>
            <ListRow icon="person-outline" title={k.name} subtitle={k.trade} onPress={() => navigation.navigate('ContractorForm', { id: k.id })} />
            {k.phone ? <ListRow icon="call-outline" title="Anrufen" subtitle={k.phone} onPress={() => open(`tel:${k.phone.replace(/\s/g, '')}`)} /> : null}
            {mail ? <ListRow icon="mail-outline" title="Auftrag per E-Mail" subtitle="Mit Ort und Beschreibung, ohne Mieterdaten" onPress={() => open(mail.href)} /> : null}
          </>
        ) : <ListRow icon="person-add-outline" title="Handwerker zuordnen" subtitle="Beim Bearbeiten auswählen" onPress={() => navigation.navigate('IssueForm', { id: i.id })} />}
      </Section>

      <Section title="Kosten" footer={exp.length ? `Zusammen ${eur(issueCost(db, i))}. Die Rechnungen zählen in der Steuerauswertung als Ausgaben.` : 'Trage die Rechnung hier ein, damit Kosten, Beleg und Steuer zusammenhängen.'}>
        {exp.map((e) => <ListRow key={e.id} icon="receipt-outline" title={e.vendor || e.description || 'Rechnung'} subtitle={dateDE(e.date)} right={eur(e.amount)} onPress={() => navigation.navigate('ExpenseForm', { id: e.id })} />)}
        <ListRow icon="add-circle-outline" title="Rechnung erfassen" onPress={() => navigation.navigate('ExpenseForm', { propertyId: i.propertyId, issueId: i.id, vendor: k?.name, description: i.title })} />
      </Section>
      <Button kind="secondary" icon="create-outline" title="Bearbeiten" onPress={() => navigation.navigate('IssueForm', { id: i.id })} />
    </Screen>
  );
}

export function IssueForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const del = useDelete();
  const old = db.issues.find((x) => x.id === route.params?.id);
  const [propertyId, setPropertyId] = useState<string>(old?.propertyId ?? route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [unitId, setUnitId] = useState<string>(old?.unitId ?? route.params?.unitId ?? '');
  const [title, setTitle] = useState(old?.title ?? '');
  const [description, setDescription] = useState(old?.description ?? '');
  const [reported, setReported] = useState(old?.reported ?? today());
  const [urgent, setUrgent] = useState(!!old?.urgent);
  const [contractorId, setContractorId] = useState<string>(old?.contractorId ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  const units = db.units.filter((u) => u.propertyId === propertyId);
  const unitNames = ['Haus allgemein', ...units.map((u) => u.name)];
  const contractorNames = ['Noch keiner', ...db.contractors.map((x) => x.name)];
  const submit = () => {
    const e: Record<string, string> = {};
    if (!propertyId) e.property = 'Bitte ein Haus wählen.';
    if (!title.trim()) e.title = 'Bitte kurz beschreiben, was kaputt ist.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reported)) e.reported = 'Bitte ein Datum wählen.';
    setErr(e);
    if (Object.keys(e).length) return;
    const tenant = unitId ? db.tenants.find((t) => t.unitId === unitId && (!t.moveOut || t.moveOut >= today())) : undefined;
    save('issues', { id: old?.id ?? uid(), propertyId, unitId: unitId || undefined, tenantId: old?.tenantId ?? tenant?.id, title: title.trim(), description: description.trim() || undefined, reported, urgent: urgent || undefined, status: old?.status ?? 'offen', contractorId: contractorId || undefined, ordered: old?.ordered, done: old?.done });
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Schaden">
        {db.properties.length > 1 && <ChipField label="Haus" value={db.properties.find((p) => p.id === propertyId)?.name ?? ''} options={db.properties.map((p) => p.name)} onChange={(v) => { const p = db.properties.find((x) => x.name === v); if (p) { setPropertyId(p.id); setUnitId(''); } }} />}
        <ChipField label="Wo?" value={units.find((u) => u.id === unitId)?.name ?? 'Haus allgemein'} options={unitNames} onChange={(v) => setUnitId(units.find((u) => u.name === v)?.id ?? '')} />
        <Field label="Was ist kaputt?" value={title} onChangeText={setTitle} placeholder="z. B. Heizung wird nicht warm" error={err.title} />
        <Field label="Details" value={description} onChangeText={setDescription} multiline placeholder="optional" />
        <DateField label="Gemeldet am" value={reported} onChange={setReported} error={err.reported} />
        <ListRow icon={urgent ? 'checkbox' : 'square-outline'} title="Dringend" subtitle="z. B. Wasserschaden, Heizungsausfall im Winter" onPress={() => setUrgent(!urgent)} />
      </Section>
      <Section title="Handwerker" footer={db.contractors.length === 0 ? 'Lege Handwerker unter Alle Module → Handwerker an.' : undefined}>
        <ChipField label="Beauftragt bei" value={db.contractors.find((x) => x.id === contractorId)?.name ?? 'Noch keiner'} options={contractorNames} onChange={(v) => setContractorId(db.contractors.find((x) => x.name === v)?.id ?? '')} />
      </Section>
      {err.property ? <View style={{ marginBottom: 12 }}><Badge text={err.property} tone="danger" /></View> : null}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('issues', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}

/** Handwerker mit Aufträgen und Kosten. */
export function Handwerker({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const stats = contractorStats(db);
  return (
    <Screen>
      <Title>Handwerker</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Deine Dienstleister mit Telefon, E-Mail und den bisherigen Aufträgen.</Text>
      <Button icon="add" title="Handwerker anlegen" onPress={() => navigation.navigate('ContractorForm')} />
      <Gap h={14} />
      {stats.length === 0 ? <EmptyState icon="person-outline" title="Noch keine Handwerker" text="Lege Sanitär, Elektro, Heizung und andere Betriebe an. Dann ordnest du sie Schäden zu." /> : (
        <Section>
          {stats.map((s) => <ListRow key={s.contractor.id} icon="person-outline" title={s.contractor.name} subtitle={`${s.contractor.trade || 'Handwerker'}${s.jobs ? ` · ${s.jobs} Auftrag${s.jobs === 1 ? '' : 'e'}${s.open ? `, ${s.open} offen` : ''}` : ''}`} right={s.cost ? eur(s.cost) : undefined} rightSub={s.cost ? 'Kosten' : undefined} onPress={() => navigation.navigate('ContractorForm', { id: s.contractor.id })} />)}
        </Section>
      )}
    </Screen>
  );
}

export function ContractorForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const del = useDelete();
  const old = db.contractors.find((x) => x.id === route.params?.id);
  const [name, setName] = useState(old?.name ?? '');
  const [trade, setTrade] = useState(old?.trade ?? '');
  const [phone, setPhone] = useState(old?.phone ?? '');
  const [email, setEmail] = useState(old?.email ?? '');
  const [notes, setNotes] = useState(old?.notes ?? '');
  const [err, setErr] = useState('');
  const jobs = old ? db.issues.filter((i) => i.contractorId === old.id) : [];
  const submit = () => {
    if (!name.trim()) return setErr('Bitte einen Namen eingeben.');
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Die E-Mail-Adresse sieht nicht richtig aus.');
    const x: Contractor = { id: old?.id ?? uid(), name: name.trim(), trade: trade.trim(), phone: phone.trim(), email: email.trim(), notes: notes.trim() || undefined };
    save('contractors', x);
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Handwerker">
        <Field label="Name oder Firma" value={name} onChangeText={(v) => { setName(v); setErr(''); }} error={err.includes('Namen') ? err : undefined} />
        <ChipField label="Gewerk" value={trade} options={['Sanitär', 'Heizung', 'Elektro', 'Maler', 'Dach', 'Schlüsseldienst', 'Hausmeister', 'Sonstiges']} onChange={setTrade} />
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboard="phone-pad" />
        <Field label="E-Mail" value={email} onChangeText={(v) => { setEmail(v); setErr(''); }} keyboard="email-address" error={err.includes('E-Mail') ? err : undefined} />
        <Field label="Notizen" value={notes} onChangeText={setNotes} multiline placeholder="optional, z. B. Stundensatz, Notdienst" />
      </Section>
      {jobs.length > 0 && <Section title="Aufträge">{jobs.map((i) => <ListRow key={i.id} icon="construct-outline" title={i.title} subtitle={`${placeOf(db, i)} · ${STATUS_LABEL[i.status]}`} onPress={() => navigation.navigate('IssueDetail', { id: i.id })} />)}</Section>}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('contractors', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}
