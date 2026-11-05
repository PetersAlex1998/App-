import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore } from '../store';
import { Badge, Button, DateField, EmptyState, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { dateDE, eur, rentNow, today } from '../calc';
import { INCOMING, Step, depositSettlement, wechsel } from '../moveOut';
import { useTenantActions } from '../tenantActions';
import { type } from '../theme';

const ICON: Record<Step['status'], string> = { done: 'checkmark-circle', open: 'ellipse-outline', wait: 'time-outline', skip: 'remove-circle-outline' };

/** Geführter Mieterwechsel: Auszug, Abnahme, Zähler, Nebenkosten, Kaution und Neuvermietung in einer Reihenfolge. */
export function Mieterwechsel({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const unitId: string | undefined = route.params?.unitId;
  const w = unitId ? wechsel(db, unitId) : null;
  const act = useTenantActions(w?.outgoing, navigation); // vor jedem frühen Return (Regeln der Hooks)
  const [date, setDate] = useState(w?.outgoing?.moveOut || today());

  if (!w) return <Screen><EmptyState icon="swap-horizontal" title="Wohnung nicht gefunden" text="Starte den Mieterwechsel aus einer Wohnung." /></Screen>;
  const { unit, outgoing: out, incoming: inc } = w;
  const prop = db.properties.find((p) => p.id === unit.propertyId);
  const total = w.steps.filter((s) => s.status !== 'skip' && !s.optional).length;

  const setMoveOut = () => {
    if (!out) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return notify('Bitte ein Datum wählen.');
    if (date < out.moveIn) return notify('Der Auszug muss nach dem Einzug liegen.');
    // Die Miete während der Mietzeit festhalten, damit die Mieterhistorie der Wohnung stimmt
    save('tenants', { ...out, moveOut: date, coldRent: out.coldRent ?? rentNow(unit).coldRent });
  };
  const toggle = (step: Step) => {
    const t = INCOMING.has(step.id) ? inc : out;
    if (!t) return;
    const m = { ...(t.moveSteps ?? {}) };
    if (m[step.id]) delete m[step.id]; else m[step.id] = today();
    save('tenants', { ...t, moveSteps: m });
  };
  const doc = (templateId: string, tenantId?: string, preset?: string) => navigation.navigate('VorlageForm', { templateId, tenantId, unitId: unit.id, preset });

  const action = (s: Step): (() => void) | undefined => {
    switch (s.id) {
      case 'kuendigung': return () => out && doc('kuendigungsbestaetigung', out.id);
      case 'protokoll': return () => out && doc('uebergabeprotokoll', out.id, 'Art=Auszug');
      case 'zaehler': return () => (out?.moveOut ? navigation.navigate('Ablesung', { propertyId: unit.propertyId, unitId: unit.id, date: out.moveOut }) : notify('Lege zuerst den Auszugstermin fest.'));
      case 'nk': return () => (out?.moveOut ? act.createNk(Number(out.moveOut.slice(0, 4))) : notify('Lege zuerst den Auszugstermin fest.'));
      case 'kaution': return () => out && navigation.navigate('Kaution', { tenantId: out.id });
      case 'neu': return () => navigation.navigate('TenantForm', { unitId: unit.id });
      case 'vertrag': return () => inc && doc('mietvertrag', inc.id);
      case 'geber': return () => inc && doc('wohnungsgeber', inc.id);
      case 'einzug': return () => inc && doc('uebergabeprotokoll', inc.id, 'Art=Einzug');
      case 'kautionNeu': return () => inc && doc('kautionsquittung', inc.id);
      default: return undefined;
    }
  };
  const ks = out ? depositSettlement(db, out, unit) : null;

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 4 }}>Mieterwechsel</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>{unit.name}{prop ? ` · ${prop.name}` : ''}{out ? `. Auszug: ${out.name}` : ''}{inc ? `. Einzug: ${inc.name}` : ''}.</Text>
      <View accessible accessibilityLabel={`${w.done} von ${total} Schritten erledigt`} style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: c.text, fontSize: type.headline, fontWeight: '700' }}>{w.open === 0 ? 'Alles erledigt' : `${w.done} von ${total} erledigt`}</Text>
          {w.open === 0 && <Badge text="Fertig" tone="ok" />}
        </View>
        <View accessible={false} style={{ height: 10, borderRadius: 5, backgroundColor: c.fill, overflow: 'hidden' }}>
          <View style={{ width: `${total ? (w.done / total) * 100 : 0}%`, height: '100%', backgroundColor: w.open ? c.primary : c.ok, borderRadius: 5 }} />
        </View>
      </View>

      {!out && <EmptyState icon="person-add-outline" title="Noch kein Mieter" text="Diese Wohnung hatte noch keinen Mieter. Lege den ersten an." actionLabel="Mieter anlegen" onAction={() => navigation.navigate('TenantForm', { unitId: unit.id })} />}

      {out && !out.moveOut && (
        <Section title="Auszugstermin" footer="Danach prüft die App Zähler, Nebenkosten und Kaution zu diesem Datum.">
          <View style={{ padding: 12, gap: 8 }}>
            <DateField label="Auszug am" value={date} onChange={setDate} />
            <Button icon="checkmark" title="Auszug festhalten" onPress={setMoveOut} />
          </View>
        </Section>
      )}

      {out && (
        <Section title="Auszug" footer={out.moveOut ? `Auszug am ${dateDE(out.moveOut)}. Tippe einen Schritt an, um ihn zu erledigen.` : undefined}>
          {w.steps.filter((s) => !['neu', ...INCOMING].includes(s.id)).map((s) => <StepRow key={s.id} s={s} onPress={action(s)} onToggle={() => toggle(s)} />)}
        </Section>
      )}

      {ks && (ks.paid > 0 || ks.agreed > 0) && (
        <Section title="Kaution im Überblick">
          <View style={{ padding: 14, gap: 4 }}>
            <Line k="Kaution gezahlt" v={eur(ks.paid)} />
            <Line k="Offene Mieten" v={`- ${eur(ks.openRent)}`} />
            {ks.nkKnown && <Line k={`Nebenkosten ${ks.year}`} v={ks.nkClaim ? `- ${eur(ks.nkClaim)}` : ks.nkCredit ? `+ ${eur(ks.nkCredit)} Guthaben` : eur(0)} />}
            <Line k={ks.shortfall ? 'Noch offen' : 'Rückzahlbar'} v={eur(ks.shortfall || ks.refund)} bold />
            {!ks.nkKnown && <Text style={{ color: c.muted, fontSize: type.subhead, marginTop: 6 }}>Betriebskosten {ks.year} sind noch nicht erfasst. Plane einen angemessenen Rückbehalt ein.</Text>}
          </View>
        </Section>
      )}

      <Section title="Neuvermietung" footer="Mietpreisbremse: Gilt sie in deiner Gemeinde, darf die neue Miete die ortsübliche Vergleichsmiete höchstens um 10 % übersteigen. Prüfe das für dein Haus.">
        {w.steps.filter((s) => ['neu', ...INCOMING].includes(s.id)).map((s) => <StepRow key={s.id} s={s} onPress={action(s)} onToggle={() => toggle(s)} />)}
      </Section>
      <Note>Die Schriftstücke sind Entwürfe nach gängiger Praxis. Lass sie vor dem Einsatz rechtlich prüfen.</Note>
    </Screen>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  const c = useColors();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: c.text, fontSize: type.body, fontWeight: bold ? '700' : '400' }}>{k}</Text><Text style={{ color: c.text, fontSize: type.body, fontWeight: bold ? '700' : '400' }}>{v}</Text></View>;
}

function StepRow({ s, onPress, onToggle }: { s: Step; onPress?: () => void; onToggle: () => void }) {
  const c = useColors();
  const tone = s.status === 'done' ? 'ok' : s.status === 'open' ? 'primary' : undefined;
  return (
    <View>
      <ListRow icon={ICON[s.status] as 'leaf'} iconTone={tone as 'ok'} title={s.title + (s.optional ? ' (optional)' : '')} subtitle={s.detail} onPress={s.status === 'skip' ? undefined : onPress} />
      {s.manual && s.status !== 'skip' && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${s.title}: ${s.status === 'done' ? 'wieder öffnen' : 'als erledigt markieren'}`} onPress={onToggle} style={{ paddingHorizontal: 14, paddingBottom: 10, paddingLeft: 66, minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: type.subhead, fontWeight: '600' }}>{s.status === 'done' ? 'Wieder öffnen' : 'Als erledigt markieren'}</Text>
        </Pressable>
      )}
    </View>
  );
}
