import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useStore, uid } from '../store';
import { useSettings } from '../settings';
import { Badge, Button, EmptyState, FilterChips, Gap, ListRow, Note, Screen, Section, notify, useColors } from '../ui';
import { eur } from '../calc';
import { byPerson, ownerStatement, ownerStatementModel } from '../ownerStatement';
import { storeInvoicePdf } from '../outbox';
import { filesSupported } from '../files';
import { type } from '../theme';

const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} %`;

/** Eigentümerabrechnung je Haus und Jahr: Überschuss nach Anteil, als PDF je Eigentümer. */
export function Eigentuemerabrechnung({ navigation }: any) {
  const { db, save } = useStore();
  const { s: cfg } = useSettings();
  const c = useColors();
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now - 1);
  const [busy, setBusy] = useState(false);
  const statements = db.properties.map((p) => ownerStatement(db, p.id, year)!).filter(Boolean);
  const persons = byPerson(db, year);
  const total = Math.round(statements.reduce((a, s) => a + s.surplus, 0) * 100) / 100;

  const make = async (ids: string[]) => {
    if (!filesSupported()) return notify('Das Erstellen ist in der Web-App verfügbar.');
    setBusy(true);
    try {
      let n = 0;
      for (const st of statements.filter((x) => ids.includes(x.prop.id) && x.problems.length === 0)) {
        for (let i = 0; i < st.owners.length; i++) {
          const model = ownerStatementModel(cfg, st, i);
          save('documents', await storeInvoicePdf(uid(), model, st.prop.id, `Eigentümerabrechnung ${year} – ${st.owners[i].owner.name}`));
          n++;
        }
      }
      if (n === 0) { setBusy(false); return notify('Für diese Häuser fehlen Eigentümer oder Anteile.'); }
      navigation.navigate('Outbox');
    } catch (e: any) { notify(String(e?.message ?? e)); setBusy(false); }
  };

  const ready = statements.filter((s) => s.problems.length === 0);
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 6, marginBottom: 6 }}>Eigentümerabrechnung</Text>
      <Text style={{ color: c.muted, fontSize: type.body, marginBottom: 14 }}>Was bleibt vom Haus übrig und was steht jedem Eigentümer nach Anteil zu? Überschuss = Einnahmen − Ausgaben − Zins − Tilgung.</Text>
      <FilterChips value={String(year)} onChange={(v) => setYear(Number(v))} options={[0, 1, 2, 3].map((o) => ({ label: o === 0 ? `${now} (bisher)` : String(now - o), value: String(now - o) }))} />
      {statements.length === 0 && <EmptyState icon="people-outline" title="Noch keine Häuser" text="Lege Häuser mit Eigentümern an." />}

      {statements.length > 0 && (
        <View accessible style={{ backgroundColor: c.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.glassBorder, marginBottom: 14 }}>
          <Text style={{ color: c.muted, fontSize: type.subhead }}>Überschuss aller Häuser {year}</Text>
          <Text style={{ color: total < 0 ? c.danger : c.text, fontSize: 30, fontWeight: '800' }}>{eur(total)}</Text>
        </View>
      )}

      {statements.map((st) => (
        <Section key={st.prop.id} title={st.prop.name} footer={st.problems.join(' ') || undefined}>
          <ListRow icon="home-outline" title={`Überschuss ${eur(st.surplus)}`} subtitle={`Einnahmen ${eur(st.incomeTotal)} − Ausgaben ${eur(st.expensesTotal)}${st.interest ? ` − Zinsen ${eur(st.interest)}` : ''}${st.principal ? ` − Tilgung ${eur(st.principal)}` : ''}`} onPress={() => navigation.navigate('PropertyDetail', { id: st.prop.id })} />
          {st.owners.map((o) => <ListRow key={o.owner.name} icon="person-outline" title={o.owner.name} subtitle={`Anteil ${pct(o.share)}`} right={eur(o.amount)} />)}
          {st.problems.length > 0 && <View style={{ padding: 12 }}><Badge text="Eigentümer ergänzen" tone="warn" /></View>}
          {st.problems.length === 0 && <View style={{ padding: 12 }}><Button kind="secondary" icon="document-text-outline" title={`${st.owners.length} Abrechnung${st.owners.length === 1 ? '' : 'en'} als PDF`} onPress={() => make([st.prop.id])} disabled={busy} /></View>}
        </Section>
      ))}

      {persons.length > 0 && (
        <Section title={`Je Person über alle Häuser ${year}`}>
          {persons.map((p) => <ListRow key={p.name} icon="person-circle-outline" title={p.name} subtitle={p.houses.map((h) => `${h.prop.name} ${pct(h.share)}`).join(' · ')} right={eur(p.amount)} />)}
        </Section>
      )}

      {ready.length > 1 && <Button icon="documents-outline" title={busy ? 'Wird erstellt …' : `Alle Abrechnungen erstellen (${ready.reduce((a, s) => a + s.owners.length, 0)})`} onPress={() => make(ready.map((s) => s.prop.id))} disabled={busy} />}
      <Gap h={14} />
      <Note>Die PDFs liegen im Briefausgang. Die steuerlichen Zahlen sind eine Orientierung. Maßgeblich ist die Erklärung deines Steuerberaters.</Note>
    </Screen>
  );
}
