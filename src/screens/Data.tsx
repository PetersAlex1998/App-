import React, { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { useStore } from '../store';
import { useThemePref } from '../theme';
import { useSettings } from '../settings';
import { Button, Field, Segmented, Gap, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { demoData } from '../demo';
import { EncryptedBackupError, exportBackup, isEncryptedBackup, parseBackupAny, pickBackupFile, restoreFiles } from '../backup';
import { cryptoAvailable } from '../crypto';
import { dateDE } from '../calc';
import { filesSupported, fmtSize, requestPersistence, storageInfo } from '../files';

export function DataScreen({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { pref, setPref } = useThemePref();
  const { s: cfg, update: updateCfg } = useSettings();
  const c = useColors();
  const empty = db.properties.length === 0;
  const [store, setStore] = useState<Awaited<ReturnType<typeof storageInfo>>>(null);
  const refreshStore = () => { if (filesSupported()) storageInfo().then(setStore); };
  useEffect(refreshStore, [db.documents.length]);
  const docBytes = db.documents.reduce((a, d) => a + d.size, 0);

  const lastBackup = cfg.lastBackupAt ? Date.parse(cfg.lastBackupAt) : 0;
  const daysAgo = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  const overdue = cfg.backupRemindDays > 0 && !empty && (daysAgo === null || daysAgo >= cfg.backupRemindDays);

  const doImport = async (content: string) => {
    try {
      const { db: next, settings, files } = await parseBackupAny(content, password || undefined);
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
  const backup = async (withFiles: boolean) => {
    if (password && password.length < 8) return notify('Das Passwort sollte mindestens 8 Zeichen haben.');
    setBusy(true);
    try {
      const r = await exportBackup(db, cfg, { withFiles, password: password || undefined });
      if (r !== 'cancelled') updateCfg({ lastBackupAt: new Date().toISOString() });
    } catch (e: any) { notify(String(e?.message ?? e)); }
    setBusy(false);
  };
  const fail = (e: any) => notify(String(e?.message ?? e));

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 20, marginTop: 6 }}>Sicherung und Darstellung</Text>
      <Section title="Darstellung">
        <Segmented value={pref} onChange={setPref} options={[{ label: 'Hell', value: 'hell' }, { label: 'Dunkel', value: 'dunkel' }, { label: 'Automatisch', value: 'auto' }]} />
      </Section>
      <Section title="Aktueller Bestand" footer="Deine Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.">
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

      <Section title="Sicherheit">
        <ListRow icon="lock-closed-outline" title="App-Sperre" subtitle="Code beim Öffnen der App verlangen" onPress={() => navigation.navigate('Sperre')} />
      </Section>

      <Section title="Briefe und Mahnwesen">
        <ListRow icon="mail-open-outline" title="Briefausgang" subtitle="Erstellte Briefe teilen und als versendet markieren" onPress={() => navigation.navigate('Outbox')} />
        <ListRow icon="mail-outline" title="Absender und Mahnregeln" subtitle="Adresse, IBAN, Gebühren, Fristen" onPress={() => navigation.navigate('Briefe')} />
      </Section>

      <Section title="Importieren">
        <ListRow icon="albums-outline" title="Bestand aus CSV importieren" subtitle="Häuser, Einheiten und Mieter auf einmal anlegen" onPress={() => navigation.navigate('BestandImport')} />
        <ListRow icon="swap-vertical-outline" title="Kontoauszug importieren" subtitle="Zahlungseingänge automatisch zuordnen" onPress={() => navigation.navigate('StatementImport')} />
      </Section>

      <Section title="Sicherung" footer={overdue ? 'Es ist Zeit für eine neue Sicherung. Lege sie am besten in iCloud Drive oder Google Drive ab, nicht nur auf diesem Handy.' : 'Die Sicherung enthält alle Daten, deine Absenderdaten, das Logo und die Mahnregeln in einer Datei.'}>
        <ListRow icon={overdue ? 'alert-circle' : 'checkmark-circle'} iconTone={overdue ? 'warn' : 'ok'} title="Letzte Sicherung"
          subtitle={daysAgo === null ? 'Noch nie gesichert' : daysAgo === 0 ? 'Heute' : `Vor ${daysAgo} Tag${daysAgo === 1 ? '' : 'en'}`} right={lastBackup ? dateDE(cfg.lastBackupAt.slice(0, 10)) : undefined} />
        <Field label="Passwort für verschlüsselte Sicherung (optional)" value={password} onChangeText={setPassword} secure placeholder="mindestens 8 Zeichen"
          hint={cryptoAvailable() ? 'Mit Passwort wird die Datei verschlüsselt (AES-256). Ohne das Passwort lässt sie sich nicht öffnen. Es gibt keine Wiederherstellung, merke es dir gut.' : undefined} />
      </Section>
      <Button icon="share-outline" title={Platform.OS === 'web' ? 'Sicherung teilen oder speichern' : 'Sicherung exportieren'} onPress={() => backup(false)} disabled={empty || busy} />
      {filesSupported() && db.documents.length > 0 && (
        <>
          <Gap h={8} />
          <Button kind="secondary" icon="albums-outline" title={`Vollsicherung mit ${db.documents.length} Dokumenten (${fmtSize(docBytes)})`} onPress={() => backup(true)} disabled={busy} />
        </>
      )}
      <Gap h={22} />

      <Section title="Sicherungs-Erinnerung">
        <Segmented value={cfg.backupRemindDays} onChange={(v) => updateCfg({ backupRemindDays: v })} options={[{ label: 'Aus', value: 0 }, { label: '7 Tage', value: 7 }, { label: '14 Tage', value: 14 }, { label: '30 Tage', value: 30 }]} />
      </Section>

      <Section title="Wiederherstellen" footer={password ? 'Das eingegebene Passwort wird auch zum Öffnen einer verschlüsselten Sicherung benutzt.' : 'Ist die Sicherung verschlüsselt, gib vorher oben das Passwort ein.'}>
        {Platform.OS === 'web' ? <ListRow icon="folder-open-outline" title="Sicherungsdatei auswählen" onPress={() => pickBackupFile().then((c) => { if (c) return doImport(c); }).catch(fail)} /> : null}
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
