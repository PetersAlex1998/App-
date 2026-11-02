import React, { useState } from 'react';
import { View } from 'react-native';
import { useStore, uid } from '../store';
import { Btn, Choice, Field, Screen, confirm, notify } from '../ui';
import { Cost, Kind, Payment, Property, Reminder, Tenant, Unit } from '../types';
import { num, today } from '../calc';

function useItem<T extends { id: string }>(kind: Kind, id?: string): T | undefined {
  const { db } = useStore();
  return (db[kind] as unknown as T[]).find((x) => x.id === id);
}

function Actions({ kind, id, onSave, nav }: { kind: Kind; id?: string; onSave: () => boolean | void; nav: any }) {
  const { remove } = useStore();
  return (
    <View>
      <Btn title="Speichern" onPress={() => onSave() !== false && nav.goBack()} />
      {id ? <Btn kind="danger" title="Löschen" onPress={() => confirm('Wirklich löschen? Abhängige Daten werden mit entfernt.', () => { remove(kind, id); nav.goBack(); })} /> : null}
    </View>
  );
}

export function PropertyForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Property>('properties', route.params?.id);
  const [f, setF] = useState<Property>(old ?? { id: uid(), name: '', street: '', zip: '', city: '', yearBuilt: '', notes: '' });
  const set = (k: keyof Property) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Field label="Bezeichnung *" value={f.name} onChangeText={set('name')} />
      <Field label="Straße / Nr." value={f.street} onChangeText={set('street')} />
      <Field label="PLZ" value={f.zip} onChangeText={set('zip')} keyboard="numeric" />
      <Field label="Ort" value={f.city} onChangeText={set('city')} />
      <Field label="Baujahr" value={f.yearBuilt} onChangeText={set('yearBuilt')} keyboard="numeric" />
      <Field label="Notizen" value={f.notes} onChangeText={set('notes')} multiline />
      <Actions kind="properties" id={old?.id} nav={navigation} onSave={() => { if (!f.name.trim()) { notify('Bitte Bezeichnung angeben'); return false; } save('properties', f); }} />
    </Screen>
  );
}

export function UnitForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Unit>('units', route.params?.id);
  const [f, setF] = useState({ name: old?.name ?? '', area: String(old?.area ?? ''), rooms: String(old?.rooms ?? ''), coldRent: String(old?.coldRent ?? ''), advance: String(old?.advance ?? '') });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Field label="Bezeichnung * (z. B. WE 2, 1. OG links)" value={f.name} onChangeText={set('name')} />
      <Field label="Fläche (m²)" value={f.area} onChangeText={set('area')} keyboard="numeric" />
      <Field label="Zimmer" value={f.rooms} onChangeText={set('rooms')} keyboard="numeric" />
      <Field label="Kaltmiete / Monat (€)" value={f.coldRent} onChangeText={set('coldRent')} keyboard="numeric" />
      <Field label="NK-Vorauszahlung / Monat (€)" value={f.advance} onChangeText={set('advance')} keyboard="numeric" />
      <Actions kind="units" id={old?.id} nav={navigation} onSave={() => {
        if (!f.name.trim()) { notify('Bitte Bezeichnung angeben'); return false; }
        save('units', { id: old?.id ?? uid(), propertyId: old?.propertyId ?? route.params.propertyId, name: f.name, area: num(f.area), rooms: num(f.rooms), coldRent: num(f.coldRent), advance: num(f.advance) });
      }} />
    </Screen>
  );
}

