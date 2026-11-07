import React, { useRef } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { useSettings } from '../settings';
import { Badge, Button, ChipField, Disclosure, Field, Gap, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { pickLogo } from '../image';
import { PadHandle, SignaturePad } from '../SignaturePad';
import { LEGAL_FORMS, completeness, footerLines, formatIban, placeholders, returnLine, senderLines, signatureLines, validIban } from '../company';
import { type } from '../theme';
import { pdfBlob } from '../outbox';
import { modelToPdf } from '../pdfgen';
import { sampleModel } from '../letters';

const LABEL = { brief: 'Briefe', zahlung: 'Zahlungsaufforderung', steuer: 'Fußzeile / Steuer' } as const;

/** Unternehmensstammdaten: hier einmal pflegen, alle Briefe und späteren Dokumente nutzen genau diese Angaben. */
export function CompanyScreen() {
  const { s, update } = useSettings();
  const c = useColors();
  const pad = useRef<PadHandle>(null);
  const done = completeness(s);
  const t = (k: 'name' | 'owner' | 'street' | 'zip' | 'city' | 'phone' | 'email' | 'web' | 'taxNo' | 'vatId' | 'taxOffice' | 'register' | 'accountHolder' | 'iban' | 'bic' | 'bank' | 'closing' | 'signerName' | 'signerRole') => (v: string) => update({ [k]: v });
  const ibanBad = s.iban.trim() !== '' && !validIban(s.iban);
  const foot = footerLines(s);
  const sig = signatureLines(s);
  const ph = placeholders(s);

  const preview = () => {
    if (Platform.OS !== 'web') return notify('Die Vorschau ist in der Web-App verfügbar.');
    modelToPdf(sampleModel(s)).then((b) => { const url = URL.createObjectURL(pdfBlob(b)); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }).catch((e) => notify(String(e?.message ?? e)));
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Unternehmensdaten</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 18 }}>Pflege deine Angaben einmal hier. Alle Briefe und später auch Verträge und Abrechnungen übernehmen sie automatisch. Änderungen werden sofort gespeichert.</Text>

      <View accessible accessibilityLabel={`${done.done} von ${done.total} Angaben vollständig`} style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 22, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: c.text, fontSize: type.headline, fontWeight: '700' }}>{done.missing.length === 0 ? 'Alles vollständig' : `${done.done} von ${done.total} vollständig`}</Text>
          {done.missing.length === 0 && <Badge text="Bereit" tone="ok" />}
        </View>
        <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: c.fill, overflow: 'hidden' }}>
          <View style={{ width: `${(done.done / done.total) * 100}%`, height: '100%', backgroundColor: done.missing.length ? c.primary : c.ok, borderRadius: 5 }} />
        </View>
        {done.missing.length > 0 && <Text style={{ color: c.muted, fontSize: type.subhead }}>Es fehlt noch: {done.missing.map((m) => `${m.label} (${LABEL[m.needed]})`).join(', ')}.</Text>}
      </View>

      <Section title="Firma">
        <Field label="Name oder Firma" value={s.name} onChangeText={t('name')} placeholder="z. B. Mustermann Immobilien" />
        <ChipField label="Rechtsform" value={s.legalForm} options={[...LEGAL_FORMS]} onChange={(v) => update({ legalForm: v })} />
        <Field label="Inhaber oder Geschäftsführung" value={s.owner} onChangeText={t('owner')} placeholder="optional" />
      </Section>

      <Section title="Anschrift">
        <Field label="Straße und Hausnummer" value={s.street} onChangeText={t('street')} />
        <Field label="PLZ" value={s.zip} onChangeText={t('zip')} keyboard="numeric" />
        <Field label="Ort" value={s.city} onChangeText={t('city')} />
      </Section>

      <Section title="Kontakt">
        <Field label="Telefon" value={s.phone} onChangeText={t('phone')} keyboard="phone-pad" placeholder="optional" />
        <Field label="E-Mail" value={s.email} onChangeText={t('email')} keyboard="email-address" placeholder="optional" />
        <Field label="Internetseite" value={s.web} onChangeText={t('web')} placeholder="optional" />
      </Section>

      <Section title="Steuer und Register" footer="Erscheint automatisch in der Fußzeile jedes Briefs.">
        <Field label="Steuernummer" value={s.taxNo} onChangeText={t('taxNo')} placeholder="optional" />
        <Field label="Umsatzsteuer-Identifikationsnummer" value={s.vatId} onChangeText={t('vatId')} placeholder="optional" />
        <Field label="Finanzamt" value={s.taxOffice} onChangeText={t('taxOffice')} placeholder="optional" />
        <Field label="Handelsregister" value={s.register} onChangeText={t('register')} placeholder="z. B. Amtsgericht Paderborn, HRB 1234" />
      </Section>

      <Section title="Bankverbindung" footer="Für Zahlungsaufforderungen, Mahnungen und Abrechnungen.">
        <Field label="Kontoinhaber" value={s.accountHolder} onChangeText={t('accountHolder')} placeholder="leer = Firmenname" />
        <Field label="IBAN des Mieteingangskontos" value={s.iban} onChangeText={t('iban')} error={ibanBad ? 'Diese IBAN ist nicht gültig. Bitte Ziffern prüfen.' : undefined} hint={validIban(s.iban) ? `Gültig: ${formatIban(s.iban)}` : undefined} />
        <Field label="BIC" value={s.bic} onChangeText={t('bic')} placeholder="optional" />
        <Field label="Bank" value={s.bank} onChangeText={t('bank')} placeholder="optional" />
      </Section>

      <Section title="Briefkopf" footer={Platform.OS === 'web' ? 'Das Logo wird verkleinert und in der Sicherung mitgespeichert.' : 'Das Logo wählst du in der Web-App aus.'}>
        {s.logo ? (
          <View style={{ padding: 16, alignItems: 'flex-start' }}>
            <Image source={{ uri: s.logo }} accessibilityLabel="Logo" style={{ width: 240, height: 64 }} resizeMode="contain" />
          </View>
        ) : <Note>Noch kein Logo hinterlegt.</Note>}
        {Platform.OS === 'web' ? <ListRow icon="image-outline" title={s.logo ? 'Logo ändern' : 'Logo auswählen'} subtitle="PNG, JPG oder WebP" onPress={() => pickLogo().then((u) => u && update({ logo: u })).catch((e) => notify(String(e?.message ?? e)))} /> : null}
        {s.logo ? <ListRow icon="trash-outline" iconTone="danger" title="Logo entfernen" onPress={() => update({ logo: '' })} /> : null}
      </Section>

      <Section title="Unterschrift">
        <Field label="Grußformel" value={s.closing} onChangeText={t('closing')} placeholder="Mit freundlichen Grüßen" />
        <Field label="Unterzeichner" value={s.signerName} onChangeText={t('signerName')} placeholder="leer = Firmenname" />
        <Field label="Funktion" value={s.signerRole} onChangeText={t('signerRole')} placeholder="z. B. Geschäftsführer" />
      </Section>

      <Section title="Meine Unterschrift" footer="Einmal mit dem Finger zeichnen. Sie wird dann in Schreiben und Verträgen automatisch in das Feld gesetzt. Bei Mietvertrag und Kündigung setzt du sie beim Unterschreiben selbst ein, oder schaltest unten die Automatik ein.">
        {s.signature ? (
          <View style={{ padding: 14, gap: 8 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: c.glassBorder, padding: 10, height: 100, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: s.signature }} accessibilityLabel="Gespeicherte Unterschrift" style={{ width: '100%', height: 80 }} resizeMode="contain" />
            </View>
          </View>
        ) : <Note>Noch keine Unterschrift gespeichert.</Note>}
        {Platform.OS === 'web' ? (
          <View style={{ padding: 14, gap: 10 }}>
            <SignaturePad ref={pad} label="Meine Unterschrift" />
            <Button icon="checkmark" title={s.signature ? 'Neue Unterschrift speichern' : 'Unterschrift speichern'} onPress={() => { const u = pad.current?.toDataUrl(); if (!u) return notify('Bitte zuerst im Feld unterschreiben.'); update({ signature: u }); pad.current?.clear(); notify('Unterschrift gespeichert.'); }} />
          </View>
        ) : <Note>Die Unterschrift zeichnest du in der Web-App.</Note>}
        {s.signature ? <ListRow icon={s.autoSign ? 'checkbox' : 'square-outline'} title="Automatisch in Schreiben einsetzen" subtitle="Mahnungen, Abrechnungen, Bescheinigungen und weitere" onPress={() => update({ autoSign: !s.autoSign })} /> : null}
        {s.signature ? <ListRow icon={s.autoSignFormal ? 'checkbox' : 'square-outline'} title="Auch bei Mietvertrag und Kündigung einsetzen" subtitle="Dort verlangt das Gesetz meist die Unterschrift auf Papier. Beim Erstellen kannst du trotzdem am Handy unterschreiben." onPress={() => update({ autoSignFormal: !s.autoSignFormal })} /> : null}
        {s.signature ? <ListRow icon="trash-outline" iconTone="danger" title="Unterschrift löschen" onPress={() => update({ signature: '' })} /> : null}
      </Section>

      <Section title="Fußzeile" footer="Zuerst Steuer und Register, dann dein Text, zuletzt die Bankverbindung.">
        <ListRow icon={s.footerAuto ? 'checkbox' : 'square-outline'} title="Aus den Stammdaten bilden" subtitle="Steuernummer, USt-IdNr., Finanzamt, Register, Inhaber" onPress={() => update({ footerAuto: !s.footerAuto })} chevron={false} />
        <Field label="Zusätzlicher Text" value={s.footer} onChangeText={(v) => update({ footer: v })} multiline placeholder="z. B. Hinweis oder Öffnungszeiten" />
      </Section>

      <Section title="So sieht es im Brief aus">
        <View accessible accessibilityLabel="Vorschau des Briefkopfs und der Fußzeile" style={{ padding: 16, gap: 14, backgroundColor: '#FFFFFF', borderRadius: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Text style={{ color: '#555', fontSize: 9, textDecorationLine: 'underline' }}>{returnLine(s) || 'Absender erscheint hier'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 1 }}>
              {s.logo ? <Image source={{ uri: s.logo }} style={{ width: 140, height: 40, marginBottom: 4 }} resizeMode="contain" /> : null}
              {senderLines(s).map((l, i) => <Text key={i} style={{ color: '#111', fontSize: i === 0 ? 12 : 10, fontWeight: i === 0 ? '700' : '400', textAlign: 'right' }}>{l}</Text>)}
            </View>
          </View>
          <View style={{ gap: 1 }}>{sig.map((l, i) => <Text key={i} style={{ color: '#111', fontSize: 11 }}>{l}</Text>)}</View>
          <View style={{ borderTopWidth: 1, borderTopColor: '#CCC', paddingTop: 8, gap: 1 }}>
            {foot.length === 0 ? <Text style={{ color: '#888', fontSize: 9 }}>Die Fußzeile erscheint, sobald Angaben vorhanden sind.</Text> : foot.map((l, i) => <Text key={i} style={{ color: '#555', fontSize: 9, textAlign: 'center' }}>{l}</Text>)}
          </View>
        </View>
      </Section>
      <Button kind="secondary" icon="eye-outline" title="Probe-Brief als PDF ansehen" onPress={preview} />
      <Gap h={22} />

      <Disclosure title="Platzhalter für Dokumente" hint="Diese Werte stehen später in Verträgen und Vorlagen zur Verfügung">
        {Object.entries(ph).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Text style={{ color: c.primary, fontSize: type.footnote, fontWeight: '700' }}>{`{{${k}}}`}</Text>
            <Text numberOfLines={1} style={{ color: c.muted, fontSize: type.footnote, flexShrink: 1, textAlign: 'right' }}>{v || '–'}</Text>
          </View>
        ))}
      </Disclosure>
    </Screen>
  );
}
