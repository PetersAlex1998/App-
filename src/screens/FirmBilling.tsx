import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { useSettings } from '../settings';
import { Badge, Button, ChipField, DateField, EmptyState, Field, FilterChips, Gap, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { dateDE, eur, monthLabel, num, today } from '../calc';
import { HouseOverride, HousePlan, buildInvoice, expensesFromInvoice, feeOf, firmIssues, invoiceModel, planAll, totals } from '../firmBilling';
import { storeInvoicePdf } from '../outbox';
import { filesSupported } from '../files';
import { EXPENSE_LABEL } from '../expenses';
import { BIG_MONEY, tooBig } from '../inputs';
import { type } from '../theme';
import { ExpenseCategory, FirmCost } from '../types';

const Title = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{children}</Text>;
};
const addMonth = (m: string, n: number) => { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const txt = (n: number) => String(n).replace('.', ',');

/** Monatliche Rechnung der Firma an die Eigentümer jedes Hauses: Verwaltungsgebühr je Einheit und weiterbelastete Kosten. */
export function FirmenAbrechnung({ navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg, update } = useSettings();
  const c = useColors();
  const del = useDelete();
  const thisMonth = today().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [ov, setOv] = useState<Record<string, HouseOverride>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const plans = planAll(db, cfg, month, ov);
  const todo = plans.filter((h) => !h.already && h.lines.length > 0 && !off[h.prop.id]);
  const sum = totals(todo.flatMap((h) => h.lines));
  const issues = firmIssues(cfg);
  const set = (id: string, patch: HouseOverride) => setOv({ ...ov, [id]: { ...(ov[id] ?? {}), ...patch } });

  const create = async () => {
    if (!filesSupported()) return notify('Das Erstellen ist in der Web-App verfügbar.');
    setBusy(true);
    try {
      for (const hp of todo) {
        const id = uid(), docId = uid();
        const inv = buildInvoice(db, hp.prop, hp, id, today(), docId);
        const doc = await storeInvoicePdf(docId, invoiceModel(cfg, hp.prop, inv), hp.prop.id, `Rechnung ${inv.number}`);
        save('documents', doc);
        save('firmInvoices', inv);
        expensesFromInvoice(inv, cfg, uid).forEach((e) => save('expenses', e));
        hp.lines.forEach((l) => { const cost = l.costId ? db.firmCosts.find((x) => x.id === l.costId) : undefined; if (cost) save('firmCosts', { ...cost, billedIn: id }); });
      }
      setOv({});
      navigation.navigate('Outbox');
    } catch (e: any) { notify(String(e?.message ?? e)); setBusy(false); }
  };

  const card = (h: HousePlan) => {
    const p = h.prop;
    const o = ov[p.id] ?? {};
    if (h.already) {
      const inv = h.already;
      return (
        <Section key={p.id} title={p.name}>
          <ListRow icon="checkmark-circle" iconTone="ok" title={`Rechnung ${inv.number}`} subtitle={`${eur(inv.net)} netto · ${eur(inv.gross)} brutto · ${inv.paid ? `bezahlt am ${dateDE(inv.paid)}` : 'noch nicht bezahlt'}`} onPress={() => inv.docId && navigation.navigate('DocumentViewer', { id: inv.docId })} />
          <View style={{ padding: 12, gap: 8 }}>
            {!inv.paid && <Button kind="secondary" icon="cash-outline" title="Als bezahlt markieren" onPress={() => save('firmInvoices', { ...inv, paid: today() })} />}
            {inv.paid && <Button kind="plain" title="Zahlung zurücknehmen" onPress={() => save('firmInvoices', { ...inv, paid: undefined })} />}
            <Button kind="plain" title="Rechnung löschen (Buchungen entfallen)" onPress={() => del('firmInvoices', inv.id)} />
          </View>
        </Section>
      );
    }
    const t = totals(h.lines);
    const feeChanged = h.fee !== feeOf(cfg, p);
    return (
      <Section key={p.id} title={p.name} footer={h.warnings.join(' ') || undefined}>
        <ListRow icon={off[p.id] ? 'square-outline' : 'checkbox'} iconTone={off[p.id] ? undefined : 'primary'} title={off[p.id] ? 'Wird nicht abgerechnet' : 'Wird abgerechnet'} subtitle={off[p.id] ? 'Tippen zum Einschließen' : 'Tippen zum Ausnehmen'} onPress={() => setOff({ ...off, [p.id]: !off[p.id] })} />
        {!off[p.id] && (
          <>
            <Field label="Einheiten" value={o.units !== undefined ? txt(o.units) : String(h.units)} onChangeText={(v) => set(p.id, { units: num(v) })} keyboard="numeric" />
            <Field label="Verwaltungsgebühr je Einheit (netto)" value={o.fee !== undefined ? txt(o.fee) : txt(h.fee)} onChangeText={(v) => set(p.id, { fee: num(v) })} keyboard="numeric" suffix="€" hint={feeChanged ? 'Weicht vom Standard ab' : 'Standard'} />
            {feeChanged && <ListRow icon="bookmark-outline" title="Gebühr für dieses Haus dauerhaft speichern" onPress={() => { save('properties', { ...p, mgmtFee: h.fee }); setOv({ ...ov, [p.id]: { ...o, fee: undefined } }); }} />}
            {h.openCosts.map((cost) => {
              const skipped = (o.skipCosts ?? []).includes(cost.id);
              return <ListRow key={cost.id} icon={skipped ? 'square-outline' : 'checkbox'} iconTone={skipped ? undefined : 'primary'} title={cost.description} subtitle={`${dateDE(cost.date)}${cost.vendor ? ` · ${cost.vendor}` : ''} · ${eur(cost.net)} netto`} onPress={() => set(p.id, { skipCosts: skipped ? (o.skipCosts ?? []).filter((x) => x !== cost.id) : [...(o.skipCosts ?? []), cost.id] })} />;
            })}
            <Field label="Weitere Position (Text)" value={o.extraText ?? ''} onChangeText={(v) => set(p.id, { extraText: v })} placeholder="optional" />
            {o.extraText?.trim() ? <Field label="Weitere Position (netto)" value={o.extraNet !== undefined ? txt(o.extraNet) : ''} onChangeText={(v) => set(p.id, { extraNet: num(v) })} keyboard="numeric" suffix="€" /> : null}
            <View style={{ padding: 14, gap: 2 }}>
              <Row2 k="Netto" v={eur(t.net)} />
              {t.vats.map((v) => <Row2 key={v.rate} k={`Umsatzsteuer ${txt(v.rate)} %`} v={eur(v.vat)} />)}
              <Row2 k="Rechnungsbetrag" v={eur(t.gross)} bold />
            </View>
          </>
        )}
      </Section>
    );
  };

  return (
    <Screen>
      <Title>Abrechnung an die Häuser</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Monatliche Rechnung der Firma an die Eigentümer: Verwaltungsgebühr je Einheit und die Kosten, die die Firma für das Haus bezahlt hat (Hausmeister). Beim Haus wird sie als Ausgabe gebucht.</Text>
      <FilterChips value={month} onChange={setMonth} options={[0, -1, -2, -3].map((n) => ({ label: monthLabel(addMonth(thisMonth, n)), value: addMonth(thisMonth, n) }))} />
      {issues.map((w) => <View key={w} style={{ marginBottom: 8 }}><Badge text={w} tone="warn" /></View>)}

      <Section title="Standard" footer="Gilt für alle Häuser, solange du beim Haus nichts anderes einträgst. Du kannst den Betrag pro Haus und pro Monat unten ändern.">
        <Field label="Verwaltungsgebühr je Einheit und Monat (netto)" value={txt(cfg.mgmtFee)} onChangeText={(v) => update({ mgmtFee: num(v) })} keyboard="numeric" suffix="€" />
        <Field label="Umsatzsteuer" value={txt(cfg.vatRate)} onChangeText={(v) => update({ vatRate: num(v) })} keyboard="numeric" suffix="%" />
      </Section>

      {plans.length === 0 && <EmptyState icon="business-outline" title="Nichts abzurechnen" text="Es gibt keine Häuser mit Einheiten und keine offenen Firmenkosten." />}
      {plans.map(card)}

      <ListRow icon="receipt-outline" title="Firmenkosten erfassen" subtitle={`${db.firmCosts.filter((x) => !x.billedIn).length} noch nicht weiterbelastet · Hausmeister und mehr`} onPress={() => navigation.navigate('Firmenkosten')} />
      <Gap h={14} />
      {todo.length > 0 && <Button icon="document-text" title={busy ? 'Wird erstellt …' : `${todo.length} Rechnung${todo.length === 1 ? '' : 'en'} erstellen (${eur(sum.gross)})`} onPress={create} disabled={busy || todo.some((h) => tooBig(h.gross))} />}
      {todo.some((h) => tooBig(h.gross)) && <View style={{ marginTop: 10 }}><Badge text={BIG_MONEY} tone="danger" /></View>}
      <Gap h={14} />
      <Note>Die Rechnungen liegen im Briefausgang zum Versenden. Die Eigentümer zahlen vom Hauskonto auf das Firmenkonto. Lass Rechnungsangaben und Umsatzsteuer einmal von deinem Steuerberater prüfen.</Note>
    </Screen>
  );
}

function Row2({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const c = useColors();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: c.text, fontSize: type.body, fontWeight: bold ? '700' : '400' }}>{k}</Text><Text style={{ color: c.text, fontSize: type.body, fontWeight: bold ? '700' : '400' }}>{v}</Text></View>;
}

