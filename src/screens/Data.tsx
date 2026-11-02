import React, { useState } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../store';
import { Btn, Card, Field, Muted, Screen, Title, confirm, notify } from '../ui';
import { demoData } from '../demo';
import { exportBackup, parseBackup, pickBackupFile } from '../backup';

export function DataScreen() {
  const { db, replaceAll } = useStore();
  const [text, setText] = useState('');
  const counts = `${db.properties.length} Objekte, ${db.units.length} Wohnungen, ${db.tenants.length} Mieter, ${db.payments.length} Zahlungen`;

  const doImport = (content: string) => {
    try {
      const next = parseBackup(content);
      const n = `${next.properties.length} Objekte, ${next.tenants.length} Mieter, ${next.payments.length} Zahlungen`;
      confirm(`Sicherung einspielen (${n})? Die aktuellen Daten werden ersetzt.`, () => {
        replaceAll(next);
        setText('');
        notify('Sicherung wurde eingespielt.');
      }, 'Einspielen');
    } catch (e: any) {
      notify(e.message);
    }
  };

  return (
    <Screen>
      <Title>Sicherung</Title>
      <Card>
        <Muted>Aktuell gespeichert: {counts}.</Muted>
        <Muted>Die Daten liegen nur auf diesem Gerät. Exportiere regelmäßig eine Sicherung, z. B. in iCloud Drive oder Google Drive.</Muted>
      </Card>
      <Btn title={Platform.OS === 'web' ? 'Sicherung herunterladen' : 'Sicherung exportieren'} onPress={() => exportBackup(db).catch((e) => notify(String(e?.message ?? e)))} />

      <Title>Beispieldaten</Title>
      <Muted>Lädt ein Beispiel-Objekt mit Wohnungen, Mietern und Zahlungen, damit du alle Funktionen ausprobieren kannst.</Muted>
      <Btn kind="ghost" title="Beispieldaten laden" onPress={() => confirm('Beispieldaten laden? Die aktuellen Daten werden ersetzt.', () => replaceAll(demoData()), 'Laden')} />

      <Title>Wiederherstellen</Title>
      {Platform.OS === 'web' && (
        <Btn kind="ghost" title="Sicherungsdatei auswählen" onPress={() => pickBackupFile().then((c) => c && doImport(c)).catch((e) => notify(String(e?.message ?? e)))} />
      )}
      <Field label="Oder Sicherungstext hier einfügen" value={text} onChangeText={setText} multiline />
      <Btn title="Sicherung einspielen" onPress={() => (text.trim() ? doImport(text) : notify('Bitte zuerst eine Datei wählen oder den Text einfügen.'))} />
    </Screen>
  );
}
