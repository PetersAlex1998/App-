import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { Badge, Button, EmptyState, FilterChips, Gap, ListRow, Note, Screen, Section, Segmented, notify, useColors } from '../ui';
import { getBlob, fmtSize } from '../files';
import { mergeStored } from '../outbox';
import { epostProvider, shareFiles } from '../dispatch';
import { dateDE, today } from '../calc';
import { type } from '../theme';
import { Doc } from '../types';

const CHANNELS = ['Post', 'E-POST', 'E-Mail', 'Persönlich'];

export function Outbox({ navigation }: any) {
  const { db, replaceAll } = useStore();
  const c = useColors();
  const [tab, setTab] = useState<'bereit' | 'versendet'>('bereit');
  const [picked, setPicked] = useState<Record<string, boolean>>({}); // gesetzt = Gegenteil des Standards
  const [channel, setChannel] = useState('Post');
  const [busy, setBusy] = useState(false);

  const letters = useMemo(() => db.documents.filter((d) => d.category === 'brief').sort((a, b) => b.added.localeCompare(a.added) || b.id.localeCompare(a.id)), [db.documents]);
  const ready = letters.filter((d) => (d.status ?? 'bereit') === 'bereit');
  const sent = letters.filter((d) => d.status === 'versendet').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  const list = tab === 'bereit' ? ready : sent;
  // Standard: im Ausgang alle ausgewählt, bei „Versendet“ keiner
  const isOn = (d: Doc) => (tab === 'bereit' ? !picked[d.id] : !!picked[d.id]);
  const chosen = list.filter(isOn);
  const tenantName = (d: Doc) => (d.ownerId === 'self' ? 'An dich selbst' : db.tenants.find((t) => t.id === d.ownerId)?.name ?? '');

  const files = async (docs: Doc[]) => {
    const out: { name: string; blob: Blob }[] = [];
    for (const d of docs) { const b = await getBlob(d.id); if (b) out.push({ name: d.name, blob: b }); }
    if (out.length === 0) throw new Error('Die Dateien wurden auf diesem Gerät nicht gefunden. Spiele eine Vollsicherung ein.');
    return out;
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { notify(String(e?.message ?? e)); } setBusy(false); };

  const shareEach = () => run(async () => { await shareFiles(await files(chosen), 'Briefe'); });
  const shareOne = () => run(async () => { await shareFiles([{ name: `Briefe ${dateDE(today())} (${chosen.length})`, blob: await mergeStored(chosen) }], 'Briefe'); });
  const setStatus = (status: 'bereit' | 'versendet') => {
    const ids = new Set(chosen.map((d) => d.id));
    replaceAll({ ...db, documents: db.documents.map((d) => (ids.has(d.id) ? (status === 'versendet' ? { ...d, status, sentAt: today(), channel } : { ...d, status, sentAt: undefined, channel: undefined }) : d)) });
    setPicked({});
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Briefausgang</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 16 }}>Erstellte Briefe als PDF. Teile sie per Handy-Menü, versende sie und markiere sie dann als versendet.</Text>
      <Segmented value={tab} onChange={(v) => { setTab(v); setPicked({}); }} options={[{ label: `Bereit (${ready.length})`, value: 'bereit' }, { label: `Versendet (${sent.length})`, value: 'versendet' }]} />

      {list.length === 0 ? (
        <EmptyState icon={tab === 'bereit' ? 'mail-open-outline' : 'checkmark-done'} title={tab === 'bereit' ? 'Keine Briefe im Ausgang' : 'Noch nichts versendet'}
          text={tab === 'bereit' ? 'Starte einen Mahnlauf oder einen Nebenkosten-Lauf. Die Briefe erscheinen hier.' : 'Briefe, die du als versendet markierst, stehen hier als Nachweis.'}
          actionLabel={tab === 'bereit' ? 'Zur Übersicht' : undefined} onAction={tab === 'bereit' ? () => navigation.navigate('Tabs') : undefined} />
      ) : (
        <Section title={tab === 'bereit' ? 'Zum Versand' : 'Nachweis'}>
          {list.map((d) => {
            const on = isOn(d);
            return (
              <View key={d.id} style={{ padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`${d.name} auswählen`} accessibilityState={{ checked: on }} onPress={() => setPicked({ ...picked, [d.id]: !picked[d.id] })} hitSlop={8} style={{ marginTop: 2 }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? c.primary : c.muted} />
                  </Pressable>
                  <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" onPress={() => navigation.navigate('DocumentViewer', { id: d.id })}>
                    <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{d.name}</Text>
                    <Text style={{ fontSize: type.footnote, color: c.muted }}>{tenantName(d)} · erstellt {dateDE(d.added)} · {fmtSize(d.size)}</Text>
                  </Pressable>
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </View>
                {d.status === 'versendet' && <View style={{ paddingLeft: 38 }}><Badge text={`Versendet am ${dateDE(d.sentAt ?? '')}${d.channel ? ` · ${d.channel}` : ''}`} tone="ok" /></View>}
              </View>
            );
          })}
        </Section>
      )}

      {chosen.length > 0 && (
        <>
          <Button icon="share-outline" title={`${chosen.length} Brief${chosen.length === 1 ? '' : 'e'} teilen`} onPress={shareEach} disabled={busy} />
          {chosen.length > 1 && <><Gap h={8} /><Button kind="secondary" icon="documents-outline" title="Als eine PDF-Datei teilen" onPress={shareOne} disabled={busy} /></>}
          <Gap h={18} />
          {tab === 'bereit' ? (
            <>
              <Text style={{ color: c.muted, fontSize: type.footnote, fontWeight: '600', marginBottom: 8 }}>VERSENDET ÜBER</Text>
              <FilterChips value={channel} onChange={setChannel} options={CHANNELS.map((x) => ({ label: x, value: x }))} />
              <Button kind="secondary" icon="checkmark-done" title={`Als versendet markieren (${chosen.length})`} onPress={() => setStatus('versendet')} />
            </>
          ) : (
            <Button kind="plain" title="Zurück in den Ausgang" onPress={() => setStatus('bereit')} />
          )}
        </>
      )}

      <Gap h={22} />
      <Section title="Versandweg" footer="Heute verschickst du die Briefe selbst. Ein Dienst der Deutschen Post lässt sich später anschließen, ohne dass sich Briefaufbau oder Ablage ändern.">
        <ListRow icon="share-social" iconTone="ok" title="Manuell (Teilen-Menü)" subtitle="PDF an E-Mail, Post-App oder Dateien senden" right="Aktiv" />
        <ListRow icon="mail" title={epostProvider.label} subtitle={epostProvider.hint} right="Bald" />
      </Section>
      <Note>Wichtig: Eine Mahnung gilt erst als zugestellt, wenn sie den Mieter erreicht hat. Hebe dir Nachweise auf.</Note>
    </Screen>
  );
}
