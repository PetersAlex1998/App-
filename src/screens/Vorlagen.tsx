import React, { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, ChipField, DateField, EmptyState, Field, FilterChips, Gap, ListRow, Note, Screen, SearchBar, Section, notify, useColors } from '../ui';
import { dateDE, today } from '../calc';
import { TEMPLATES, Template, defaultFields, renderTemplate, templateById, Ctx } from '../templates';
import { modelToPdf } from '../pdfgen';
import { pdfBlob, storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { completeness } from '../company';
import { type } from '../theme';

/** Auswahl der Vorlage. Mit `unitId` oder `tenantId` ist der Mieter schon gewählt. */
export function Vorlagen({ route, navigation }: any) {
  const { unitId, tenantId } = route.params ?? {};
  const c = useColors();
  const { s } = useSettings();
  const missing = completeness(s).missing.filter((m) => m.needed === 'brief' || m.needed === 'zahlung');
  const groups = ['Mietverhältnis', 'Übergabe und Bescheinigungen', 'Schreiben'] as const;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Dokumente erstellen</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 16 }}>Wähle eine Vorlage. Absender, Bank, Mieter und Wohnung werden automatisch eingesetzt. Das fertige PDF liegt im Briefausgang.</Text>
      {missing.length > 0 && <Section><ListRow icon="business-outline" iconTone="warn" title="Unternehmensdaten ergänzen" subtitle={`Es fehlt: ${missing.map((m) => m.label).join(', ')}`} onPress={() => navigation.navigate('Unternehmen')} /></Section>}
      {groups.map((g) => (
        <Section key={g} title={g}>
          {TEMPLATES.filter((t) => t.group === g).map((t) => (
            <ListRow key={t.id} icon={t.icon as 'leaf'} title={t.name} subtitle={t.desc} onPress={() => navigation.navigate('VorlageForm', { templateId: t.id, unitId, tenantId })} />
          ))}
        </Section>
      ))}
      <Note>Die Vorlagen sind Entwürfe nach gängiger Praxis. Lass sie einmal rechtlich prüfen, bevor du sie einsetzt.</Note>
    </Screen>
  );
}

