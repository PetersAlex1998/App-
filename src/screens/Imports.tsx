import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, uid } from '../store';
import { Badge, Button, EmptyState, Field, FilterChips, Gap, ListRow, Note, Screen, SearchBar, Section, notify, useColors } from '../ui';
import { matchInvoices } from '../firmBilling';
import { BESTAND_TEMPLATE, BankRow, MatchRow, applyMatches, scoreRows, parseBankCsv, pickTextFile, paymentsFromMatches, planBestandImport, BestandPlan, planZaehlerImport, ZaehlerPlan, ZAEHLER_TEMPLATE, previewBestand } from '../csv';
import { saveText } from '../backup';
import { dateDE, eur, monthLabel, today } from '../calc';
import { type } from '../theme';
import { useUpdateAvailable } from '../pwa';

/** Verhindert Importe mit einer veralteten App-Version (alte Versionen können Dateien falsch lesen). */
function UpdateGuard() {
  const { available, apply } = useUpdateAvailable();
  if (!available) return null;
  return (
    <Section>
      <ListRow icon="cloud-download-outline" iconTone="warn" title="Erst die App aktualisieren" subtitle="Eine neue Version liegt bereit. Importiere erst danach, damit alle Spalten richtig gelesen werden." right="Jetzt" onPress={apply} />
    </Section>
  );
}

/* ───────── Kontoauszug importieren ───────── */

