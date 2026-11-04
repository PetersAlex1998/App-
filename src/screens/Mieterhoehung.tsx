import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, DateField, ListRow, EmptyState, Field, Gap, Note, Row, Screen, Section, Segmented, confirm, notify, useColors } from '../ui';
import { dateDE, eur, num, rentNow, today } from '../calc';
import { addTerm, checkIncrease, indexRent, IncreaseKind } from '../rent';
import { Basis, basisNotes, comparablesCap, defaultBasis, findComparables } from '../rentBasis';
import { RentBasisText, rentIncreaseModel } from '../letters';
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
  const [basis, setBasis] = useState<Basis>(defaultBasis(prop));
  const [mean, setMean] = useState(unit?.mietspiegel?.mean ? String(unit.mietspiegel.mean).replace('.', ',') : '');
  const [upper, setUpper] = useState(unit?.mietspiegel?.upper ? String(unit.mietspiegel.upper).replace('.', ',') : '');
  const [note, setNote] = useState(unit?.mietspiegel?.note ?? '');
  const [gutPerSqm, setGutPerSqm] = useState('');
  const [source, setSource] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [cap, setCap] = useState<number>(20);
  const [idxOld, setIdxOld] = useState('');
  const [idxNew, setIdxNew] = useState('');
  const [from, setFrom] = useState(`${new Date().getFullYear() + 1}-01-01`);
  const [reason, setReason] = useState('');
  const now = unit ? rentNow(unit) : { coldRent: 0, advance: 0 };
  const comps = useMemo(() => (unit ? findComparables(db, unit, 8) : []), [db, unit]);
  const selIds = picked ?? comps.slice(0, 3).map((x) => x.unitId); // Standard: die drei ähnlichsten
  const sel = comps.filter((x) => selIds.includes(x.unitId));
  const cap3 = comparablesCap(sel);
  const comparePerSqm = basis === 'mietspiegel' ? (num(upper) || num(mean) || undefined) : basis === 'vergleich' ? (cap3.ok ? cap3.avg : undefined) : (num(gutPerSqm) || undefined);

  const check = useMemo(() => (unit && mode !== 'eintragen'
    ? checkIncrease({ kind: mode, unit, tenant, letterDate: date, newRent: num(newRent) || 0, capPct: cap, comparePerSqm, indexOld: num(idxOld) || undefined, indexNew: num(idxNew) || undefined })
    : null), [unit, tenant, mode, date, newRent, cap, comparePerSqm, idxOld, idxNew]);

  if (!unit || !prop) return <Screen><EmptyState icon="home" title="Einheit nicht gefunden" text="Öffne die Mieterhöhung aus einer Wohnung." /></Screen>;
  if (!tenant && mode !== 'eintragen') return <Screen><EmptyState icon="key-outline" title="Kein aktueller Mieter" text="Für ein Schreiben braucht die Wohnung einen Mieter. Du kannst eine Miete aber direkt eintragen." actionLabel="Miete direkt eintragen" onAction={() => setMode('eintragen')} /></Screen>;

  const rentFromIndex = mode === 'index' && num(idxOld) > 0 && num(idxNew) > 0 ? indexRent(now.coldRent, num(idxOld), num(idxNew)) : null;

  const create = () => {
    if (!check || !tenant) return;
    if (check.errors.length) return notify(check.errors[0]);
    const kind = mode as IncreaseKind;
    if (kind === 'vergleich' && basis === 'vergleich' && !cap3.ok) return notify('Für die Begründung brauchst du mindestens drei Vergleichswohnungen.');
    const b = prop.rentBasis;
    const basisText: RentBasisText | undefined = kind !== 'vergleich' ? undefined
      : basis === 'mietspiegel' ? { kind: 'mietspiegel', perSqm: num(mean) || undefined, upper: num(upper) || undefined, name: b?.name, stand: b?.stand, note: note.trim() || undefined, otherMunicipality: b?.kind === 'andere' ? (prop.city || undefined) : undefined }
      : basis === 'vergleich' ? { kind: 'vergleich', perSqm: cap3.avg, comps: sel.map((x) => ({ address: x.street, position: x.position, area: x.area, rent: x.rent, perSqm: x.perSqm })) }
      : { kind: 'gutachten', perSqm: num(gutPerSqm) || undefined, source: source.trim() || undefined };
    confirm('Schreiben erstellen?', async () => {
      const letter = rentIncreaseModel(kind, tenant, unit, prop, cfg, { currentRent: check.currentRent, newRent: check.newRent, effective: check.effective, consentUntil: check.consentUntil, comparePerSqm, indexOld: num(idxOld) || undefined, indexNew: num(idxNew) || undefined, advance: now.advance, basis: basisText }, date);
      if (kind === 'vergleich' && basis === 'mietspiegel' && num(mean) > 0) save('units', { ...unit, mietspiegel: { mean: num(mean), upper: num(upper) || undefined, note: note.trim() || undefined, date: today() } });
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

          {mode === 'vergleich' && (
            <Section title="Begründung" footer={basisNotes(prop).join(' ')}>
              <View style={{ padding: 12 }}><Segmented value={basis} onChange={(v) => setBasis(v as Basis)} options={[{ label: 'Mietspiegel', value: 'mietspiegel' as Basis }, { label: 'Vergleichswohnungen', value: 'vergleich' as Basis }, { label: 'Gutachten', value: 'gutachten' as Basis }]} /></View>
              {basis === 'mietspiegel' && (
                <>
                  <Field label="Mittelwert deiner Wohnung im Mietspiegel" value={mean} onChangeText={setMean} keyboard="numeric" suffix="€ pro m²" hint="Such Baujahr, Größe und Ausstattung im Mietspiegel" />
                  <Field label="Oberwert der Spanne" value={upper} onChangeText={setUpper} keyboard="numeric" suffix="€ pro m²" placeholder="optional, erlaubt bis zum Oberwert" />
                  <Field label="Einordnung" value={note} onChangeText={setNote} placeholder="z. B. Baujahr 1975–1989, 60–80 m², gute Lage" />
                  <ListRow icon="settings-outline" title={prop.rentBasis ? `Mietspiegel: ${prop.rentBasis.name || 'ohne Namen'}` : 'Mietspiegel für dieses Haus einrichten'} subtitle={prop.rentBasis ? 'Name, Stand und Gültigkeit ändern' : 'Hat dein Ort einen Mietspiegel?'} onPress={() => navigation.navigate('Mietspiegel', { propertyId: prop.id })} />
                </>
              )}
              {basis === 'vergleich' && (
                <>
                  {comps.length < 3 && <Note>Im Bestand gibt es nur {comps.length} passende Wohnung{comps.length === 1 ? '' : 'en'} im gleichen Ort. Du brauchst mindestens drei. Wähle sonst Mietspiegel oder Gutachten.</Note>}
                  {comps.map((x) => {
                    const on = selIds.includes(x.unitId);
                    return <ListRow key={x.unitId} icon={on ? 'checkbox' : 'square-outline'} iconTone={on ? 'primary' : undefined} title={`${x.label}`} subtitle={`${x.area} m² · ${eur(x.rent)} · ${eur(x.perSqm)} pro m²${x.sameHouse ? ' · gleiches Haus' : ''}`} onPress={() => setPicked(on ? selIds.filter((i) => i !== x.unitId) : [...selIds, x.unitId])} chevron={false} />;
                  })}
                  {sel.length > 0 && <Note>{cap3.ok ? `Obergrenze: Durchschnitt ${eur(cap3.avg)} pro m² (niedrigste ${eur(cap3.min)}, höchste ${eur(cap3.max)}). Mit dem Durchschnitt bist du auf der sicheren Seite.` : `Noch ${3 - sel.length} Wohnung${3 - sel.length === 1 ? '' : 'en'} wählen.`} Im Schreiben stehen nur Anschrift, Lage, Größe und Miete, keine Namen.</Note>}
                </>
              )}
              {basis === 'gutachten' && (
                <>
                  <Field label="Ortsübliche Vergleichsmiete laut Gutachten oder Mietdatenbank" value={gutPerSqm} onChangeText={setGutPerSqm} keyboard="numeric" suffix="€ pro m²" />
                  <Field label="Quelle" value={source} onChangeText={setSource} placeholder="z. B. Gutachten Dipl.-Ing. Müller vom 01.10.2026" />
                </>
              )}
            </Section>
          )}

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