export function TenantForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const old = useItem<Tenant>('tenants', route.params?.id);
  const [f, setF] = useState({ name: old?.name ?? '', email: old?.email ?? '', phone: old?.phone ?? '', moveIn: old?.moveIn ?? today(), moveOut: old?.moveOut ?? '', deposit: String(old?.deposit ?? ''), unitId: old?.unitId ?? route.params?.unitId ?? '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Choice label="Wohnung *" value={f.unitId} onChange={(v) => setF({ ...f, unitId: v })}
        options={db.units.map((u) => ({ label: `${db.properties.find((p) => p.id === u.propertyId)?.name ?? ''} – ${u.name}`, value: u.id }))} />
      <Field label="Name *" value={f.name} onChangeText={set('name')} />
      <Field label="E-Mail" value={f.email} onChangeText={set('email')} keyboard="email-address" />
      <Field label="Telefon" value={f.phone} onChangeText={set('phone')} keyboard="phone-pad" />
      <Field label="Einzug (JJJJ-MM-TT)" value={f.moveIn} onChangeText={set('moveIn')} />
      <Field label="Auszug (JJJJ-MM-TT, leer = aktiv)" value={f.moveOut} onChangeText={set('moveOut')} />
      <Field label="Kaution (€)" value={f.deposit} onChangeText={set('deposit')} keyboard="numeric" />
      <Actions kind="tenants" id={old?.id} nav={navigation} onSave={() => {
        if (!f.name.trim() || !f.unitId) { notify('Name und Wohnung sind Pflicht'); return false; }
        save('tenants', { id: old?.id ?? uid(), unitId: f.unitId, name: f.name, email: f.email, phone: f.phone, moveIn: f.moveIn, moveOut: f.moveOut, deposit: num(f.deposit) });
      }} />
    </Screen>
  );
}

export function PaymentForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const old = useItem<Payment>('payments', route.params?.id);
  const [f, setF] = useState({ tenantId: old?.tenantId ?? route.params?.tenantId ?? '', date: old?.date ?? today(), month: old?.month ?? today().slice(0, 7), amount: String(old?.amount ?? ''), kind: (old?.kind ?? 'miete') as Payment['kind'], note: old?.note ?? '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Choice label="Mieter *" value={f.tenantId} onChange={(v) => setF({ ...f, tenantId: v })} options={db.tenants.map((t) => ({ label: t.name, value: t.id }))} />
      <Choice label="Art" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ label: 'Miete', value: 'miete' }, { label: 'Kaution', value: 'kaution' }, { label: 'NK-Nachzahlung', value: 'nachzahlung' }]} />
      <Field label="Betrag (€) *" value={f.amount} onChangeText={set('amount')} keyboard="numeric" />
      <Field label="Zahlungsdatum (JJJJ-MM-TT)" value={f.date} onChangeText={set('date')} />
      {f.kind === 'miete' && <Field label="Für Monat (JJJJ-MM)" value={f.month} onChangeText={set('month')} />}
      <Field label="Notiz" value={f.note} onChangeText={set('note')} />
      <Actions kind="payments" id={old?.id} nav={navigation} onSave={() => {
        if (!f.tenantId || num(f.amount) <= 0) { notify('Mieter und Betrag sind Pflicht'); return false; }
        save('payments', { id: old?.id ?? uid(), tenantId: f.tenantId, date: f.date, month: f.month, amount: num(f.amount), kind: f.kind, note: f.note });
      }} />
    </Screen>
  );
}

export function CostForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Cost>('costs', route.params?.id);
  const [f, setF] = useState({ category: old?.category ?? '', amount: String(old?.amount ?? ''), year: String(old?.year ?? new Date().getFullYear() - 1), key: (old?.key ?? 'area') as Cost['key'] });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Field label="Kostenart * (z. B. Müllabfuhr, Wasser, Grundsteuer)" value={f.category} onChangeText={set('category')} />
      <Field label="Gesamtbetrag (€) *" value={f.amount} onChangeText={set('amount')} keyboard="numeric" />
      <Field label="Abrechnungsjahr" value={f.year} onChangeText={set('year')} keyboard="numeric" />
      <Choice label="Verteilerschlüssel" value={f.key} onChange={(v) => setF({ ...f, key: v })} options={[{ label: 'Nach Wohnfläche', value: 'area' }, { label: 'Je Einheit', value: 'units' }]} />
      <Actions kind="costs" id={old?.id} nav={navigation} onSave={() => {
        if (!f.category.trim() || num(f.amount) <= 0) { notify('Kostenart und Betrag sind Pflicht'); return false; }
        save('costs', { id: old?.id ?? uid(), propertyId: old?.propertyId ?? route.params.propertyId, year: Math.round(num(f.year)), category: f.category, amount: num(f.amount), key: f.key });
      }} />
    </Screen>
  );
}

export type { Reminder };