export function StatementImport({ navigation }: any) {
  const { db, save, replaceAll } = useStore();
  const outdated = useUpdateAvailable().available;
  const c = useColors();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ rows: BankRow[]; skipped: number; outgoing: BankRow[]; columns?: string } | null>(null);
  const [invOff, setInvOff] = useState<Record<string, boolean>>({}); // abgewählte (oder bei abweichendem Betrag nicht vorgewählte) Rechnungen
  const [overrides, setOverrides] = useState<Record<string, { tenantId?: string | null; include?: boolean }>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [house, setHouse] = useState(''); // Kontoauszug eines Hauskontos: nur Mieter dieses Hauses zuordnen

  const load = (content: string, name = '') => {
    setFileName(name);
    const res = parseBankCsv(content);
    if (res.error) { setError(res.error); setParsed(null); return; }
    if (res.rows.length === 0 && matchInvoices(db, res.outgoing).length === 0) { setError('Die Datei enthält keine Zahlungseingänge und keine bezahlten Rechnungen der Firma.'); setParsed(null); return; }
    setError(''); setOverrides({}); setInvOff({}); setLimit(60); setParsed({ rows: res.rows, skipped: res.skippedOutgoing, outgoing: res.outgoing ?? [], columns: res.columns });
  };
  // Bewertung nur einmal; Änderungen (Häkchen, manuelle Zuordnung) wenden nur noch das Ergebnis neu an
  // Ausgänge vom Hauskonto an die Firma: offene Rechnungen anhand der Rechnungsnummer erkennen
  const paidInv = useMemo(() => (parsed ? matchInvoices(db, parsed.outgoing) : []), [db, parsed]);
  const invOn = (x: { row: { id: string }; amountOk: boolean }) => (invOff[x.row.id] !== undefined ? !invOff[x.row.id] : x.amountOk);
  const markPaid = () => { paidInv.filter(invOn).forEach((x) => save('firmInvoices', { ...x.invoice, paid: x.row.date })); setInvOff({}); notify(`${paidInv.filter(invOn).length} Rechnung(en) als bezahlt markiert.`); setParsed({ ...parsed!, outgoing: parsed!.outgoing.filter((o) => !paidInv.filter(invOn).some((x) => x.row.id === o.id)) }); };
  const scores = useMemo(() => (parsed ? scoreRows(db, parsed.rows, house || undefined) : []), [db, parsed, house]);
  const rows: MatchRow[] = useMemo(() => applyMatches(db, scores, overrides), [db, scores, overrides]);
  // Feste Reihenfolge: erst was geprüft werden muss, dann sichere Treffer, dann bereits gebuchte
  const order = useMemo(() => {
    const rank = { pruefen: 0, offen: 1, sicher: 2, doppelt: 3 } as const;
    return applyMatches(db, scores).sort((a, b) => rank[a.status] - rank[b.status] || a.date.localeCompare(b.date)).map((r) => r.id);
  }, [db, scores]);
  const [limit, setLimit] = useState(60);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const ordered = order.map((id) => byId.get(id)!).filter(Boolean);
  const chosen = rows.filter((r) => r.include);
  const total = chosen.reduce((s, r) => s + r.amount, 0);
  const tenantName = (id: string | null) => db.tenants.find((t) => t.id === id)?.name;

  const book = () => {
    const pays = paymentsFromMatches(rows, { importId: uid(), label: `Kontoauszug-Import ${dateDE(today())}${fileName ? ` · ${fileName}` : ''}` });
    if (pays.length === 0) return notify('Es ist keine Zahlung ausgewählt.');
    replaceAll({ ...db, payments: [...db.payments, ...pays] });
    notify(`${pays.length} Zahlungen über ${eur(total)} gebucht. Sie sind als „Kontoauszug“ gekennzeichnet.`);
    navigation.goBack();
  };

  // Mieter für eine Zeile auswählen
  if (pickFor) {
    const list = db.tenants.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    return (
      <Screen>
        <SearchBar value={q} onChangeText={setQ} placeholder="Mieter suchen" autoFocus />
        <Section>
          <ListRow icon="close-circle-outline" title="Nicht zuordnen (überspringen)" onPress={() => { setOverrides({ ...overrides, [pickFor]: { tenantId: null, include: false } }); setPickFor(null); setQ(''); }} />
          {list.map((t) => (
            <ListRow key={t.id} title={t.name} subtitle={db.units.find((u) => u.id === t.unitId)?.name}
              onPress={() => { setOverrides({ ...overrides, [pickFor]: { tenantId: t.id, include: true } }); setPickFor(null); setQ(''); }} />
          ))}
        </Section>
      </Screen>
    );
  }

  if (!parsed) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Kontoauszug importieren</Text>
        <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 20 }}>Lade den CSV-Export deines Mieteingangskontos hoch. Die App ordnet die Eingänge den Mietern zu, du prüfst und bestätigst.</Text>
        {db.properties.length > 1 && (
          <Section title="Von welchem Hauskonto?" footer="Jedes Haus hat sein eigenes Konto. Wählst du das Haus, ordnet die App die Zahlungen nur Mietern dieses Hauses zu.">
            <View style={{ padding: 12 }}><FilterChips value={house} onChange={setHouse} options={[{ label: 'Alle Häuser', value: '' }, ...db.properties.map((p) => ({ label: p.name, value: p.id }))]} /></View>
          </Section>
        )}
        {Platform.OS === 'web' && <Button icon="document-attach-outline" title="CSV-Datei auswählen" onPress={() => pickTextFile().then((t) => t && load(t.text, t.name)).catch((e) => setError(String(e?.message ?? e)))} />}
        <Gap h={16} />
        <Section title="Oder Inhalt einfügen">
          <Field label="CSV-Inhalt" value={text} onChangeText={setText} multiline placeholder="Inhalt der CSV-Datei einfügen" />
        </Section>
        {text.trim() ? <Button kind="secondary" title="Einlesen" onPress={() => load(text)} /> : null}
        {error ? <View style={{ marginTop: 14 }}><Badge text={error} tone="danger" /></View> : null}
        <Gap h={22} />
        <Section title="So klappt die Zuordnung am besten" footer="Je mehr die App über den Mieter weiß, desto sicherer ordnet sie zu.">
          <Note>• Hinterlege bei jedem Mieter die IBAN (Mieter bearbeiten).</Note>
          <Note>• Sonst erkennt die App den Nachnamen im Verwendungszweck oder Absender, den Wohnungsnamen und den exakten Mietbetrag.</Note>
          <Note>• Unsichere Treffer bucht die App nie von selbst. Du bestätigst sie.</Note>
        </Section>
      </Screen>
    );
  }

  const label: Record<string, { text: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' }> = {
    sicher: { text: 'Sicher', tone: 'ok' }, pruefen: { text: 'Bitte prüfen', tone: 'warn' }, offen: { text: 'Nicht zugeordnet', tone: 'neutral' }, doppelt: { text: 'Bereits gebucht', tone: 'neutral' },
  };
  const counts = { sicher: rows.filter((r) => r.status === 'sicher').length, pruefen: rows.filter((r) => r.status === 'pruefen').length, offen: rows.filter((r) => r.status === 'offen').length, doppelt: rows.filter((r) => r.status === 'doppelt').length };

  return (
    <Screen>
      <UpdateGuard />
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>{rows.length} Eingänge</Text>
      <Text style={{ color: c.muted, fontSize: type.subhead, marginBottom: 16 }}>
        {counts.sicher} sicher · {counts.pruefen} prüfen · {counts.offen} offen · {counts.doppelt} doppelt{parsed.skipped ? ` · ${parsed.skipped} Ausgänge übersprungen` : ''}{rows.length > 60 ? '. Zeilen mit Prüfbedarf stehen oben.' : ''}
      </Text>
      {paidInv.length > 0 && (
        <Section title="Bezahlte Rechnungen der Firma" footer="Erkannt an der Rechnungsnummer im Verwendungszweck. Weicht der Betrag ab, ist die Rechnung nicht vorgewählt.">
          {paidInv.map((x) => (
            <ListRow key={x.row.id} icon={invOn(x) ? 'checkbox' : 'square-outline'} iconTone={invOn(x) ? 'primary' : undefined} title={`Rechnung ${x.invoice.number}`} subtitle={`${dateDE(x.row.date)} · gezahlt ${eur(-x.row.amount)}${x.amountOk ? '' : ` · Rechnungsbetrag ${eur(x.invoice.gross)}`}`} badge={x.amountOk ? undefined : { text: 'Betrag weicht ab', tone: 'warn' }} onPress={() => setInvOff({ ...invOff, [x.row.id]: invOn(x) })} />
          ))}
          <View style={{ padding: 12 }}><Button kind="secondary" icon="checkmark-done" title={`${paidInv.filter(invOn).length} Rechnung${paidInv.filter(invOn).length === 1 ? '' : 'en'} als bezahlt markieren`} onPress={markPaid} disabled={paidInv.filter(invOn).length === 0} /></View>
        </Section>
      )}
      <Section>
        {ordered.slice(0, limit).map((r) => {
          const st = label[r.status];
          const disabled = r.status === 'doppelt';
          return (
            <View key={r.id} style={{ padding: 14, gap: 8, opacity: disabled ? 0.55 : 1 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`Eingang ${r.name} ${eur(r.amount)} buchen`} accessibilityState={{ checked: r.include, disabled: disabled || !r.tenantId }} disabled={disabled || !r.tenantId}
                  onPress={() => setOverrides({ ...overrides, [r.id]: { ...overrides[r.id], include: !r.include } })} hitSlop={8} style={{ marginTop: 2 }}>
                  <Ionicons name={r.include ? 'checkbox' : 'square-outline'} size={26} color={r.include ? c.primary : c.muted} />
                </Pressable>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{r.name || 'Ohne Absender'}</Text>
                  <Text numberOfLines={2} style={{ fontSize: type.footnote, color: c.muted }}>{dateDE(r.date)} · {r.purpose || '–'}</Text>
                </View>
                <Text style={{ fontSize: type.body, fontWeight: '700', color: c.ok, fontVariant: ['tabular-nums'] }}>+ {eur(r.amount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 38, gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Badge text={st.text} tone={st.tone} />
                  {r.tenantId ? <Text style={{ fontSize: type.subhead, color: c.text }}>→ {tenantName(r.tenantId)} · {r.kind === 'miete' ? `Miete ${monthLabel(r.month)}` : r.kind === 'kaution' ? 'Kaution' : 'NK-Nachzahlung'}</Text> : null}
                </View>
                {!disabled && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Mieter ändern" onPress={() => setPickFor(r.id)} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
                    <Text style={{ color: c.primary, fontWeight: '600', fontSize: type.subhead }}>{r.tenantId ? 'Ändern' : 'Zuordnen'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </Section>
      {ordered.length > limit && <Button kind="secondary" icon="chevron-down" title={`Weitere ${Math.min(60, ordered.length - limit)} anzeigen (${ordered.length - limit} übrig)`} onPress={() => setLimit(limit + 60)} />}
      {ordered.length > limit && <Gap h={8} />}
      <Button icon="checkmark" title={outdated ? 'Erst die App aktualisieren' : chosen.length ? `${chosen.length} Zahlungen buchen (${eur(total)})` : 'Nichts ausgewählt'} onPress={book} disabled={chosen.length === 0 || outdated} />
      <Gap h={10} />
      <Button kind="plain" title="Andere Datei wählen" onPress={() => { setParsed(null); setText(''); }} />
    </Screen>
  );
}

/* ───────── Bestand importieren ───────── */

export function BestandImport({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const outdated = useUpdateAvailable().available;
  const c = useColors();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<BestandPlan | null>(null);
  const [error, setError] = useState('');

  const load = (content: string) => {
    const p = planBestandImport(db, content);
    if (p.error) { setError(p.error); setPlan(null); return; }
    setError(''); setPlan(p);
  };
  const apply = () => {
    if (!plan) return;
    replaceAll(plan.db);
    notify('Der Bestand wurde importiert.');
    navigation.goBack();
  };
  const s = plan?.summary;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Bestand importieren</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 20 }}>Trage Häuser, Einheiten und Mieter in einer Tabelle ein und lade sie hoch. So legst du alles auf einmal an.</Text>

      <UpdateGuard />
      <Section title="1. Vorlage" footer="Öffne die Vorlage in Excel, Numbers oder Google Sheets, trage deine Einheiten ein und speichere sie als CSV. Pro Zeile eine Einheit; leere Mieter-Spalten bedeuten Leerstand. Nur Haus und Einheit sind Pflicht, alle anderen Spalten sind optional. Nenne Einheiten „Wohnung 1“, „Wohnung 2“ …, daraus entstehen die Wohnungs-IDs (z. B. H01-W01). Leere Zellen ändern bei einem erneuten Import nichts.">
        <ListRow icon="download-outline" title="Vorlage herunterladen" subtitle="CSV mit allen Spalten und Beispielzeilen" onPress={() => saveText('bestand-vorlage.csv', BESTAND_TEMPLATE).catch((e) => notify(String(e?.message ?? e)))} />
      </Section>

      <Section title="2. Datei hochladen">
        {Platform.OS === 'web' ? <ListRow icon="document-attach-outline" title="CSV-Datei auswählen" onPress={() => pickTextFile().then((t) => t && load(t.text)).catch((e) => setError(String(e?.message ?? e)))} /> : null}
        <Field label="Oder Inhalt einfügen" value={text} onChangeText={setText} multiline placeholder="Inhalt der CSV-Datei" />
      </Section>
      {text.trim() && !plan ? <Button kind="secondary" title="Einlesen" onPress={() => load(text)} /> : null}
      {error ? <View style={{ marginTop: 10 }}><Badge text={error} tone="danger" /></View> : null}

      {plan && s && (
        <>
          <Gap h={12} />
          <Section title="3. Vorschau" footer="Bereits vorhandene Häuser, Einheiten und Mieter werden aktualisiert, nicht doppelt angelegt.">
            <ListRow icon="business" title="Neue Häuser" right={String(s.properties)} />
            <ListRow icon="home" title="Neue Einheiten" right={String(s.units)} />
            <ListRow icon="people" title="Neue Mieter" right={String(s.tenants)} />
            <ListRow icon="refresh" title="Aktualisiert" right={String(s.updated)} />
          </Section>
          {(() => {
            const pv = previewBestand(db, plan.db);
            if (!pv.length) return null;
            const bad = pv.filter((x) => x.problem).length;
            return (
              <Section title={`Pro Einheit (${pv.length})`} footer={bad ? `${bad} Einheit${bad === 1 ? '' : 'en'} mit Auffälligkeit. Prüfe die Auszugsdaten, bevor du importierst.` : 'So sieht jede Einheit nach dem Import aus.'}>
                {pv.slice(0, 40).map((x) => (
                  <ListRow key={x.house + x.unit} icon={x.problem ? 'alert-circle' : x.change === 'neu' ? 'add-circle-outline' : 'refresh'} iconTone={x.problem ? 'warn' : undefined}
                    title={`${x.unit}${pv.some((y) => y.house !== x.house) ? ` · ${x.house}` : ''}`}
                    subtitle={x.problem ?? `${x.current.length ? `Aktuell: ${x.current[0]}${x.since ? ` seit ${dateDE(x.since)}` : ''}` : 'Leerstand'}${x.history ? ` · ${x.history} frühere${x.history === 1 ? 'r' : ''} in der Historie` : ''}`}
                    badge={{ text: x.change === 'neu' ? 'Neu' : 'Geändert', tone: x.change === 'neu' ? 'ok' : 'neutral' }} />
                ))}
                {pv.length > 40 && <Note>… und {pv.length - 40} weitere Einheiten.</Note>}
              </Section>
            );
          })()}
          {plan.warnings.length > 0 && (
            <Section title="Hinweise">{plan.warnings.map((w) => <Note key={w}>{w}</Note>)}</Section>
          )}
          <Button icon="checkmark" title={outdated ? 'Erst aktualisieren' : 'Jetzt importieren'} onPress={apply} disabled={outdated} />
          <Gap h={6} />
          <Note>Tipp: Erstelle vorher unter „Daten“ eine Sicherung.</Note>
        </>
      )}
    </Screen>
  );
}


/* ───────── Zähler und Stände importieren ───────── */

export function ZaehlerImport({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const outdated = useUpdateAvailable().available;
  const c = useColors();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ZaehlerPlan | null>(null);
  const [error, setError] = useState('');
  const load = (content: string) => {
    const p = planZaehlerImport(db, content);
    if (p.error) { setError(p.error); setPlan(null); return; }
    setError(''); setPlan(p);
  };
  const apply = () => {
    if (!plan) return;
    replaceAll(plan.db);
    notify('Zähler und Stände wurden importiert.');
    navigation.goBack();
  };
  const s = plan?.summary;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Zähler importieren</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 20 }}>Lege Zähler samt Ablesungen auf einmal an. Pro Zeile ein Stand. Haus und Einheit müssen schon in der App existieren.</Text>
      <UpdateGuard />
      <Section title="1. Vorlage" footer="Spalten: Haus, Einheit (leer = Haus allgemein), Zähler (Heizung, Kaltwasser, Warmwasser, Strom, Gas), Zählernummer, Datum, Stand. Vorhandene Zähler werden erkannt, nichts wird doppelt angelegt.">
        <ListRow icon="download-outline" title="Vorlage herunterladen" subtitle="CSV mit Beispielzeilen" onPress={() => saveText('zaehler-vorlage.csv', ZAEHLER_TEMPLATE).catch((e) => notify(String(e?.message ?? e)))} />
      </Section>
      <Section title="2. Datei hochladen">
        {Platform.OS === 'web' ? <ListRow icon="document-attach-outline" title="CSV-Datei auswählen" onPress={() => pickTextFile().then((t) => t && load(t.text)).catch((e) => setError(String(e?.message ?? e)))} /> : null}
        <Field label="Oder Inhalt einfügen" value={text} onChangeText={setText} multiline placeholder="Inhalt der CSV-Datei" />
      </Section>
      {text.trim() && !plan ? <Button kind="secondary" title="Einlesen" onPress={() => load(text)} /> : null}
      {error ? <View style={{ marginTop: 10 }}><Badge text={error} tone="danger" /></View> : null}
      {plan && s && (
        <>
          <Gap h={12} />
          <Section title="3. Vorschau">
            <ListRow icon="speedometer-outline" title="Neue Zähler" right={String(s.meters)} />
            <ListRow icon="analytics-outline" title="Neue Stände" right={String(s.readings)} />
            <ListRow icon="refresh" title="Geänderte Stände" right={String(s.updated)} />
          </Section>
          {plan.warnings.length > 0 && <Section title="Hinweise">{plan.warnings.map((w) => <Note key={w}>{w}</Note>)}</Section>}
          <Button icon="checkmark" title={outdated ? 'Erst aktualisieren' : 'Jetzt importieren'} onPress={apply} disabled={outdated} />
          <Gap h={6} />
          <Note>Tipp: Erstelle vorher unter „Daten“ eine Sicherung.</Note>
        </>
      )}
    </Screen>
  );
}
