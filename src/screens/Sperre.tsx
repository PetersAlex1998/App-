import React, { useState } from 'react';
import { Text } from 'react-native';
import { PIN_LENGTH, PinPad, TIMEOUTS, useLock } from '../lock';
import { Button, Gap, ListRow, Note, Screen, Section, Segmented, confirm, notify, useColors } from '../ui';
import { type } from '../theme';

type Mode = 'menu' | 'new1' | 'new2' | 'old-change' | 'old-off';

export function SperreScreen() {
  const lock = useLock();
  const c = useColors();
  const [mode, setMode] = useState<Mode>('menu');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [key, setKey] = useState(0);
  const [timeout, setTimeoutMin] = useState(lock.timeoutMin);
  const reset = () => { setMode('menu'); setFirst(''); setError(''); setKey((k) => k + 1); };

  if (!lock.supported) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 12 }}>App-Sperre</Text>
        <Note>Die App-Sperre ist hier nicht verfügbar. Sie funktioniert in der Web-App, wenn die Seite über eine sichere Verbindung (https) geöffnet wird.</Note>
      </Screen>
    );
  }

  if (mode === 'new1' || mode === 'new2') {
    return (
      <Screen>
        <Gap h={24} />
        <PinPad key={mode} resetKey={key} title={mode === 'new1' ? 'Neuen Code festlegen' : 'Code wiederholen'} subtitle={`${PIN_LENGTH} Ziffern. Merke ihn dir gut.`} error={error}
          onComplete={async (pin) => {
            if (mode === 'new1') { setFirst(pin); setError(''); setMode('new2'); return; }
            if (pin !== first) { setError('Die Codes stimmen nicht überein. Bitte neu festlegen.'); setFirst(''); setMode('new1'); setKey((k) => k + 1); return; }
            await lock.enable(pin, timeout);
            notify('Die App-Sperre ist eingeschaltet.');
            reset();
          }} />
        <Gap h={16} />
        <Button kind="plain" title="Abbrechen" onPress={reset} />
      </Screen>
    );
  }

  if (mode === 'old-change' || mode === 'old-off') {
    return (
      <Screen>
        <Gap h={24} />
        <PinPad resetKey={key} title="Aktuellen Code eingeben" error={error}
          onComplete={async (pin) => {
            const r = await lock.verify(pin);
            if (!r.ok) { setError(r.wait ? `Zu viele Versuche. Bitte ${r.wait} Sekunden warten.` : 'Falscher Code.'); setKey((k) => k + 1); return; }
            setError('');
            if (mode === 'old-off') { await lock.disable(); notify('Die App-Sperre ist ausgeschaltet.'); reset(); }
            else { setMode('new1'); setKey((k) => k + 1); }
          }} />
        <Gap h={16} />
        <Button kind="plain" title="Abbrechen" onPress={reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>App-Sperre</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 18 }}>Mit einem {PIN_LENGTH}-stelligen Code schützt du Mieterdaten, IBANs und Zahlungen vor neugierigen Blicken.</Text>

      {lock.enabled ? (
        <>
          <Section title="Sperren nach" footer="So lange darf die App im Hintergrund sein, bevor der Code wieder verlangt wird.">
            <Segmented value={lock.timeoutMin} onChange={(v) => lock.setTimeoutMin(v)} options={TIMEOUTS} />
          </Section>
          <Section>
            <ListRow icon="lock-closed" title="Jetzt sperren" onPress={() => lock.lockNow()} />
            <ListRow icon="key-outline" title="Code ändern" onPress={() => { setMode('old-change'); setKey((k) => k + 1); }} />
            <ListRow icon="lock-open-outline" iconTone="danger" title="Sperre ausschalten" onPress={() => { setMode('old-off'); setKey((k) => k + 1); }} />
          </Section>
        </>
      ) : (
        <>
          <Section title="Sperren nach">
            <Segmented value={timeout} onChange={setTimeoutMin} options={TIMEOUTS} />
          </Section>
          <Button icon="lock-closed" title="Code festlegen" onPress={() => confirm('Bevor du die Sperre einschaltest', () => { setMode('new1'); setKey((k) => k + 1); }, 'Weiter', 'Erstelle zuerst eine Sicherung (Daten → Sicherung). Vergisst du den Code, lässt sich die App nur zurücksetzen. Dabei werden alle Daten auf diesem Gerät gelöscht.')} />
        </>
      )}
      <Gap h={22} />
      <Section title="Gut zu wissen">
        <Note>Die Sperre schützt die Oberfläche. Die Daten selbst sind im Browser nicht verschlüsselt, das ist kein Schutz gegen gezieltes Auslesen des Geräts. Sperre zusätzlich dein Handy mit Code oder Face ID.</Note>
        <Note>Nach 5 falschen Versuchen wartet die App 30 Sekunden, danach doppelt so lange.</Note>
        <Note>Code vergessen: Die App kann nur zurückgesetzt werden (alle Daten gelöscht). Eine aktuelle Sicherung hilft dann weiter.</Note>
      </Section>
    </Screen>
  );
}
