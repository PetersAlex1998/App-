import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { useStore } from '../store';
import { useThemePref } from '../theme';
import { useSettings } from '../settings';
import { Button, Field, Segmented, Gap, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { demoData } from '../demo';
import { exportBackup, parseBackup, pickBackupFile, restoreFiles } from '../backup';
import { filesSupported, fmtSize, requestPersistence, storageInfo } from '../files';

export function DataScreen({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const [text, setText] = useState('');
  const { pref, setPref } = useThemePref();
  const { s: cfg, update: updateCfg } = useSettings();
  const c = useColors();
  const empty = db.properties.length === 0;
  const [store, setStore] = useState<Awaited<ReturnType<typeof storageInfo>>>(null);
  const refreshStore = () => { if (filesSupported()) storageInfo().then(setStore); };
  useEffect(refreshStore, [db.documents.length]);
  const docBytes = db.documents.reduce((a, d) => a + d.size, 0);

  const doImport = (content: string) => {
    try {
      const { db: next, settings, files } = parseBackup(content);
      const n = `${next.properties.length} Objekte, ${next.tenants.length} Mieter, ${next.payments.length} Zahlungen`;
      confirm('Sicherung einspielen?', () => {
        replaceAll(next);
        if (settings) updateCfg(settings);
        if (files) restoreFiles(files).then(refreshStore);
        setText('');
        notify('Die Sicherung wurde eingespielt.');
      }, 'Einspielen', `Enthält ${n}${settings ? ', Absenderdaten und Mahnregeln' : ''}${files ? ` und ${Object.keys(files).length} Dokumente` : ''}. Die aktuellen Daten werden ersetzt.`);
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

      {filesSupported() && (
        <Section title="Speicher" footer={store && !store.persisted ? 'Der Browser darf diese Daten im Notfall löschen, z. B. bei Speichermangel. Lege die App auf den Home-Bildschirm und fordere dauerhaften Speicher an. Sichere außerdem regelmäßig.' : undefined}>
          <ListRow icon="document-attach" title="Dokumente und Fotos" right={`${db.documents.length}`} rightSub={fmtSize(docBytes)} />
          {store ? <ListRow icon="server-outline" title="Belegter Speicher" right={fmtSize(store.usage)} rightSub={`von ${fmtSize(store.quota)}`} /> : null}
          {store ? <ListRow icon={store.persisted ? 'shield-checkmark' : 'shield-outline'} iconTone={store.persisted ? 'ok' : 'warn'} title={store.persisted ? 'Dauerhaft gesichert' : 'Dauerhaften Speicher anfordern'} subtitle={store.persisted ? 'Der Browser löscht die Daten nicht von selbst.' : 'Schützt vor automatischem Löschen'} onPress={store.persisted ? undefined : () => requestPersistence().then((ok) => { refreshStore(); if (!ok) notify('Der Browser hat den Antrag abgelehnt. Lege die App auf den Home-Bildschirm und versuche es erneut.'); })} /> : null}
        </Section>
      )}

      <Section title="Briefe und Mahnwesen">
        <ListRow icon="mail-outline" title="Absender und Mahnregeln" subtitle="Adresse, IBAN, Gebühren, Fristen" onPress={() => navigation.navigate('Briefe')} />
      </Section>

      <Section title="Importieren">
        <ListRow icon="albums-outline" title="Bestand aus CSV importieren" subtitle="Häuser, Einheiten und Mieter auf einmal anlegen" onPress={() => navigation.navigate('BestandImport')} />
        <ListRow icon="swap-vertical-outline" title="Kontoauszug importieren" subtitle="Zahlungseingänge automatisch zuordnen" onPress={() => navigation.navigate('StatementImport')} />
      </Section>

      <Section title="Sicherung">
        <Note>Die Sicherung enthält alle Daten, deine Absenderdaten, das Logo und die Mahnregeln in einer Datei.</Note>
      </Section>
      <Button icon="download-outline" title={Platform.OS === 'web' ? 'Sicherung herunterladen' : 'Sicherung exportieren'} onPress={() => exportBackup(db, cfg).catch(fail)} disabled={empty} />
      {filesSupported() && db.documents.length > 0 && (
        <>
          <Gap h={8} />
          <Button kind="secondary" icon="albums-outline" title={`Vollsicherung mit ${db.documents.length} Dokumenten (${fmtSize(docBytes)})`} onPress={() => exportBackup(db, cfg, true).catch(fail)} />
        </>
      )}
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
