import React from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { useSettings } from '../settings';
import { Button, Field, Gap, ListRow, Note, Screen, Section, Segmented, notify, useColors } from '../ui';
import { pickLogo } from '../image';
import { exportPdf, sampleLetterHtml } from '../pdf';
import { sampleModel } from '../letters';
import { modelToPdf } from '../pdfgen';
import { pdfBlob } from '../outbox';
import { downloadBlob } from '../dispatch';
import { num } from '../calc';
import { type } from '../theme';

export function BriefeSettings() {
  const { s, update } = useSettings();
  const c = useColors();
  const t = (k: 'name' | 'street' | 'zip' | 'city' | 'phone' | 'email' | 'bank' | 'iban' | 'bic') => (v: string) => update({ [k]: v });
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Briefe und Mahnregeln</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 18 }}>Diese Angaben erscheinen in Mahnungen und Nebenkostenabrechnungen. Änderungen werden sofort gespeichert.</Text>
      <Section title="Versand per Post" footer="Die Anforderungen deines Versanddienstes (z. B. der E-POST Mailer der Deutschen Post) solltest du dort nachlesen. Teile mir Abweichungen mit, dann passe ich den Briefbogen an.">
        <Note>Die Briefe sind nach DIN 5008 (Form B) aufgebaut: Anschrift im Fenster, Rücksendezeile, Falz- und Lochmarken, A4. Erstellte Briefe liegen als PDF im Briefausgang. Du teilst sie über das Teilen-Menü deines Handys (z. B. an E-Mail oder eine Post-App) und markierst sie danach als versendet.</Note>
      </Section>
      <Section title="Briefkopf" footer={Platform.OS === 'web' ? 'Das Logo wird verkleinert und in der Sicherung mitgespeichert.' : 'Das Logo wählst du in der Web-App aus. Es wird mit der Sicherung übertragen.'}>
        {s.logo ? (
          <View style={{ padding: 16, alignItems: 'flex-start' }}>
            <Image source={{ uri: s.logo }} accessibilityLabel="Logo" style={{ width: 240, height: 64 }} resizeMode="contain" />
          </View>
        ) : <Note>Noch kein Logo hinterlegt.</Note>}
        {Platform.OS === 'web' ? <ListRow icon="image-outline" title={s.logo ? 'Logo ändern' : 'Logo auswählen'} subtitle="PNG, JPG oder WebP" onPress={() => pickLogo().then((u) => u && update({ logo: u })).catch((e) => notify(String(e?.message ?? e)))} /> : null}
        {s.logo ? <ListRow icon="trash-outline" iconTone="danger" title="Logo entfernen" onPress={() => update({ logo: '' })} /> : null}
      </Section>
      <Section title="Absender">
        <Field label="Name / Firma" value={s.name} onChangeText={t('name')} placeholder="z. B. Max Mustermann Immobilien" />
        <Field label="Straße und Hausnummer" value={s.street} onChangeText={t('street')} />
        <Field label="PLZ" value={s.zip} onChangeText={t('zip')} keyboard="numeric" />
        <Field label="Ort" value={s.city} onChangeText={t('city')} />
        <Field label="Telefon" value={s.phone} onChangeText={t('phone')} keyboard="phone-pad" placeholder="optional" />
        <Field label="E-Mail" value={s.email} onChangeText={t('email')} keyboard="email-address" placeholder="optional" />
      </Section>
      <Section title="Bankverbindung für Zahlungen">
        <Field label="IBAN des Mieteingangskontos" value={s.iban} onChangeText={t('iban')} />
        <Field label="BIC" value={s.bic} onChangeText={t('bic')} placeholder="optional" />
        <Field label="Bank" value={s.bank} onChangeText={t('bank')} placeholder="optional" />
      </Section>
      <Section title="Fußzeile" footer="Erscheint unten auf jedem Brief, zusammen mit der Bankverbindung.">
        <Field label="Fußzeile" value={s.footer} onChangeText={(v) => update({ footer: v })} multiline placeholder="z. B. Steuernummer, USt-IdNr., Registergericht" />
      </Section>
      <Section title="Fälligkeit" footer={`Die Miete des laufenden Monats gilt ab dem ${s.rentDueDay + s.graceDays}. als überfällig (Fälligkeit ${s.rentDueDay}. plus ${s.graceDays} Tage Karenz).`}>
        <Field label="Miete fällig am (Tag im Monat)" value={String(s.rentDueDay)} onChangeText={(v) => update({ rentDueDay: Math.min(28, Math.max(1, Math.round(num(v)) || 1)) })} keyboard="numeric" />
        <Field label="Karenz in Tagen (Zahlungseingang abwarten)" value={String(s.graceDays)} onChangeText={(v) => update({ graceDays: Math.min(20, Math.max(0, Math.round(num(v)) || 0)) })} keyboard="numeric" />
      </Section>
      <Section title="Mahnfrist">
        <Segmented value={s.deadlineDays} onChange={(v) => update({ deadlineDays: v })} options={[{ label: '7 Tage', value: 7 }, { label: '10 Tage', value: 10 }, { label: '14 Tage', value: 14 }]} />
      </Section>
      <Section title="Mahngebühren" footer="Die Zahlungserinnerung ist gebührenfrei. Für Wohnraum sollten Gebühren angemessen bleiben.">
        <Field label="1. Mahnung" value={String(s.fee2)} onChangeText={(v) => update({ fee2: Math.max(0, num(v)) })} keyboard="numeric" suffix="€" />
        <Field label="2. Mahnung" value={String(s.fee3)} onChangeText={(v) => update({ fee3: Math.max(0, num(v)) })} keyboard="numeric" suffix="€" />
      </Section>
      <Button kind="secondary" icon="eye-outline" title="Probe-Brief ansehen" onPress={() => (Platform.OS === 'web' ? modelToPdf(sampleModel(s)).then((b) => { const url = URL.createObjectURL(pdfBlob(b)); const w = window.open(url, '_blank'); if (!w) downloadBlob(pdfBlob(b), 'Probe-Brief.pdf'); }) : exportPdf(sampleLetterHtml(s))).catch((e) => notify(String(e?.message ?? e)))} />
      <Gap h={14} />
      <Note>Die Brieftexte sind Standardformulierungen. Lass sie einmal von einem Anwalt oder deinem Eigentümerverband prüfen.</Note>
      <Gap h={10} />
    </Screen>
  );
}
