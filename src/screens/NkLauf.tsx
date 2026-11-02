import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, EmptyState, FilterChips, Gap, ListRow, Note, Row, Screen, Section, Segmented, confirm, notify, useColors } from '../ui';
import { nkOverview } from '../nk';
import { exportPdf, nkHtml } from '../pdf';
import { nkModel } from '../letters';
import { storeLetters } from '../outbox';
import { filesSupported } from '../files';
import { dateDE, eur } from '../calc';
import { type } from '../theme';

export function NkLauf({ route, navigation }: any) {
  const { db, replaceAll } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const [propertyId, setPropertyId] = useState<string>(route.params?.propertyId ?? db.properties[0]?.id ?? '');
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [again, setAgain] = useState<Record<string, boolean>>({}); // bereits erstellte trotzdem erneut
  const prop = db.properties.find((p) => p.id === propertyId);
  const years = [0, 1, 2, 3].map((o) => new Date().getFullYear() - o);
  const ov = useMemo(() => (prop ? nkOverview(db, prop, year) : null), [db, prop, year]);

  if (!prop || !ov) return <Screen><EmptyState icon="business" title="Kein Objekt" text="Lege zuerst ein Objekt mit Wohnungen und Mietern an." /></Screen>;

  const selectable = (r: (typeof ov.rows)[number]) => r.hasCosts && r.res.months > 0;
  const isOn = (r: (typeof ov.rows)[number]) => selectable(r) && (r.done ? !!again[r.tenant.id] : !off[r.tenant.id]);
  const chosen = ov.rows.filter(isOn);
  const sumNach = chosen.filter((r) => r.res.balance > 0).reduce((a, r) => a + r.res.balance, 0);
  const sumGut = chosen.filter((r) => r.res.balance < 0).reduce((a, r) => a - r.res.balance, 0);
  const toggle = (r: (typeof ov.rows)[number]) => (r.done ? setAgain({ ...again, [r.tenant.id]: !again[r.tenant.id] }) : setOff({ ...off, [r.tenant.id]: isOn(r) }));

  const run = () => {
    if (chosen.length === 0) return;
    confirm(`${chosen.length} Abrechnung${chosen.length === 1 ? '' : 'en'} für ${year} erstellen?`, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const ids = new Set(chosen.map((r) => r.tenant.id));
      const tenants = db.tenants.map((t) => (ids.has(t.id) ? { ...t, nkDone: { ...(t.nkDone ?? {}), [String(year)]: today } } : t));
      if (filesSupported()) {
        try {
          const docs = await storeLetters(chosen.map((r) => ({ model: nkModel(r.res, r.tenant, r.unit, prop, year, cfg), tenant: r.tenant, note: `Nebenkosten ${year}` })));
          replaceAll({ ...db, tenants, documents: [...db.documents, ...docs] });
          navigation.replace('Outbox');
        } catch (e: any) { notify(`PDF konnte nicht erstellt werden: ${e?.message ?? e}`); }
        return;
      }
      const html = chosen.map((r) => nkHtml(r.res, r.tenant, r.unit, prop, year, cfg)).join('');
      replaceAll({ ...db, tenants });
      try { await exportPdf(html); } catch (e: any) { notify(String(e?.message ?? e)); }
    }, 'Erstellen', `Jede Abrechnung wird als PDF im Briefausgang abgelegt. Nachzahlungen: ${eur(sumNach)} · Guthaben: ${eur(sumGut)}.`);
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Nebenkosten-Lauf</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 16 }}>Alle Mieter eines Hauses für ein Abrechnungsjahr. Prüfe die Ergebnisse, dann landen alle Abrechnungen als PDF im Briefausgang.</Text>

      {db.properties.length > 1 && <FilterChips value={propertyId} onChange={(v) => { setPropertyId(v); setOff({}); setAgain({}); }} options={db.properties.map((p) => ({ label: p.name, value: p.id }))} />}
      <Segmented value={year} onChange={(v) => { setYear(v); setOff({}); setAgain({}); }} options={years.map((y) => ({ label: String(y), value: y }))} />

      <Section title={`Kosten ${year} · ${prop.name}`}>
        <Row left="Erfasste Kosten" right={eur(ov.totalCosts)} bold />
        <Row left="Auf Mieter umgelegt" right={eur(ov.allocated)} />
        <Row left="Nicht umgelegt (z. B. Leerstand)" right={eur(ov.notAllocated)} color={ov.notAllocated > 0.5 ? c.warn : undefined} />
        <Row left="Vorauszahlungen der Mieter" right={eur(ov.advances)} />
      </Section>

      {ov.totalCosts === 0 && (
        <Section><ListRow icon="alert-circle" iconTone="warn" title={`Für ${year} sind keine Kosten erfasst`} subtitle="Betriebskosten im Objekt eintragen" onPress={() => navigation.navigate('PropertyDetail', { id: prop.id })} /></Section>
      )}
      {ov.warnings.length > 0 && (
        <Section title={`Hinweise (${ov.warnings.length})`} footer="Prüfe diese Punkte, bevor du die Abrechnungen verschickst.">
          {ov.warnings.slice(0, 6).map((w) => <Note key={w}>⚠ {w}</Note>)}
          {ov.warnings.length > 6 && <Note>… und {ov.warnings.length - 6} weitere</Note>}
        </Section>
      )}

      <Section title={`Mieter (${ov.rows.length})`} footer={ov.rows.length ? 'Bereits erstellte Abrechnungen sind abgewählt. Zum erneuten Erstellen das Kästchen setzen.' : undefined}>
        {ov.rows.length === 0 && <Note>In {year} hat niemand in diesem Haus gewohnt.</Note>}
        {ov.rows.map((r) => {
          const on = isOn(r);
          const can = selectable(r);
          const b = r.res.balance;
          return (
            <View key={r.tenant.id} style={{ padding: 14, gap: 8, opacity: can ? 1 : 0.6 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Pressable accessibilityRole="checkbox" accessibilityLabel={`${r.tenant.name} abrechnen`} accessibilityState={{ checked: on, disabled: !can }} disabled={!can} onPress={() => toggle(r)} hitSlop={8} style={{ marginTop: 2 }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? c.primary : c.muted} />
                </Pressable>
                <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" onPress={() => navigation.navigate('TenantDetail', { id: r.tenant.id })}>
                  <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{r.tenant.name}</Text>
                  <Text style={{ fontSize: type.footnote, color: c.muted }}>{r.unit.name} · {r.res.months} Monat{r.res.months === 1 ? '' : 'e'}</Text>
                </Pressable>
                {can ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: type.body, fontWeight: '700', color: b > 0 ? c.danger : c.ok, fontVariant: ['tabular-nums'] }}>{b > 0 ? '+ ' : '− '}{eur(Math.abs(b))}</Text>
                    <Text style={{ fontSize: type.footnote, color: c.muted }}>{b > 0 ? 'Nachzahlung' : 'Guthaben'}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ paddingLeft: 38, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {!r.hasCosts ? <Badge text="Keine Kosten erfasst" tone="neutral" /> : r.res.months === 0 ? <Badge text="Keine Mietmonate" tone="neutral" /> : null}
                {r.done ? <Badge text={`Erstellt am ${dateDE(r.done)}`} tone="ok" /> : null}
                {r.res.warnings.length > 0 ? <Badge text={`${r.res.warnings.length} Hinweis${r.res.warnings.length === 1 ? '' : 'e'}`} tone="warn" /> : null}
              </View>
            </View>
          );
        })}
      </Section>

      {chosen.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: c.muted, fontSize: type.subhead, textAlign: 'center' }}>Nachzahlungen {eur(sumNach)} · Guthaben {eur(sumGut)}</Text>
        </View>
      )}
      <Button icon="document-text" title={chosen.length ? `${chosen.length} Abrechnung${chosen.length === 1 ? '' : 'en'} erstellen` : 'Niemand ausgewählt'} onPress={run} disabled={chosen.length === 0} />
      <Gap h={8} />
      <Button kind="plain" title="Briefe und Absender anpassen" onPress={() => navigation.navigate('Briefe')} />
    </Screen>
  );
}