/** Kosten, die die Firma für ein Haus bezahlt hat und weiterbelastet. */
export function Firmenkosten({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const [f, setF] = useState<'offen' | 'alle'>('offen');
  const list = db.firmCosts.filter((x) => f === 'alle' || !x.billedIn).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Screen>
      <Title>Firmenkosten</Title>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Kosten, die die Firma für ein Haus bezahlt hat, etwa den Hausmeister. Sie werden in der nächsten Abrechnung an die Eigentümer weiterbelastet.</Text>
      <Button icon="add" title="Kosten erfassen" onPress={() => navigation.navigate('FirmCostForm', {})} disabled={db.properties.length === 0} />
      <Gap h={14} />
      <FilterChips value={f} onChange={setF} options={[{ label: 'Offen', value: 'offen' }, { label: 'Alle', value: 'alle' }]} />
      {list.length === 0 ? <EmptyState icon="receipt-outline" title={f === 'offen' ? 'Nichts offen' : 'Noch keine Kosten'} text="Erfasse hier die Rechnung des Hausmeisters. Sie erscheint dann in der monatlichen Abrechnung." /> : (
        <Section>
          {list.map((x) => {
            const inv = x.billedIn ? db.firmInvoices.find((i) => i.id === x.billedIn) : undefined;
            return <ListRow key={x.id} icon="receipt-outline" title={x.description} subtitle={`${db.properties.find((p) => p.id === x.propertyId)?.name ?? ''} · ${dateDE(x.date)}${x.vendor ? ` · ${x.vendor}` : ''}`} right={eur(x.net)} rightSub={inv ? `abgerechnet ${inv.number}` : 'offen'} onPress={() => navigation.navigate('FirmCostForm', { id: x.id })} />;
          })}
        </Section>
      )}
    </Screen>
  );
}

