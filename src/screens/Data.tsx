import React, { useState } from 'react';
import { Platform, Text } from 'react-native';
import { useStore } from '../store';
import { useThemePref } from '../theme';
import { Button, Field, Segmented, Gap, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { demoData } from '../demo';
import { exportBackup, parseBackup, pickBackupFile } from '../backup';

export function DataScreen() {
  const { db, replaceAll } = useStore();
  const [text, setText] = useState('');
  const { pref, setPref } = useThemePref();
  const c = useColors();
  const empty = db.properties.length === 0;

  const doImport = (content: string) => {
    try {
      const next = parseBackup(content);
      const n = `${next.properties.length} Objekte, ${next.tenants.length} Mieter, ${next.payments.length} Zahlungen`;
      confirm('Sicherung einspielen?', () => {
        replaceAll(next);
        setText('');
        notify('Die Sicherung wurde eingespielt.');
      }, 'Einspielen', `Enthält ${n}. Die aktuellen Daten werden ersetzt.`);
    } catch (e: any) {
      notify(e.message);
    }
  };
  const fail = (e: any) => notify(String(e?.message ?? e));

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 20, marginTop: 6 }}>Sicherung und Darstellung</Text>
      <Section title="Darstellung">
        <Segmented value={pref} onChange={setPref} options={[{ label: 'Hell', value: 'hell' }, { label: 'Dunkel', value: 'dunkel' }, { label: 'Automatisch', value: 'auto' }]} />
      </Section>
      <Section title="Aktueller Bestand" footer="Deine Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig, z. B. in iCloud Drive oder Google Drive.">
        <ListRow icon="business" title="Objekte" right={String(db.properties.length)} />
        <ListRow icon="home" title="Wohnungen" right={String(db.units.length)} />
        <ListRow icon="people" title="Mieter" right={String(db.tenants.length)} />
        <ListRow icon="card" title="Zahlungen" right={String(db.payments.length)} />
      </Section>

      <Section title="Sicherung">
        <Note>Die Sicherung enthält alle deine Daten in einer Datei.</Note>
      </Section>
      <Button icon="download-outline" title={Platform.OS === 'web' ? 'Sicherung herunterladen' : 'Sicherung exportieren'} onPress={() => exportBackup(db).catch(fail)} disabled={empty} />
      <Gap h={22} />

      <Section title="Wiederherstellen">
        {Platform.OS === 'web' ? <ListRow icon="folder-open-outline" title="Sicherungsdatei auswählen" onPress={() => pickBackupFile().then((c) => c && doImport(c)).catch(fail)} /> : null}
        <Field label="Oder Sicherungstext einfügen" value={text} onChangeText={setText} multiline placeholder="Inhalt der Sicherungsdatei" />
      </Section>
      {text.trim() ? <Button kind="secondary" title="Eingefügten Text einspielen" onPress={() => doImport(text)} /> : null}
      <Gap h={22} />

      <Section title="Ausprobieren" footer="Lädt ein Beispiel-Objekt mit Mietern, Zahlungen und Betriebskosten, damit du alle Funktionen testen kannst.">
        <ListRow icon="flask-outline" title="Beispieldaten laden" onPress={() => confirm('Beispieldaten laden?', () => replaceAll(demoData()), 'Laden', empty ? undefined : 'Die aktuellen Daten werden ersetzt. Erstelle vorher eine Sicherung.')} />
      </Section>
    </Screen>
  );
}
