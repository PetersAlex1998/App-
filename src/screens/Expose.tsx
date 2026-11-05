import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, DateField, EmptyState, Field, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { eur, num, today } from '../calc';
import { ExposeInput, buildExpose, exposeDefaults, exposeWarnings } from '../expose';
import { photoBytes, photoDocs } from '../exposePhotos';
import { exposeToPdf } from '../pdfgen';
import { pdfBlob } from '../outbox';
import { filesSupported, putBlob } from '../files';
import { type } from '../theme';

/** Vermietungs-Exposé für eine Einheit erstellen: Angaben prüfen, Fotos wählen, PDF erzeugen. */
export function Expose({ route, navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const unit = db.units.find((u) => u.id === route.params?.unitId);
  const prop = unit ? db.properties.find((p) => p.id === unit.propertyId) : undefined;
  const photos = unit ? photoDocs(db, unit) : [];
  const [f, setF] = useState<ExposeInput | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [rent, setRent] = useState('');
  const [adv, setAdv] = useState('');
  const [dep, setDep] = useState('');
  const [features, setFeatures] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unit || !prop || f) return;
    const d = exposeDefaults(db, unit, prop);
    setF(d); setRent(String(d.rent).replace('.', ',')); setAdv(String(d.advance).replace('.', ',')); setDep(String(d.deposit).replace('.', ',')); setFeatures(d.features.join('\n'));
  }, [unit?.id]);

  if (!unit || !prop) return <Screen><EmptyState icon="home" title="Einheit nicht gefunden" text="Öffne das Exposé aus einer Wohnung." /></Screen>;
  if (!f) return <Screen><Text style={{ color: c.muted }}>Wird vorbereitet …</Text></Screen>;
  const sel = picked ?? photos.slice(0, 4).map((d) => d.id);
  const input: ExposeInput = { ...f, rent: num(rent), advance: num(adv), deposit: num(dep), features: features.split('\n').map((x) => x.trim()).filter(Boolean) };
  const warnings = exposeWarnings(db, unit, prop, input, cfg, sel.length);
  const set = (patch: Partial<ExposeInput>) => setF({ ...f, ...patch });

  const create = async (store: boolean) => {
    if (Platform.OS !== 'web') return notify('Das Exposé ist in der Web-App verfügbar.');
    setBusy(true);
    try {
      const bytes = (await Promise.all(sel.map((id) => photoBytes(id)))).filter((b): b is Uint8Array => !!b);
      const model = { ...buildExpose(db, unit, prop, cfg, input), hero: bytes[0], gallery: bytes.slice(1) };
      const pdf = await exposeToPdf(model);
      const blob = pdfBlob(pdf);
      if (store && filesSupported()) {
        const id = uid();
        await putBlob(id, blob);
        save('documents', { id, ownerKind: 'unit', ownerId: unit.id, category: 'sonstiges', name: `Exposé ${unit.name} ${today()}`, mime: 'application/pdf', size: pdf.length, added: today(), status: 'bereit', note: 'Exposé' });
      }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (store) notify('Das Exposé liegt jetzt bei den Dokumenten der Wohnung.');
    } catch (e: any) { notify(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 4 }}>Exposé</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{unit.name} · {prop.name}. Das Exposé enthält keine Mieterdaten.</Text>

      {warnings.length > 0 && (
        <Section title="Bitte prüfen">{warnings.map((w, i) => <View key={i} style={{ padding: 12 }}><Badge text={w} tone="warn" /></View>)}</Section>
      )}

      <Section title="Angebot">
        <Field label="Titel" value={f.title} onChangeText={(v) => set({ title: v })} />
        <Field label="Kaltmiete pro Monat" value={rent} onChangeText={setRent} keyboard="numeric" suffix="€" hint={unit.area > 0 && num(rent) > 0 ? `${eur(num(rent) / unit.area)} pro m²` : undefined} />
        <Field label="Nebenkosten-Vorauszahlung" value={adv} onChangeText={setAdv} keyboard="numeric" suffix="€" />
        <Field label="Kaution" value={dep} onChangeText={setDep} keyboard="numeric" suffix="€" hint="Höchstens drei Nettokaltmieten" />
        <DateField label="Verfügbar ab" value={f.availableFrom} onChange={(v) => set({ availableFrom: v })} optional />
        <ListRow icon={f.hideHouseNo ? 'checkbox' : 'square-outline'} title="Hausnummer nicht nennen" subtitle="Bis zur Besichtigung nur die Straße anzeigen" onPress={() => set({ hideHouseNo: !f.hideHouseNo })} />
      </Section>

      <Section title="Texte">
        <Field label="Beschreibung" value={f.description} onChangeText={(v) => set({ description: v })} multiline />
        <Field label="Ausstattung (eine Zeile je Punkt)" value={features} onChangeText={setFeatures} multiline />
        <Field label="Lage und Umgebung" value={f.location} onChangeText={(v) => set({ location: v })} multiline placeholder="z. B. Bushaltestelle 200 m, Einkaufen im Ort, ruhige Seitenstraße" />
      </Section>

      <Section title="Fotos" footer={photos.length === 0 ? 'Lege Fotos bei der Wohnung oder dem Haus unter Dokumente ab (Kategorie Foto). Das erste Foto wird groß gezeigt.' : 'Das erste gewählte Foto wird groß gezeigt, die anderen klein darunter.'}>
        {photos.map((d) => {
          const on = sel.includes(d.id);
          return <ListRow key={d.id} icon={on ? 'checkbox' : 'square-outline'} iconTone={on ? 'primary' : undefined} title={d.name} subtitle={d.ownerKind === 'unit' ? 'Wohnung' : 'Haus'} onPress={() => setPicked(on ? sel.filter((i) => i !== d.id) : [...sel, d.id])} />;
        })}
      </Section>

      <Button icon="document-text-outline" title={busy ? 'Wird erstellt …' : 'Exposé ansehen'} onPress={() => create(false)} disabled={busy} />
      <View style={{ height: 10 }} />
      <Button kind="secondary" icon="save-outline" title="Erstellen und bei der Wohnung ablegen" onPress={() => create(true)} disabled={busy} />
      <View style={{ height: 14 }} />
      <Note>Alle Angaben ohne Gewähr. Prüfe Miete, Energieangaben und Texte, bevor du das Exposé weitergibst.</Note>
    </Screen>
  );
}
