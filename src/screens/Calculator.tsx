import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useSettings } from '../settings';
import { useDelete } from '../undo';
import { Badge, Button, ChipField, Disclosure, EmptyState, Field, Gap, LargeHeader, ListRow, Note, Row, Screen, Section, Stat, StatGrid, notify, useColors } from '../ui';
import { eur, num } from '../calc';
import { type } from '../theme';
import { CRITERION_LABEL, CalcInput, DEFAULT_INPUT, GRUNDERWERBSTEUER, calculate, maxPrice, stress, verdict } from '../calculator';

const pct = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`);
const VERDICT = {
  gut: { text: 'Preis liegt unter dem Maximum', tone: 'ok' as const },
  verhandeln: { text: 'Knapp darüber: verhandeln', tone: 'warn' as const },
  zu_teuer: { text: 'Zu teuer', tone: 'danger' as const },
  offen: { text: 'Kaufpreis eingeben', tone: 'neutral' as const },
};

/* ───────── Liste gespeicherter Kalkulationen ───────── */

export function CalculatorList({ navigation }: any) {
  const { db } = useStore();
  const list = [...db.calculations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Screen>
      <LargeHeader navTitle="Kalkulator" title="Immokalkulator" subtitle="Kaufobjekte schnell durchrechnen" action={{ label: 'Neue Kalkulation', onPress: () => navigation.navigate('CalculatorForm', {}) }} />
      <Button icon="calculator-outline" title="Neue Kalkulation" onPress={() => navigation.navigate('CalculatorForm', {})} />
      <Gap h={22} />
      {list.length === 0 ? (
        <EmptyState icon="calculator-outline" title="Noch keine Kalkulation" text="Gib Kaufpreis, Fläche und Miete eines Angebots ein. Du siehst sofort Rendite, Cashflow und den höchsten Preis, den du zahlen solltest." />
      ) : (
        <Section title={`Gespeichert (${list.length})`}>
          {list.map((c) => {
            const r = calculate(c.input);
            const m = maxPrice(c.input);
            const v = verdict(c.input.price, m.max);
            return (
              <ListRow key={c.id} icon="home-outline" title={c.name} subtitle={`${eur(c.input.price)}${r.netYield !== null ? ` · Netto ${pct(r.netYield)}` : ''}${m.recommended !== null ? ` · Max. ${eur(m.recommended)}` : ''}`}
                badge={v.verdict === 'offen' ? undefined : { text: VERDICT[v.verdict].text, tone: VERDICT[v.verdict].tone }}
                onPress={() => navigation.navigate('CalculatorForm', { id: c.id })} />
            );
          })}
        </Section>
      )}
    </Screen>
  );
}

/* ───────── Kalkulator ───────── */

type F = Record<keyof CalcInput, string> & { name: string; land: string };
const str = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? '' : String(n).replace('.', ','));
const strZ = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ',')); // auch 0 anzeigen

function toForm(i: CalcInput, name: string): F {
  const land = Object.entries(GRUNDERWERBSTEUER).find(([, v]) => v === i.landTax)?.[0] ?? '';
  return {
    name, land, price: str(i.price), area: str(i.area), units: String(i.units || 1), rentMonth: str(i.rentMonth), renovation: str(i.renovation),
    landTax: strZ(i.landTax), notary: strZ(i.notary), broker: strZ(i.broker), vacancy: strZ(i.vacancy), managementPerUnit: strZ(i.managementPerUnit), maintenancePerSqm: strZ(i.maintenancePerSqm),
    equityPct: strZ(i.equityPct), interest: strZ(i.interest), amortization: strZ(i.amortization), taxRate: strZ(i.taxRate), buildingShare: strZ(i.buildingShare), afaRate: strZ(i.afaRate),
    targetNetYield: strZ(i.targetNetYield), minCashflow: strZ(i.minCashflow), maxFactor: strZ(i.maxFactor),
  };
}
const opt = (s: string) => (s.trim() === '' ? null : num(s));
function toInput(f: F): CalcInput {
  const n = (s: string) => num(s) || 0;
  return {
    price: n(f.price), area: n(f.area), units: Math.max(1, Math.round(n(f.units))), rentMonth: n(f.rentMonth), renovation: n(f.renovation),
    landTax: n(f.landTax), notary: n(f.notary), broker: n(f.broker), vacancy: n(f.vacancy), managementPerUnit: n(f.managementPerUnit), maintenancePerSqm: n(f.maintenancePerSqm),
    equityPct: Math.min(100, n(f.equityPct)), interest: n(f.interest), amortization: n(f.amortization), taxRate: n(f.taxRate), buildingShare: Math.min(100, n(f.buildingShare)), afaRate: n(f.afaRate),
    targetNetYield: opt(f.targetNetYield), minCashflow: opt(f.minCashflow), maxFactor: opt(f.maxFactor),
  };
}

export function CalculatorForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg, update } = useSettings();
  const del = useDelete();
  const c = useColors();
  const old = db.calculations.find((x) => x.id === route.params?.id);
  const [f, setF] = useState<F>(() => toForm({ ...DEFAULT_INPUT, ...(old ? {} : cfg.calcDefaults), ...(old?.input ?? {}) }, old?.name ?? ''));
  const set = (k: keyof F) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const input = useMemo(() => toInput(f), [f]);
  const r = useMemo(() => calculate(input), [input]);
  const m = useMemo(() => maxPrice(input), [input]);
  const v = verdict(input.price, m.max);
  const st = useMemo(() => stress(input), [input]);
  const ready = input.rentMonth > 0;

  const pickLand = (name: string) => { const t = GRUNDERWERBSTEUER[name]; if (t !== undefined) setF((cur) => ({ ...cur, land: name, landTax: String(t).replace('.', ',') })); };
  const submit = () => {
    if (!f.name.trim()) return notify('Bitte eine Bezeichnung eingeben, zum Beispiel die Adresse.');
    const { price, area, units, rentMonth, renovation, ...assumptions } = input;
    save('calculations', { id: old?.id ?? uid(), name: f.name.trim(), createdAt: old?.createdAt ?? new Date().toISOString(), input });
    update({ calcDefaults: assumptions }); // letzte Annahmen merken, damit die nächste Kalkulation schneller geht
    navigation.goBack();
  };

  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginBottom: 14, marginTop: 6 }}>Immokalkulator</Text>

      {/* Ergebnis zuerst: Maximalpreis und Ampel */}
      <View accessible accessibilityLabel={m.recommended !== null ? `Maximaler Kaufpreis ${eur(m.recommended)}. ${VERDICT[v.verdict].text}` : 'Noch kein Maximalpreis'}
        style={{ backgroundColor: c.card, borderRadius: 26, padding: 18, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14, shadowColor: '#1B1D22', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 }}>
        <Text style={{ color: c.muted, fontSize: type.subhead, fontWeight: '600' }}>Empfohlener Höchstpreis</Text>
        <Text style={{ color: c.text, fontSize: 36, fontWeight: '800', letterSpacing: -0.8, marginTop: 2, fontVariant: ['tabular-nums'] }}>{m.recommended !== null && ready ? eur(m.recommended) : '–'}</Text>
        {m.binding && ready && <Text style={{ color: c.muted, fontSize: type.subhead, marginTop: 2 }}>begrenzt durch: {CRITERION_LABEL[m.binding]}</Text>}
        <View style={{ marginTop: 12, gap: 6 }}>
          <Badge text={VERDICT[v.verdict].text} tone={VERDICT[v.verdict].tone} />
          {v.verdict === 'verhandeln' || v.verdict === 'zu_teuer' ? <Text style={{ color: c.text, fontSize: type.subhead }}>Angebot liegt {eur(v.delta)} über dem Höchstpreis. Verhandle mindestens {v.discountPct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % herunter.</Text> : null}
          {v.verdict === 'gut' && m.max !== null ? <Text style={{ color: c.text, fontSize: type.subhead }}>Du hast {eur(-v.delta)} Spielraum bis zum Höchstpreis.</Text> : null}
        </View>
      </View>

      <Section title="Objekt">
        <Field label="Bezeichnung / Adresse" value={f.name} onChangeText={set('name')} placeholder="z. B. Musterstr. 5, Paderborn" />
        <Field label="Kaufpreis" value={f.price} onChangeText={set('price')} keyboard="numeric" suffix="€" />
        <Field label="Kaltmiete pro Monat (alle Einheiten)" value={f.rentMonth} onChangeText={set('rentMonth')} keyboard="numeric" suffix="€" hint={r.rentPerSqm ? `${r.rentPerSqm.toLocaleString('de-DE')} € pro m²` : undefined} />
        <Field label="Wohnfläche" value={f.area} onChangeText={set('area')} keyboard="numeric" suffix="m²" hint={r.pricePerSqm ? `Kaufpreis ${r.pricePerSqm.toLocaleString('de-DE')} € pro m²` : undefined} />
        <Field label="Anzahl Einheiten" value={f.units} onChangeText={set('units')} keyboard="numeric" />
        <Field label="Sanierung / Einmalkosten" value={f.renovation} onChangeText={set('renovation')} keyboard="numeric" suffix="€" placeholder="optional" />
      </Section>

      {ready && (
        <>
          <StatGrid>
            <Stat label="Netto-Mietrendite" value={pct(r.netYield)} icon="trending-up-outline" tone={r.netYield !== null && input.targetNetYield && r.netYield >= input.targetNetYield ? 'ok' : undefined} />
            <Stat label="Cashflow / Monat" value={eur(r.cashflowMonth)} icon="cash-outline" tone={r.cashflowMonth >= 0 ? 'ok' : 'danger'} />
            <Stat label="Brutto-Rendite" value={pct(r.grossYield)} icon="stats-chart-outline" />
            <Stat label="Kaufpreisfaktor" value={r.factor === null ? '–' : r.factor.toLocaleString('de-DE')} icon="options-outline" />
          </StatGrid>
          <Gap h={16} />
        </>
      )}

      <Disclosure title="Annahmen" hint="Kaufnebenkosten, Kosten, Finanzierung, Steuer">
        <ChipField label="Bundesland (Grunderwerbsteuer)" value={f.land} options={Object.keys(GRUNDERWERBSTEUER)} onChange={(x) => x && pickLand(x)} />
        <Field label="Grunderwerbsteuer" value={f.landTax} onChangeText={set('landTax')} keyboard="numeric" suffix="%" />
        <Field label="Notar und Grundbuch" value={f.notary} onChangeText={set('notary')} keyboard="numeric" suffix="%" />
        <Field label="Maklerprovision (Käufer)" value={f.broker} onChangeText={set('broker')} keyboard="numeric" suffix="%" />
        <Field label="Leerstand und Mietausfall" value={f.vacancy} onChangeText={set('vacancy')} keyboard="numeric" suffix="% der Miete" />
        <Field label="Verwaltung" value={f.managementPerUnit} onChangeText={set('managementPerUnit')} keyboard="numeric" suffix="€ je Einheit und Jahr" />
        <Field label="Instandhaltung" value={f.maintenancePerSqm} onChangeText={set('maintenancePerSqm')} keyboard="numeric" suffix="€ je m² und Jahr" />
        <Field label="Eigenkapital" value={f.equityPct} onChangeText={set('equityPct')} keyboard="numeric" suffix="% der Gesamtkosten" />
        <Field label="Zins" value={f.interest} onChangeText={set('interest')} keyboard="numeric" suffix="%" />
        <Field label="Tilgung" value={f.amortization} onChangeText={set('amortization')} keyboard="numeric" suffix="%" />
        <Field label="Persönlicher Steuersatz" value={f.taxRate} onChangeText={set('taxRate')} keyboard="numeric" suffix="%" />
        <Field label="Gebäudeanteil am Kaufpreis" value={f.buildingShare} onChangeText={set('buildingShare')} keyboard="numeric" suffix="%" />
        <Field label="Abschreibung (AfA)" value={f.afaRate} onChangeText={set('afaRate')} keyboard="numeric" suffix="%" />
      </Disclosure>

      <Disclosure title="Zielwerte für den Höchstpreis" hint="Leer lassen schaltet ein Ziel ab">
        <Field label="Mindest-Netto-Mietrendite" value={f.targetNetYield} onChangeText={set('targetNetYield')} keyboard="numeric" suffix="%" placeholder="aus" />
        <Field label="Mindest-Cashflow nach Kapitaldienst" value={f.minCashflow} onChangeText={set('minCashflow')} keyboard="numeric" suffix="€ pro Monat" placeholder="aus" />
        <Field label="Höchster Kaufpreisfaktor" value={f.maxFactor} onChangeText={set('maxFactor')} keyboard="numeric" placeholder="aus" hint="Kaufpreis ÷ Jahreskaltmiete" />
      </Disclosure>

      {ready && (
        <>
          <Section title="Höchstpreis je Ziel" footer="Der niedrigste Wert ist die Empfehlung. Er ist auf volle 1.000 € abgerundet.">
            {(Object.keys(m.byCriterion) as (keyof typeof m.byCriterion)[]).map((k) => (
              <Row key={k} left={CRITERION_LABEL[k]} right={m.byCriterion[k] === Infinity ? 'unbegrenzt' : eur(m.byCriterion[k] ?? 0)} bold={k === m.binding} />
            ))}
            {Object.keys(m.byCriterion).length === 0 && <Note>Kein Ziel aktiv. Trage unter „Zielwerte“ mindestens eines ein.</Note>}
          </Section>

          <Section title="Kosten und Ertrag pro Jahr">
            <Row left="Jahreskaltmiete" right={eur(r.rentYear)} />
            <Row left={`abzüglich Leerstand (${pct(input.vacancy)})`} right={eur(r.effectiveRent - r.rentYear)} />
            <Row left="abzüglich Verwaltung und Instandhaltung" right={eur(-r.costsYear)} />
            <Row bold left="Reinertrag" right={eur(r.noi)} />
            <Row left="Kapitaldienst (Zins und Tilgung)" right={eur(-r.debtServiceYear)} />
            <Row bold left="Cashflow vor Steuern" right={eur(r.cashflowYear)} color={r.cashflowYear < 0 ? c.danger : undefined} />
          </Section>

          <Section title="Investition und Finanzierung">
            <Row left="Kaufpreis" right={eur(input.price)} />
            <Row left={`Kaufnebenkosten (${pct(r.purchaseCostsPct)})`} right={eur(r.purchaseCosts)} />
            {input.renovation > 0 && <Row left="Sanierung" right={eur(input.renovation)} />}
            <Row bold left="Gesamtinvestition" right={eur(r.totalInvestment)} />
            <Row left="Eigenkapital" right={eur(r.equity)} />
            <Row left="Darlehen" right={eur(r.loan)} />
            <Row left="Eigenkapitalrendite" right={pct(r.equityReturn)} />
            <Row left="Schuldendienstdeckung" right={r.dscr === null ? '–' : r.dscr.toLocaleString('de-DE')} />
          </Section>

          <Section title="Nach Steuern (Näherung)" footer="Vereinfacht für das erste Jahr: Miete minus Kosten, Zinsen und Abschreibung, mit deinem Steuersatz. Keine Steuerberatung.">
            <Row left={r.taxYear < 0 ? 'Steuererstattung pro Jahr' : 'Steuer pro Jahr'} right={eur(Math.abs(r.taxYear))} />
            <Row bold left="Cashflow nach Steuern pro Monat" right={eur(r.cashflowAfterTaxMonth)} color={r.cashflowAfterTaxMonth < 0 ? c.danger : undefined} />
          </Section>

          <Section title="Stresstest" footer="Cashflow pro Monat vor Steuern.">
            <Row left="Zins +1 Prozentpunkt" right={eur(st.interestPlus1)} color={st.interestPlus1 < 0 ? c.danger : undefined} />
            <Row left="Miete −10 %" right={eur(st.rentMinus10)} color={st.rentMinus10 < 0 ? c.danger : undefined} />
          </Section>
        </>
      )}

      <Button icon="checkmark" title={old ? 'Änderungen speichern' : 'Kalkulation speichern'} onPress={submit} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del('calculations', old.id); navigation.goBack(); }} /></>)}
      <Gap h={12} />
      <Note>Alle Angaben sind Annahmen und keine Anlageberatung. Prüfe Grunderwerbsteuer, Zinsen und Kosten für dein Angebot.</Note>
    </Screen>
  );
}
