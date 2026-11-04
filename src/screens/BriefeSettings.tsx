import React from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { useSettings } from '../settings';
import { Button, Field, Gap, ListRow, Note, Screen, Section, Segmented, notify, useColors } from '../ui';
import { pickLogo } from '../image';
import { exportPdf, sampleLetterHtml } from '../pdf';
import { sampleModel, testLetterMissing, testLetterModel } from '../letters';
import { filesSupported } from '../files';
import { storeLetters } from '../outbox';
import { useStore } from '../store';
import { modelToPdf } from '../pdfgen';
import { pdfBlob } from '../outbox';
import { downloadBlob } from '../dispatch';
import { num } from '../calc';
import { type } from '../theme';

export function BriefeSettings({ navigation }: any) {
  const { s, update } = useSettings();
  const { save } = useStore();
  const c = useColors();
  const makeTestLetter = async () => {
    const missing = testLetterMissing(s);
    if (missing.length) return notify(`Für den Testbrief fehlen Absenderangaben: ${missing.join(', ')}.`);
    try {
      if (!filesSupported()) return exportPdf(sampleLetterHtml(s));
      const self = { id: 'self', unitId: '', name: s.name, email: '', phone: '', moveIn: '', moveOut: '', deposit: 0 };
      const [doc] = await storeLetters([{ model: testLetterModel(s), tenant: self, note: 'Testbrief an mich selbst' }]);
      save('documents', doc);
      navigation.navigate('Outbox');
    } catch (e: any) { notify(String(e?.message ?? e)); }
  };
  const t = (k: 'name' | 'street' | 'zip' | 'city' | 'phone' | 'email' | 'bank' | 'iban' | 'bic') => (v: string) => update({ [k]: v });
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Briefe und Mahnregeln</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 18 }}>Hier legst du fest, wann gemahnt wird und welche Gebühren gelten. Änderungen werden sofort gespeichert.</Text>
      <Section title="Versand per Post" footer="Die Anforderungen deines Versanddienstes (z. B. der E-POST Mailer der Deutschen Post) solltest du dort nachlesen. Teile mir Abweichungen mit, dann passe ich den Briefbogen an.">
        <Note>Die Briefe sind nach DIN 5008 (Form B) aufgebaut: Anschrift im Fenster, Rücksendezeile, Falz- und Lochmarken, A4. Erstellte Briefe liegen als PDF im Briefausgang. Du teilst sie über das Teilen-Menü deines Handys (z. B. an E-Mail oder eine Post-App) und markierst sie danach als versendet.</Note>
      </Section>
      <Section title="Absender und Briefkopf" footer="Firma, Anschrift, Steuer, Bank, Logo und Unterschrift pflegst du zentral in den Unternehmensdaten.">
        <ListRow icon="business-outline" title="Unternehmensdaten" subtitle={s.name ? `${s.name}${s.iban ? ' · IBAN hinterlegt' : ''}` : 'Noch nicht ausgefüllt'} onPress={() => navigation.navigate('Unternehmen')} />
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
      <Button icon="paper-plane-outline" title="Testbrief an mich selbst erstellen" onPress={makeTestLetter} />
      <Gap h={8} />
      <Button kind="secondary" icon="eye-outline" title="Probe-Brief ansehen" onPress={() => (Platform.OS === 'web' ? modelToPdf(sampleModel(s)).then((b) => { const url = URL.createObjectURL(pdfBlob(b)); const w = window.open(url, '_blank'); if (!w) downloadBlob(pdfBlob(b), 'Probe-Brief.pdf'); }) : exportPdf(sampleLetterHtml(s))).catch((e) => notify(String(e?.message ?? e)))} />
      <Gap h={14} />
      <Note>Die Brieftexte sind Standardformulierungen. Lass sie einmal von einem Anwalt oder deinem Eigentümerverband prüfen.</Note>
      <Gap h={10} />
    </Screen>
  );
}
