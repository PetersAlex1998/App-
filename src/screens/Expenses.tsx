import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { useCloud } from '../syncProvider';
import { fillFromReceipt, readReceipt } from '../receipt';
import { Badge, Button, ChipField, DateField, EmptyState, Field, FilterChips, Gap, ListRow, Note, Row, Screen, Section, Stat, StatGrid, confirm, notify, useColors } from '../ui';
import { dateDE, eur, num, today } from '../calc';
import { houseId } from '../ids';
import { ANLAGE_V_HINT, EXPENSE_CATEGORIES, EXPENSE_LABEL, anlageV, expensesCsv, expensesOf } from '../expenses';
import { deleteBlob, filesSupported, fmtSize, pickFiles, putBlob, shrinkImage } from '../files';
import { saveText } from '../backup';
import { type } from '../theme';
import { Expense, ExpenseCategory } from '../types';

const propLabel = (p: { houseNo?: number; name: string }) => `${p.houseNo ? houseId(p) + ' ' : ''}${p.name}`;

/** Jahre, in denen es Ausgaben oder Einnahmen gibt, plus das laufende Jahr. */
function useYears() {
  const { db } = useStore();
  return useMemo(() => {
    const y = new Set<number>([new Date().getFullYear()]);
    db.expenses.forEach((e) => y.add(Number(e.date.slice(0, 4))));
    db.payments.forEach((p) => y.add(Number(p.date.slice(0, 4))));
    return [...y].filter((n) => n > 1990).sort((a, b) => b - a);
  }, [db.expenses, db.payments]);
}

function Filters({ year, setYear, propertyId, setPropertyId }: { year: number; setYear: (y: number) => void; propertyId: string; setPropertyId: (id: string) => void }) {
  const { db } = useStore();
  const years = useYears();
  return (
    <>
      <FilterChips value={String(year)} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ label: String(y), value: String(y) }))} />
      {db.properties.length > 1 && (
        <FilterChips value={propertyId} onChange={setPropertyId} options={[{ label: 'Alle Häuser', value: '' }, ...db.properties.map((p) => ({ label: propLabel(p), value: p.id }))]} />
      )}
    </>
  );
}

export function ExpensesScreen({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyId, setPropertyId] = useState<string>(route.params?.propertyId ?? '');
  const list = expensesOf(db, { propertyId: propertyId || undefined, year });
  const sum = list.reduce((s, e) => s + e.amount, 0);
  const missing = list.filter((e) => !e.receiptId).length;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 14, marginTop: 6 }}>Ausgaben und Belege</Text>
      <Filters year={year} setYear={setYear} propertyId={propertyId} setPropertyId={setPropertyId} />
      <StatGrid>
        <Stat label={`Ausgaben ${year}`} value={eur(sum)} icon="receipt-outline" />
        <Stat label="Ohne Beleg" value={String(missing)} tone={missing ? 'danger' : 'ok'} icon="alert-circle-outline" />
      </StatGrid>
      <Gap h={16} />
      <Button icon="camera-outline" title="Beleg fotografieren" onPress={() => navigation.navigate('ExpenseForm', { propertyId: propertyId || db.properties[0]?.id })} disabled={db.properties.length === 0} />
      <Gap h={8} />
      <Button kind="secondary" icon="add" title="Ausgabe erfassen" onPress={() => navigation.navigate('ExpenseForm', { propertyId: propertyId || db.properties[0]?.id })} disabled={db.properties.length === 0} />
      <Gap h={8} />
      <Button kind="secondary" icon="document-text-outline" title="Auswertung für die Steuer (Anlage V)" onPress={() => navigation.navigate('AnlageV', { propertyId: propertyId || undefined, year })} />
      {list.some((e) => e.allocatable) && (
        <>
          <Gap h={8} />
          <Button kind="secondary" icon="calculator-outline" title={`Für Nebenkosten ${year} übernehmen`} onPress={() => navigation.navigate('NkKosten', { propertyId: propertyId || db.properties[0]?.id, year })} />
        </>
      )}
      <Gap h={22} />
      <Section title={`${list.length} Ausgabe${list.length === 1 ? '' : 'n'}`}>
        {list.length === 0 && <Note>{db.properties.length === 0 ? 'Lege zuerst ein Objekt an.' : 'In diesem Jahr noch keine Ausgaben erfasst.'}</Note>}
        {list.map((e) => (
          <ListRow key={e.id} icon={e.receiptId ? 'receipt' : 'receipt-outline'} title={e.vendor || e.description || EXPENSE_LABEL[e.category]}
            subtitle={`${dateDE(e.date)} · ${EXPENSE_LABEL[e.category]}${db.properties.length > 1 ? ` · ${db.properties.find((p) => p.id === e.propertyId)?.name ?? ''}` : ''}`}
            right={eur(e.amount)} badge={e.receiptId ? (e.allocatable ? { text: 'umlagefähig', tone: 'neutral' } : undefined) : { text: 'Beleg fehlt', tone: 'warn' }} onPress={() => navigation.navigate('ExpenseForm', { id: e.id })} />
        ))}
      </Section>
    </Screen>
  );
}

