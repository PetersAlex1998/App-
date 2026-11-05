import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { EmptyState, FilterChips, ListRow, Note, Screen, Section, Stat, StatGrid, useColors } from '../ui';
import { eur } from '../calc';
import { Kpi, portfolio, todos } from '../portfolio';
import { type } from '../theme';

const p1 = (n: number | null) => (n === null ? '–' : `${n.toFixed(1).replace('.', ',')} %`);

/** Portfolio-Controlling: Cashflow, Vermietung, Schulden und Rendite je Haus und gesamt. */
export function Portfolio({ navigation }: any) {
  const { db } = useStore();
  const c = useColors();
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now - 1);
  if (db.properties.length === 0) return <Screen><EmptyState icon="stats-chart-outline" title="Noch keine Häuser" text="Lege Häuser, Wohnungen und Mieter an. Dann entsteht hier das Controlling." /></Screen>;
  const { total: t, houses } = portfolio(db, year);
  const tasks = todos(db);
  const line = (k: Kpi) => `${k.rented}/${k.units} vermietet · Cashflow ${eur(k.cashflow)}${k.netYield !== null ? ` · Nettorendite ${p1(k.netYield)}` : ''}`;
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Portfolio</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Kennzahlen deines Bestands. Einnahmen und Ausgaben beziehen sich auf das gewählte Jahr, Vermietung und Schulden auf heute.</Text>
      <FilterChips value={String(year)} onChange={(v) => setYear(Number(v))} options={[0, 1, 2].map((o) => ({ label: o === 0 ? `${now} (bisher)` : String(now - o), value: String(now - o) }))} />

      <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14, gap: 4 }}>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>Cashflow {year} nach Zins und Tilgung</Text>
        <Text style={{ color: t.cashflow < 0 ? c.danger : c.text, fontSize: 30, fontWeight: '800' }}>{eur(t.cashflow)}</Text>
        <Text style={{ color: c.muted, fontSize: type.subhead }}>Einnahmen {eur(t.income)} − Ausgaben {eur(t.expenses)} − Zinsen {eur(t.interest)} − Tilgung {eur(t.principal)}</Text>
      </View>

      <StatGrid>
        <Stat label="Vermietet (nach Fläche)" value={p1(t.occupancy)} tone={t.vacant ? undefined : 'ok'} />
        <Stat label="Entgangene Miete (Leerstand)" value={`${eur(t.rentVacant)} / Jahr`} tone={t.rentVacant ? 'danger' : 'ok'} />
        <Stat label="Restschuld" value={eur(t.debt)} />
        <Stat label="Beleihung (Restschuld/Marktwert)" value={p1(t.ltv)} />
        <Stat label="Bruttomietrendite" value={p1(t.grossYield)} />
        <Stat label="Nettomietrendite" value={p1(t.netYield)} />
        {t.netWorth !== null && <Stat label="Vermögen (Marktwert − Schulden)" value={eur(t.netWorth)} tone="ok" />}
        <Stat label="Mietrückstand" value={eur(t.openRent)} tone={t.openRent ? 'danger' : 'ok'} />
      </StatGrid>
      {(t.price === 0 || t.marketValue === 0) && <View style={{ marginTop: 14 }}><Note>{t.price === 0 ? 'Für die Rendite fehlt der Kaufpreis. ' : ''}{t.marketValue === 0 ? 'Für Beleihung und Vermögen fehlt der Marktwert. ' : ''}Trage beides beim Haus unter „Grundbuch und Kauf“ ein.</Note></View>}

      {tasks.length > 0 && (
        <Section title="Handlungsfelder">
          {tasks.map((x) => <ListRow key={x.id} icon={x.icon as 'leaf'} iconTone={x.tone === 'neutral' ? undefined : x.tone} title={x.title} subtitle={x.detail} onPress={() => navigation.navigate(x.screen)} />)}
        </Section>
      )}

      <Section title="Häuser" footer="Sortiert nach Cashflow. Nettomietrendite = (Jahreskaltmiete der vermieteten Einheiten − nicht umlagefähige Kosten) ÷ Kaufpreis, ein Richtwert.">
        {houses.map((k) => (
          <ListRow key={k.id} icon="home-outline" title={k.name} subtitle={line(k)} right={eur(k.cashflow)} rightSub="Cashflow" onPress={() => navigation.navigate('PropertyDetail', { id: k.id })} />
        ))}
      </Section>
    </Screen>
  );
}