const CATS: ExpenseCategory[] = ['hausmeister', 'betriebskosten', 'instandhaltung', 'verwaltung', 'sonstiges'];

export function FirmCostForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const del = useDelete();
  const old = db.firmCosts.find((x) => x.id === route.params?.id);
  const [propertyId, setPropertyId] = useState<string>(old?.propertyId ?? route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [date, setDate] = useState(old?.date ?? today());
  const [description, setDescription] = useState(old?.description ?? 'Hausmeister');
  const [vendor, setVendor] = useState(old?.vendor ?? '');
  const [net, setNet] = useState(old ? txt(old.net) : '');
  const [vat, setVat] = useState(old ? txt(old.vat) : txt(cfg.vatRate));
  const [category, setCategory] = useState<ExpenseCategory>(old?.category ?? 'hausmeister');
  const [alloc, setAlloc] = useState(old?.allocatable ?? true);
  const [err, setErr] = useState<Record<string, string>>({});
  const billed = old?.billedIn ? db.firmInvoices.find((i) => i.id === old.billedIn) : undefined;
  if (old?.billedIn) {
    return <Screen><Note>Diese Kosten sind schon in Rechnung {billed?.number ?? ''} weiterbelastet und lassen sich nicht mehr ändern. Lösche die Rechnung in der Abrechnung, wenn du etwas korrigieren willst.</Note></Screen>;
  }
  const brutto = num(net) * (1 + num(vat) / 100);
  const submit = () => {
    const e: Record<string, string> = {};
    if (!propertyId) e.property = 'Bitte ein Haus wählen.';
    if (!description.trim()) e.description = 'Bitte beschreiben, wofür die Kosten sind.';
    if (!(num(net) > 0)) e.net = 'Bitte den Nettobetrag eingeben.';
    else if (tooBig(num(net))) e.net = BIG_MONEY;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = 'Bitte ein Datum wählen.';
    if (num(vat) < 0 || num(vat) > 30) e.vat = 'Bitte einen Satz zwischen 0 und 30 % eingeben.';
    setErr(e);
    if (Object.keys(e).length) return;
    const x: FirmCost = { id: old?.id ?? uid(), propertyId, date, description: description.trim(), vendor: vendor.trim() || undefined, net: Math.round(num(net) * 100) / 100, vat: num(vat), category, allocatable: alloc };
    save('firmCosts', x);
    navigation.goBack();
  };
  return (
    <Screen>
      <Section title="Kosten">
        {db.properties.length > 1 && <ChipField label="Haus" value={db.properties.find((p) => p.id === propertyId)?.name ?? ''} options={db.properties.map((p) => p.name)} onChange={(v) => { const p = db.properties.find((x) => x.name === v); if (p) setPropertyId(p.id); }} />}
        <DateField label="Datum" value={date} onChange={setDate} error={err.date} />
        <Field label="Wofür" value={description} onChangeText={setDescription} placeholder="z. B. Hausmeister Oktober" error={err.description} />
        <Field label="Von wem" value={vendor} onChangeText={setVendor} placeholder="optional, z. B. Hausmeisterdienst Meier" />
        <Field label="Betrag netto" value={net} onChangeText={setNet} keyboard="numeric" suffix="€" error={err.net} hint={num(net) > 0 ? `Brutto ${eur(brutto)}` : undefined} />
        <Field label="Umsatzsteuer" value={vat} onChangeText={setVat} keyboard="numeric" suffix="%" error={err.vat} />
      </Section>
      <Section title="Buchung beim Haus">
        <ChipField label="Kategorie" value={EXPENSE_LABEL[category]} options={CATS.map((k) => EXPENSE_LABEL[k])} onChange={(v) => { const k = CATS.find((x) => EXPENSE_LABEL[x] === v); if (k) { setCategory(k); setAlloc(k === 'hausmeister' || k === 'betriebskosten'); } }} />
        <ListRow icon={alloc ? 'checkbox' : 'square-outline'} title="Auf Mieter umlagefähig" subtitle="Fließt in die Betriebskosten der Abrechnung ein" onPress={() => setAlloc(!alloc)} />
      </Section>
      {err.property ? <View style={{ marginBottom: 12 }}><Badge text={err.property} tone="danger" /></View> : null}
      <Button icon="checkmark" title="Speichern" onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('firmCosts', old.id); navigation.goBack(); }} /></>)}
    </Screen>
  );
}