export function ExpenseForm({ route, navigation }: any) {
  const { db, save, remove } = useStore();
  const del = useDelete();
  const old = db.expenses.find((e) => e.id === route.params?.id);
  const [propertyId, setPropertyId] = useState(old?.propertyId ?? route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [date, setDate] = useState(old?.date ?? today());
  const [amount, setAmount] = useState(old ? String(old.amount).replace('.', ',') : '');
  const [category, setCategory] = useState<ExpenseCategory>(old?.category ?? 'instandhaltung');
  const [vendor, setVendor] = useState(old?.vendor ?? route.params?.vendor ?? '');
  const [description, setDescription] = useState(old?.description ?? route.params?.description ?? '');
  const [allocatable, setAllocatable] = useState(old?.allocatable ?? false);
  const cloud = useCloud();
  const [picked, setPicked] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [dateTouched, setDateTouched] = useState(!!old);
  const [categoryTouched, setCategoryTouched] = useState(!!old);
  const [dropReceipt, setDropReceipt] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const receipt = !dropReceipt && !picked ? db.documents.find((d) => d.id === old?.receiptId) : undefined;

  const scan = async (file: File) => {
    setAiNote('');
    if (!cloud.email) return setAiNote('Tipp: Melde dich unter Daten → Cloud an, dann liest die App Belege automatisch aus.');
    setReading(true);
    try {
      const d = await readReceipt(await shrinkImage(file));
      if (!d) { setAiNote('Der Beleg war nicht lesbar. Bitte trage die Angaben selbst ein.'); return; }
      const { fields, filled } = fillFromReceipt({ amount, date, vendor, description, category, categoryTouched, dateTouched }, d);
      setAmount(fields.amount); setDate(fields.date); setVendor(fields.vendor); setDescription(fields.description); setCategory(fields.category);
      setAiNote(filled.length ? `Automatisch ausgefüllt: ${filled.join(', ')}. Bitte kurz prüfen.` : 'Es gab nichts Neues auszufüllen.');
    } catch (e: any) { setAiNote(String(e?.message ?? e)); }
    finally { setReading(false); }
  };
  const choose = async (camera: boolean) => {
    const f = await pickFiles({ camera, multiple: false });
    if (f[0]) { setPicked(f[0]); setDropReceipt(false); if (!old) scan(f[0]); }
  };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!propertyId) e.property = 'Bitte ein Objekt wählen.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) e.date = 'Bitte ein Datum wählen.';
    if (!(num(amount) > 0)) e.amount = 'Bitte den Betrag eingeben (positiv).';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      let receiptId = dropReceipt ? undefined : old?.receiptId;
      if (picked) {
        const blob = await shrinkImage(picked);
        const id = uid();
        await putBlob(id, blob);
        save('documents', { id, ownerKind: 'property', ownerId: propertyId, category: 'rechnung', name: `Beleg ${vendor.trim() || description.trim() || EXPENSE_LABEL[category]} ${date}`, mime: blob.type || picked.type || 'application/octet-stream', size: blob.size, added: today() });
        receiptId = id;
      }
      if ((picked || dropReceipt) && old?.receiptId) { remove('documents', old.receiptId); deleteBlob(old.receiptId).catch(() => {}); }
      save('expenses', { id: old?.id ?? uid(), propertyId, date, amount: Math.round(num(amount) * 100) / 100, category, vendor: vendor.trim(), description: description.trim(), receiptId, allocatable: allocatable || undefined, issueId: old?.issueId ?? route.params?.issueId });
      navigation.goBack();
    } catch (x: any) {
      setBusy(false);
      notify(`Speichern fehlgeschlagen: ${x?.message ?? x}. Möglicherweise ist der Speicher voll.`);
    }
  };
  const labels = db.properties.map(propLabel);
  return (
    <Screen>
      {filesSupported() && (
        <Section title="Beleg" footer={picked ? `Ausgewählt: ${picked.name} (${fmtSize(picked.size)})` : receipt ? undefined : 'Foto mit der Kamera oder PDF. Fotos werden automatisch verkleinert.'}>
          {receipt && <ListRow icon="receipt" title={receipt.name} subtitle={fmtSize(receipt.size)} onPress={() => navigation.navigate('DocumentViewer', { id: receipt.id })} />}
          <ListRow icon="camera" title={receipt || picked ? 'Anderes Foto aufnehmen' : 'Beleg fotografieren'} subtitle={!old && cloud.email ? 'Die App füllt Betrag, Datum und Lieferant automatisch aus' : undefined} onPress={() => choose(true)} />
          <ListRow icon="folder-open" title="Foto oder PDF auswählen" onPress={() => choose(false)} />
          {picked && cloud.email && !reading ? <ListRow icon="sparkles-outline" title="Beleg erneut auslesen" onPress={() => scan(picked)} /> : null}
          {(receipt || picked) && <ListRow icon="close-circle-outline" title="Beleg entfernen" onPress={() => { setPicked(null); setDropReceipt(true); }} />}
        </Section>
      )}
      {reading ? <View style={{ marginBottom: 12 }}><Badge text="Beleg wird gelesen …" tone="neutral" /></View> : aiNote ? <View style={{ marginBottom: 12 }}><Badge text={aiNote} tone={aiNote.startsWith('Automatisch') ? 'ok' : 'warn'} /></View> : null}
      <Section title="Ausgabe">
        {db.properties.length > 1 && <ChipField label="Objekt" value={propLabel(db.properties.find((p) => p.id === propertyId) ?? { name: '' })} options={labels} onChange={(v) => { const p = db.properties[labels.indexOf(v)]; if (p) setPropertyId(p.id); }} />}
        <DateField label="Datum der Zahlung" value={date} onChange={(v) => { setDate(v); setDateTouched(true); }} error={err.date} />
        <Field label="Betrag (brutto)" value={amount} onChangeText={setAmount} keyboard="numeric" suffix="€" error={err.amount} />
        <Field label="Lieferant / Handwerker" value={vendor} onChangeText={setVendor} placeholder="z. B. Sanitär Meier" />
        <Field label="Beschreibung" value={description} onChangeText={setDescription} placeholder="z. B. Rohrbruch Keller" />
      </Section>
      <Section title="Kategorie" footer={ANLAGE_V_HINT[category]}>
        <ChipField label="Kategorie" value={EXPENSE_LABEL[category]} options={EXPENSE_CATEGORIES.map((k) => EXPENSE_LABEL[k])} onChange={(v) => { if (v) { setCategory(EXPENSE_CATEGORIES.find((k) => EXPENSE_LABEL[k] === v)!); setCategoryTouched(true); } }} />
        <ListRow icon={allocatable ? 'checkbox' : 'square-outline'} title="Auf Mieter umlagefähig" subtitle="Fließt in die Betriebskosten der Nebenkostenabrechnung ein" onPress={() => setAllocatable(!allocatable)} />
      </Section>
      {err.property ? <View style={{ marginBottom: 12 }}><Badge text={err.property} tone="danger" /></View> : null}
      <Button icon="checkmark" title={busy ? 'Wird gespeichert …' : 'Speichern'} onPress={submit} disabled={busy} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('expenses', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}

export function AnlageVScreen({ route, navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [year, setYear] = useState(Number(route.params?.year) || new Date().getFullYear() - 1);
  const [propertyId, setPropertyId] = useState<string>(route.params?.propertyId ?? '');
  const a = anlageV(db, year, propertyId || undefined);
  const scope = propertyId ? db.properties.find((p) => p.id === propertyId)?.name : 'Gesamtbestand';
  const exp = () => saveText(`ausgaben-${year}.csv`, expensesCsv(db, year, propertyId || undefined)).catch((e) => notify(String(e?.message ?? e)));
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 4, marginTop: 6 }}>Anlage V {year}</Text>
      <Text style={{ color: c.muted, fontSize: type.subhead, marginBottom: 14 }}>{scope}</Text>
      <Filters year={year} setYear={setYear} propertyId={propertyId} setPropertyId={setPropertyId} />
      <Section title="Einnahmen" footer="Gezählt werden alle Zahlungen (Miete, Nebenkostenvorauszahlung, Nachzahlung) nach dem Zahlungsdatum. Die Kaution zählt nicht.">
        <Row left="Mieteinnahmen" right={eur(a.income)} bold />
      </Section>
      <Section title="Werbungskosten">
        {a.byCategory.length === 0 && <Note>Keine Ausgaben erfasst.</Note>}
        {a.byCategory.map((x) => <Row key={x.category} left={EXPENSE_LABEL[x.category]} right={eur(x.amount)} />)}
        {a.byCategory.length > 0 && <Row bold left="Summe" right={eur(a.expenses)} />}
        {a.fromLoans > 0 && <Note>Die Schuldzinsen ({eur(a.fromLoans)}) sind aus deinen Darlehen berechnet. Maßgeblich ist die Zinsbescheinigung der Bank. Trägst du Schuldzinsen als Ausgabe ein, ersetzen sie die Berechnung für dieses Haus.</Note>}
      </Section>
      <Section title="Ergebnis" footer="Überschuss vor Abschreibung auf neue Anschaffungen und Sonderfälle. Zur Orientierung, ersetzt keine Steuerberatung.">
        <Row bold left={a.surplus >= 0 ? 'Überschuss' : 'Verlust'} right={eur(a.surplus)} color={a.surplus < 0 ? c.danger : undefined} />
      </Section>
      {a.noReceipt > 0 && <View style={{ marginBottom: 14 }}><Badge text={`${a.noReceipt} Ausgabe${a.noReceipt === 1 ? '' : 'n'} ohne Beleg`} tone="warn" /></View>}
      <Button icon="download-outline" title="Ausgaben als CSV exportieren" onPress={exp} disabled={db.expenses.length === 0} />
    </Screen>
  );
}
