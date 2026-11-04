import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, DateField, EmptyState, Field, Gap, Note, Row, Screen, Section, Segmented, confirm, notify, useColors } from '../ui';
import { dateDE, eur, num, rentNow, today } from '../calc';
import { addTerm, checkIncrease, indexRent, IncreaseKind } from '../rent';
import { rentIncreaseModel } from '../letters';
import { storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { exportPdf } from '../pdf';
import { type } from '../theme';

type Mode = IncreaseKind | 'eintragen';

/** Mieterhöhung vorbereiten: Zulässigkeit prüfen, Schreiben erzeugen und die Änderung vormerken (oder direkt eintragen). */
export function Mieterhoehung({ route, navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const unit = db.units.find((u) => u.id === route.params?.unitId);
  const tenant = db.tenants.find((t) => t.unitId === unit?.id && (!t.moveOut || t.moveOut >= today()));
  const prop = db.properties.find((p) => p.id === unit?.propertyId);
  const [mode, setMode] = useState<Mode>('vergleich');
  const [date, setDate] = useState(today());
  const [newRent, setNewRent] = useState('');
  const [compare, setCompare] = useState('');
  const [cap, setCap] = useState<number>(20);
  const [idxOld, setIdxOld] = useState('');
  const [idxNew, setIdxNew] = useState('');
  const [from, setFrom] = useState(`${new Date().getFullYear() + 1}-01-01`);
  const [reason, setReason] = useState('');
  const now = unit ? rentNow(unit) : { coldRent: 0, advance: 0 };

  const check = useMemo(() => (unit && mode !== 'eintragen'
    ? checkIncrease({ kind: mode, unit, tenant, letterDate: date, newRent: num(newRent) || 0, capPct: cap, comparePerSqm: num(compare) || undefined, indexOld: num(idxOld) || undefined, indexNew: num(idxNew) || undefined })
    : null), [unit, tenant, mode, date, newRent, cap, compare, idxOld, idxNew]);

  if (!unit || !prop) return <Screen><EmptyState icon="home" title="Einheit nicht gefunden" text="Öffne die Mieterhöhung aus einer Wohnung." /></Screen>;
  if (!tenant && mode !== 'eintragen') return <Screen><EmptyState icon="key-outline" title="Kein aktueller Mieter" text="Für ein Schreiben braucht die Wohnung einen Mieter. Du kannst eine Miete aber direkt eintragen." actionLabel="Miete direkt eintragen" onAction={() => setMode('eintragen')} /></Screen>;

  const rentFromIndex = mode === 'index' && num(idxOld) > 0 && num(idxNew) > 0 ? indexRent(now.coldRent, num(idxOld), num(idxNew)) : null;

  const create = () => {
    if (!check || !tenant) return;
    if (check.errors.length) return notify(check.errors[0]);
    const kind = mode as IncreaseKind;
    confirm('Schreiben erstellen?', async () => {
      const letter = rentIncreaseModel(kind, tenant, unit, prop, cfg, { currentRent: check.currentRent, newRent: check.newRent, effective: check.effective, consentUntil: check.consentUntil, comparePerSqm: num(compare) || undefined, indexOld: num(idxOld) || undefined, indexNew: num(idxNew) || undefined, advance: now.advance }, date);
      save('tenants', { ...tenant, rentChange: { from: check.effective, coldRent: check.newRent, kind, letterDate: date, consentUntil: check.consentUntil } });
      if (filesSupported()) {
        const [doc] = await storeLetters([{ model: letter, tenant, note: kind === 'index' ? 'Mieterhöhung (Index)' : 'Mieterhöhungsverlangen' }]);
        save('documents', doc);
        navigation.navigate('Outbox');
      } else notify('Das PDF ist in der Web-App verfügbar.');
    }, 'Erstellen', `Neue Miete ${eur(check.newRent)} ab ${dateDE(check.effective)}. Das Schreiben liegt danach im Briefausgang. Die Miete wird erst übernommen, wenn du es bestätigst.`);
  };
  const enter = () => {
    if (!(num(newRent) > 0)) return notify('Bitte die neue Kaltmiete eingeben.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return notify('Bitte ein Datum wählen.');
    save('units', addTerm(unit, from, { coldRent: num(newRent), reason: reason.trim() || 'Eingetragen' }));
    navigation.goBack();
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 4 }}>Miete erhöhen</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 16 }}>{unit.name} · {prop.name}{tenant ? ` · ${tenant.name}` : ''}. Aktuell {eur(now.coldRent)} Kaltmiete.</Text>

      <Segmented value={mode} onChange={(v) => setMode(v as Mode)} options={[{ label: 'Vergleichsmiete', value: 'vergleich' as Mode }, { label: 'Indexmiete', value: 'index' as Mode }, { label: 'Eintragen', value: 'eintragen' as Mode }]} />
      <Gap h={16} />

      {mode === 'eintragen' ? (
        <>
          <Section title="Neue Miete eintragen" footer="Für Staffelmieten, Vereinbarungen oder Erhöhungen, die schon beschlossen sind. Es wird kein Schreiben erstellt.">
            <Field label="Neue Kaltmiete pro Monat" value={newRent} onChangeText={setNewRent} keyboard="numeric" suffix="€" />
            <DateField label="Gilt ab" value={from} onChange={setFrom} />
            <Field label="Grund" value={reason} onChangeText={setReason} placeholder="z. B. Staffelmiete, Vereinbarung" />
          </Section>
          <Button icon="checkmark" title="Eintragen" onPress={enter} />
        </>
      ) : (
        <>
          <Section title="Schreiben">
            <DateField label="Datum des Schreibens" value={date} onChange={setDate} />
            {mode === 'vergleich' ? (
              <>
                <Field label="Neue Kaltmiete pro Monat" value={newRent} onChangeText={setNewRent} keyboard="numeric" suffix="€" hint={check ? `Höchstens ${eur(check.maxAllowed)}${check.maxByCompare !== undefined ? ' (Kappung und Mietspiegel)' : ' (Kappungsgrenze)'}` : undefined} />
                <Field label="Ortsübliche Vergleichsmiete (Mietspiegel)" value={compare} onChangeText={setCompare} keyboard="numeric" suffix="€ pro m²" placeholder="optional, aber nötig für die Begründung" />
                <View style={{ padding: 12, gap: 6 }}>
                  <Text style={{ color: c.muted, fontSize: type.footnote }}>Kappungsgrenze in drei Jahren</Text>
                  <Segmented value={cap} onChange={setCap} options={[{ label: '20 %', value: 20 }, { label: '15 % (angespannter Markt)', value: 15 }]} />
                </View>
              </>
            ) : (
              <>
                <Field label="Index bei der letzten Mietfestsetzung" value={idxOld} onChangeText={setIdxOld} keyboard="numeric" hint="Verbraucherpreisindex für Deutschland (Destatis)" />
                <Field label="Aktueller Index" value={idxNew} onChangeText={setIdxNew} keyboard="numeric" hint={rentFromIndex ? `Neue Kaltmiete: ${eur(rentFromIndex)}` : undefined} />
              </>
            )}
          </Section>

          {check && (
            <Section title="Prüfung">
              <View style={{ padding: 14, gap: 10 }}>
                <Badge text={check.errors.length ? 'Nicht zulässig' : check.warnings.length ? 'Zulässig, mit Hinweisen' : 'Zulässig'} tone={check.errors.length ? 'danger' : check.warnings.length ? 'warn' : 'ok'} />
                {check.errors.map((e) => <Text key={e} style={{ color: c.danger, fontSize: type.subhead }}>✕ {e}</Text>)}
                {check.warnings.map((w) => <Text key={w} style={{ color: c.warn, fontSize: type.subhead }}>⚠ {w}</Text>)}
              </View>
              {check.newRent > 0 && check.errors.length === 0 && (
                <>
                  <Row left="Neue Kaltmiete" right={eur(check.newRent)} bold />
                  <Row left="Erhöhung" right={`${eur(check.increase)} (${check.increasePct.toLocaleString('de-DE')} %)`} />
                  {check.perSqm !== null && <Row left="Pro m²" right={eur(check.perSqm)} />}
                  <Row left="Gilt ab" right={dateDE(check.effective)} />
                  {check.consentUntil && <Row left="Zustimmung bis" right={dateDE(check.consentUntil)} />}
                </>
              )}
            </Section>
          )}
          <Button icon="document-text" title="Schreiben erstellen" onPress={create} disabled={!check || check.errors.length > 0 || !tenant} />
          <Gap h={10} />
          <Note>Die Prüfung hilft bei den üblichen Wohnraumfällen. Lass Begründung und Fristen im Einzelfall rechtlich prüfen. Das Schreiben gilt als zugegangen, wenn es dem Mieter zugeht, nicht am Datum des Briefs.</Note>
        </>
      )}
    </Screen>
  );
}
