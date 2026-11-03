import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Field, Gap, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { useCloud } from '../syncProvider';
import { useOnline } from '../pwa';
import { stamp } from '../payments';
import { type } from '../theme';

export function CloudScreen() {
  const c = useColors();
  const cloud = useCloud();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (mode: 'in' | 'up') => {
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (password.length < 8) return setErr('Das Passwort braucht mindestens 8 Zeichen.');
    setBusy(true);
    try {
      if (mode === 'in') await cloud.signIn(email, password);
      else if ((await cloud.signUp(email, password)) === 'bestaetigen') notify('Fast geschafft: Wir haben dir eine E-Mail geschickt. Bestätige den Link darin und melde dich dann hier an.');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    setBusy(false);
  };

  const title = <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 20, marginTop: 6 }}>Cloud</Text>;

  if (!cloud.email) {
    return (
      <Screen>
        {title}
        <Note>Mit der Cloud liegen deine Daten sicher in der EU und sind auf all deinen Geräten gleich. Die App funktioniert weiter offline und gleicht ab, sobald du Netz hast.</Note>
        <Gap h={12} />
        <Section title="Anmelden oder Konto erstellen" footer="Beim ersten Abgleich werden die Daten dieses Geräts hochgeladen. Danach holt jedes weitere Gerät sie nach der Anmeldung ab.">
          <Field label="E-Mail" value={email} onChangeText={setEmail} keyboard="email-address" />
          <Field label="Passwort" value={password} onChangeText={setPassword} secure hint="Mindestens 8 Zeichen. Ein Passwort-Manager ist ideal." />
        </Section>
        {err ? <View style={{ marginBottom: 12 }}><Badge text={err} tone="danger" /></View> : null}
        {!online && <View style={{ marginBottom: 12 }}><Badge text="Du bist offline. Zum Anmelden brauchst du Internet." tone="warn" /></View>}
        <Button icon="log-in-outline" title={busy ? 'Einen Moment …' : 'Anmelden'} onPress={() => go('in')} disabled={busy || !online} />
        <Gap h={8} />
        <Button kind="secondary" icon="person-add-outline" title="Neues Konto erstellen" onPress={() => go('up')} disabled={busy || !online} />
      </Screen>
    );
  }

  const r = cloud.last;
  return (
    <Screen>
      {title}
      <Section title="Verbindung">
        <ListRow icon="person-circle-outline" title={cloud.email} subtitle="Angemeldet" />
        <ListRow icon={cloud.status === 'fehler' ? 'alert-circle' : 'checkmark-circle'} iconTone={cloud.status === 'fehler' ? 'warn' : 'ok'}
          title={cloud.status === 'laeuft' ? 'Gleicht gerade ab …' : cloud.status === 'fehler' ? 'Abgleich fehlgeschlagen' : 'Alles abgeglichen'}
          subtitle={cloud.status === 'fehler' ? cloud.error : cloud.lastSyncAt ? `Zuletzt ${stamp(cloud.lastSyncAt)}` : 'Noch nicht abgeglichen'} />
        {r && <ListRow icon="swap-vertical-outline" title="Letzter Abgleich" subtitle={`${r.pulled} empfangen · ${r.pushed} gesendet · ${r.deleted} gelöscht · ${r.files} Dateien`} />}
      </Section>
      <Button icon="sync" title={cloud.status === 'laeuft' ? 'Gleicht ab …' : 'Jetzt abgleichen'} onPress={cloud.syncNow} disabled={cloud.status === 'laeuft' || !online} />
      <Gap h={22} />
      <Section title="Hinweise" footer="Der Abgleich läuft automatisch: beim Öffnen, nach Änderungen und wenn das Netz zurückkehrt. Ändern zwei Geräte denselben Eintrag, gewinnt die neuere Änderung.">
        <Note>Deine Sicherungsdatei (Daten → Sicherung) bleibt als zusätzliche Absicherung sinnvoll.</Note>
      </Section>
      <Button kind="destructive" icon="log-out-outline" title="Abmelden" onPress={() => confirm('Abmelden?', () => { cloud.signOut(); }, 'Abmelden', 'Die Daten bleiben auf diesem Gerät und in der Cloud erhalten.')} />
    </Screen>
  );
}