/** Eingaben zur Vorlage, Vorschau und Ablage im Briefausgang. */
export function VorlageForm({ route, navigation }: any) {
  const tpl = templateById(route.params?.templateId) as Template | undefined;
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const activeTenants = useMemo(() => db.tenants.filter((t) => !t.moveOut || t.moveOut >= today()), [db.tenants]);
  const [tenantId, setTenantId] = useState<string>(route.params?.tenantId ?? activeTenants.find((t) => t.unitId === route.params?.unitId)?.id ?? '');
  const [q, setQ] = useState('');
  const [date, setDate] = useState(today());
  const [f, setF] = useState<Record<string, string>>({});
  const [house, setHouse] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const tenant = db.tenants.find((t) => t.id === tenantId);
  const unit = tenant ? db.units.find((u) => u.id === tenant.unitId) : undefined;
  const prop = unit ? db.properties.find((p) => p.id === unit.propertyId) : undefined;
  const ctx: Ctx | null = tenant && unit && prop && tpl ? { s: cfg, db, tenant, unit, prop, date, f } : null;

  // Felder mit Vorbelegung füllen, sobald der Mieter feststeht (einmal je Mieter)
  const [filledFor, setFilledFor] = useState('');
  if (tpl && ctx && filledFor !== tenant!.id) { setFilledFor(tenant!.id); setF(defaultFields(tpl, { s: cfg, db, tenant: tenant!, unit: unit!, prop: prop!, date })); }

  const rendered = useMemo(() => (tpl && ctx ? renderTemplate(tpl, ctx) : null), [tpl, ctx?.tenant.id, ctx?.date, JSON.stringify(f), cfg, db]);

  if (!tpl) return <Screen><EmptyState icon="help-circle" title="Vorlage nicht gefunden" text="Wähle eine Vorlage in der Liste." /></Screen>;

  const results = activeTenants.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const batchTenants = tpl.batch ? activeTenants.filter((t) => (!house || db.units.find((u) => u.id === t.unitId)?.propertyId === house)) : [];

  const preview = async () => {
    if (!rendered) return;
    if (Platform.OS !== 'web') return notify('Die Vorschau ist in der Web-App verfügbar.');
    try { const url = URL.createObjectURL(pdfBlob(await modelToPdf(rendered.model))); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e: any) { notify(String(e?.message ?? e)); }
  };
  const create = async () => {
    if (!rendered || !tenant) return;
    if (!filesSupported()) return notify('Das Ablegen ist in der Web-App verfügbar.');
    setBusy(true);
    try {
      const [doc] = await storeLetters([{ model: rendered.model, tenant, note: tpl.name }]);
      save('documents', doc);
      navigation.navigate('Outbox');
    } catch (e: any) { notify(String(e?.message ?? e)); setBusy(false); }
  };
  const createBatch = async () => {
    if (!batchTenants.length) return;
    if (!filesSupported()) return notify('Das Ablegen ist in der Web-App verfügbar.');
    setBusy(true);
    try {
      const items = batchTenants.flatMap((t) => {
        const u = db.units.find((x) => x.id === t.unitId); const p = u && db.properties.find((x) => x.id === u.propertyId);
        return u && p ? [{ model: renderTemplate(tpl, { s: cfg, db, tenant: t, unit: u, prop: p, date, f: defaultFields(tpl, { s: cfg, db, tenant: t, unit: u, prop: p, date }) }).model, tenant: t, note: tpl.name }] : [];
      });
      const docs = await storeLetters(items);
      docs.forEach((d) => save('documents', d));
      navigation.navigate('Outbox');
    } catch (e: any) { notify(String(e?.message ?? e)); setBusy(false); }
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.5, marginTop: 6, marginBottom: 4 }}>{tpl.name}</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{tpl.desc}</Text>
      {tpl.notice && <View style={{ marginBottom: 14 }}><Badge text={tpl.notice} tone="warn" /></View>}

      {tpl.batch && (
        <Section title="Für alle Mieter" footer={`${batchTenants.length} Brief${batchTenants.length === 1 ? '' : 'e'}, je einer pro aktuellem Mieter. Sie liegen danach im Briefausgang.`}>
          {db.properties.length > 1 && <View style={{ padding: 12 }}><FilterChips value={house} onChange={setHouse} options={[{ label: 'Alle Häuser', value: '' }, ...db.properties.map((p) => ({ label: p.name, value: p.id }))]} /></View>}
          <View style={{ padding: 12 }}><Button icon="documents-outline" title={busy ? 'Wird erstellt …' : `${batchTenants.length} Briefe erstellen`} onPress={createBatch} disabled={busy || !batchTenants.length} /></View>
        </Section>
      )}

      <Section title={tpl.batch ? 'Oder für einen Mieter' : 'Mieter'}>
        {tenant && unit ? (
          <ListRow icon="person-circle-outline" title={tenant.name} subtitle={`${prop?.name} · ${unit.name}`} right="Ändern" onPress={() => { setTenantId(''); setFilledFor(''); }} />
        ) : (
          <>
            <SearchBar value={q} onChangeText={setQ} placeholder="Mieter suchen" />
            {results.map((t) => <ListRow key={t.id} title={t.name} subtitle={db.units.find((u) => u.id === t.unitId)?.name} onPress={() => setTenantId(t.id)} />)}
            {results.length === 0 && <Note>Kein Mieter gefunden.</Note>}
          </>
        )}
      </Section>

      {ctx && (
        <>
          <Section title="Angaben">
            <DateField label="Datum des Schreibens" value={date} onChange={setDate} />
            {tpl.fields.map((fld) => fld.kind === 'choice' ? (
              <ChipField key={fld.key} label={fld.label} value={f[fld.key] ?? ''} options={fld.options ?? []} onChange={(v) => setF({ ...f, [fld.key]: v })} />
            ) : fld.kind === 'date' ? (
              <DateField key={fld.key} label={fld.label} value={f[fld.key] ?? ''} onChange={(v) => setF({ ...f, [fld.key]: v })} optional={fld.optional} />
            ) : (
              <Field key={fld.key} label={fld.label} value={f[fld.key] ?? ''} onChangeText={(v) => setF({ ...f, [fld.key]: v })} keyboard={fld.kind === 'money' ? 'numeric' : undefined} suffix={fld.kind === 'money' ? '€' : undefined} multiline={fld.kind === 'multiline'} placeholder={fld.optional ? 'optional' : undefined} hint={fld.hint} />
            ))}
          </Section>

          {rendered && (rendered.warnings.length > 0 || rendered.missing.length > 0) && (
            <Section title="Bitte prüfen">
              {rendered.warnings.map((w) => <Note key={w}>⚠ {w}</Note>)}
              {rendered.missing.length > 0 && <Note>Es fehlt noch: {rendered.missing.join(', ')}.</Note>}
            </Section>
          )}
          {rendered && <Text style={{ color: c.muted, fontSize: type.footnote, textAlign: 'center', marginBottom: 12 }}>Brief vom {dateDE(date)} an {tenant!.name}</Text>}
          <Button kind="secondary" icon="eye-outline" title="Vorschau als PDF" onPress={preview} disabled={!rendered} />
          <Gap h={8} />
          <Button icon="document-text" title={busy ? 'Wird erstellt …' : 'Im Briefausgang ablegen'} onPress={create} disabled={busy || !rendered || rendered.missing.length > 0} />
          <Gap h={10} />
          <Note>Änderungen am Text nimmst du in der Vorlage vor, nicht im PDF. Bei Fragen zur Wirksamkeit hilft eine rechtliche Prüfung.</Note>
        </>
      )}
    </Screen>
  );
}
