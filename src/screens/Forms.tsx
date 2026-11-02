import React, { useState } from 'react';

import { useStore, uid } from '../store';
import { Button, ChipField, DateField, Disclosure, Field, Gap, Note, OptionRow, Screen, Section, Segmented, confirm } from '../ui';
import { Cost, Kind, Payment, Property, Tenant, Unit } from '../types';
import { eur, monthLabel, num, suggestPayment, today } from '../calc';
import { MeterType, UnitKind } from '../types';
import { View } from 'react-native';
import { METER_TYPES, meterTypeLabel } from '../meters';

function useItem<T extends { id: string }>(kind: Kind, id?: string): T | undefined {
  const { db } = useStore();
  return (db[kind] as unknown as T[]).find((x) => x.id === id);
}
type Errors = Record<string, string>;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

function Footer({ kind, id, nav, onSave, label = 'Speichern', deleteText }: { kind: Kind; id?: string; nav: any; onSave: () => boolean; label?: string; deleteText?: string }) {
  const { remove } = useStore();
  return (
    <>
      <Button title={label} icon="checkmark" onPress={() => onSave() && nav.goBack()} />
      {id ? (
        <>
          <Gap h={22} />
          <Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => confirm('Wirklich löschen?', () => { remove(kind, id); nav.goBack(); }, 'Löschen', deleteText ?? 'Das kann nicht rückgängig gemacht werden.')} />
        </>
      ) : null}
    </>
  );
}

const addYears = (iso: string, y: number) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(0, 4)) + y}${iso.slice(4)}` : '');
const filled = (...v: (string | undefined)[]) => v.some((x) => x && x.trim());

export function PropertyForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Property>('properties', route.params?.id);
  const [f, setF] = useState<Property>(old ?? { id: uid(), name: '', street: '', zip: '', city: '', yearBuilt: '', notes: '' });
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof Property) => (v: string) => setF({ ...f, [k]: v });
  const setIssued = (v: string) => setF({ ...f, eaIssued: v, eaValidUntil: !f.eaValidUntil || f.eaValidUntil === addYears(f.eaIssued ?? '', 10) ? addYears(v, 10) : f.eaValidUntil });
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Bitte eine Bezeichnung eingeben, z. B. „Haus Lindenstraße“.';
    setErr(e);
    if (Object.keys(e).length) return false;
    save('properties', f);
    return true;
  };
  return (
    <Screen>
      <Section title="Objekt">
        <Field label="Bezeichnung" value={f.name} onChangeText={set('name')} placeholder="z. B. Haus Lindenstraße" error={err.name} />
        <Field label="Baujahr" value={f.yearBuilt} onChangeText={set('yearBuilt')} keyboard="numeric" placeholder="optional" />
      </Section>
      <Section title="Adresse">
        <Field label="Straße und Hausnummer" value={f.street} onChangeText={set('street')} />
        <Field label="PLZ" value={f.zip} onChangeText={set('zip')} keyboard="numeric" />
        <Field label="Ort" value={f.city} onChangeText={set('city')} />
      </Section>
      <Disclosure title="Gebäude und Technik" filled={filled(f.plotArea, f.floors, f.heatingType, f.heatingYear, f.energySource)} hint="Grundstück, Etagen, Heizung">
        <Field label="Grundstücksfläche" value={f.plotArea ?? ''} onChangeText={set('plotArea')} keyboard="numeric" suffix="m²" />
        <Field label="Anzahl Etagen" value={f.floors ?? ''} onChangeText={set('floors')} keyboard="numeric" />
        <ChipField label="Heizungsart" value={f.heatingType ?? ''} options={['Gas', 'Öl', 'Fernwärme', 'Wärmepumpe', 'Pellets', 'Strom', 'Sonstige']} onChange={set('heatingType')} />
        <Field label="Baujahr der Heizung" value={f.heatingYear ?? ''} onChangeText={set('heatingYear')} keyboard="numeric" />
        <Field label="Energieträger" value={f.energySource ?? ''} onChangeText={set('energySource')} placeholder="z. B. Erdgas H" />
      </Disclosure>
      <Disclosure title="Energieausweis" filled={filled(f.eaType, f.eaValue, f.eaClass, f.eaIssued, f.eaValidUntil)} hint="Art, Kennwert, Effizienzklasse, Gültigkeit">
        <ChipField label="Art" value={f.eaType ?? ''} options={['Verbrauch', 'Bedarf']} onChange={set('eaType')} />
        <Field label="Energiekennwert" value={f.eaValue ?? ''} onChangeText={set('eaValue')} keyboard="numeric" suffix="kWh/(m²·a)" />
        <ChipField label="Effizienzklasse" value={f.eaClass ?? ''} options={['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']} onChange={set('eaClass')} />
        <DateField label="Ausgestellt am" value={f.eaIssued ?? ''} onChange={setIssued} optional />
        <DateField label="Gültig bis (10 Jahre)" value={f.eaValidUntil ?? ''} onChange={set('eaValidUntil')} optional />
      </Disclosure>
      <Disclosure title="Grundbuch und Kauf" filled={filled(f.landRegister, f.parcel, f.purchaseDate, f.purchasePrice)} hint="Grundbuch, Flurstück, Kaufpreis">
        <Field label="Grundbuch (Amtsgericht, Blatt)" value={f.landRegister ?? ''} onChangeText={set('landRegister')} />
        <Field label="Flurstück" value={f.parcel ?? ''} onChangeText={set('parcel')} />
        <DateField label="Kaufdatum" value={f.purchaseDate ?? ''} onChange={set('purchaseDate')} optional />
        <Field label="Kaufpreis" value={f.purchasePrice ?? ''} onChangeText={set('purchasePrice')} keyboard="numeric" suffix="€" />
      </Disclosure>
      <Disclosure title="Versicherung" filled={filled(f.insurer, f.policyNo, f.premium)} hint="Gebäudeversicherung">
        <Field label="Versicherer" value={f.insurer ?? ''} onChangeText={set('insurer')} />
        <Field label="Policennummer" value={f.policyNo ?? ''} onChangeText={set('policyNo')} />
        <Field label="Jahresprämie" value={f.premium ?? ''} onChangeText={set('premium')} keyboard="numeric" suffix="€" />
      </Disclosure>
      <Disclosure title="Ansprechpartner" filled={filled(f.contactName, f.contactPhone)} hint="Hausmeister, Verwalter">
        <Field label="Name" value={f.contactName ?? ''} onChangeText={set('contactName')} placeholder="z. B. Hausmeister Meier" />
        <Field label="Telefon" value={f.contactPhone ?? ''} onChangeText={set('contactPhone')} keyboard="phone-pad" />
      </Disclosure>
      <Section title="Notizen">
        <Field label="Notizen" value={f.notes} onChangeText={set('notes')} multiline placeholder="optional" />
      </Section>
      <Footer kind="properties" id={old?.id} nav={navigation} onSave={submit} deleteText="Alle Wohnungen, Mieter, Zahlungen, Zähler, Kosten und Dokumente dieses Objekts werden ebenfalls gelöscht." />
    </Screen>
  );
}

export function UnitForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Unit>('units', route.params?.id);
  const [f, setF] = useState({ name: old?.name ?? '', area: old ? String(old.area) : '', rooms: old ? String(old.rooms) : '', coldRent: old ? String(old.coldRent) : '', advance: old ? String(old.advance) : '' });
  const [kind, setKind] = useState<UnitKind>(old?.kind ?? 'wohnung');
  const [vat, setVat] = useState<number>(old?.vat ?? 0);
  const [x, setX] = useState({ floor: old?.floor ?? '', position: old?.position ?? '', balcony: old?.balcony ?? '', cellar: old?.cellar ?? '', parking: old?.parking ?? '', kitchen: old?.kitchen ?? '', equipment: old?.equipment ?? '', notes: old?.notes ?? '' });
  const setx = (k: keyof typeof x) => (v: string) => setX({ ...x, [k]: v });
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const net = num(f.coldRent) + num(f.advance);
  const total = net * (1 + (kind === 'gewerbe' ? vat : 0) / 100);
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Bitte eine Bezeichnung eingeben, z. B. „WE 2, 1. OG links“.';
    if (num(f.area) <= 0) e.area = 'Die Wohnfläche wird für die Nebenkostenabrechnung gebraucht.';
    if (num(f.coldRent) <= 0) e.coldRent = 'Bitte die Kaltmiete eingeben.';
    setErr(e);
    if (Object.keys(e).length) return false;
    save('units', { ...x, id: old?.id ?? uid(), kind, vat: kind === 'gewerbe' ? vat : 0, propertyId: old?.propertyId ?? route.params.propertyId, name: f.name.trim(), area: num(f.area), rooms: num(f.rooms), coldRent: num(f.coldRent), advance: num(f.advance) });
    return true;
  };
  return (
    <Screen>
      <Segmented value={kind} onChange={setKind} options={[{ label: 'Wohnung', value: 'wohnung' }, { label: 'Gewerbe', value: 'gewerbe' }, { label: 'Eigentum', value: 'eigentum' }]} />
      <Section title="Einheit" footer={kind === 'gewerbe' ? 'Gewerbe: andere Regeln als bei Wohnraum. Bei Umsatzsteuer-Option wird die USt auf Miete und Nebenkosten aufgeschlagen.' : kind === 'eigentum' ? 'Eigentumswohnung: Hausgeld und WEG-Abrechnung erfasst du später als Kosten.' : undefined}>
        <Field label="Bezeichnung" value={f.name} onChangeText={set('name')} placeholder={kind === 'gewerbe' ? 'z. B. Laden EG' : 'z. B. WE 2, 1. OG links'} error={err.name} />
        <Field label="Wohnfläche" value={f.area} onChangeText={set('area')} keyboard="numeric" suffix="m²" error={err.area} />
        <Field label="Zimmer" value={f.rooms} onChangeText={set('rooms')} keyboard="numeric" />
      </Section>
      {kind === 'gewerbe' && (
        <Segmented value={vat} onChange={setVat} options={[{ label: 'Ohne USt', value: 0 }, { label: '7 % USt', value: 7 }, { label: '19 % USt', value: 19 }]} />
      )}
      <Section title="Miete (netto)" footer={total > 0 ? `Gesamt pro Monat${kind === 'gewerbe' && vat ? ` inkl. ${vat} % USt` : ''}: ${eur(total)}` : undefined}>
        <Field label="Kaltmiete pro Monat" value={f.coldRent} onChangeText={set('coldRent')} keyboard="numeric" suffix="€" error={err.coldRent} />
        <Field label="Nebenkosten-Vorauszahlung pro Monat" value={f.advance} onChangeText={set('advance')} keyboard="numeric" suffix="€" />
      </Section>
      <Disclosure title="Lage und Ausstattung" filled={filled(...Object.values(x))} hint="Etage, Balkon, Keller, Stellplatz, Küche">
        <Field label="Etage" value={x.floor} onChangeText={setx('floor')} placeholder="z. B. 2. OG" />
        <Field label="Lage" value={x.position} onChangeText={setx('position')} placeholder="z. B. links, Hofseite" />
        <ChipField label="Balkon / Terrasse" value={x.balcony} options={['Balkon', 'Terrasse', 'Loggia', 'Keiner']} onChange={setx('balcony')} />
        <ChipField label="Keller" value={x.cellar} options={['Ja', 'Nein']} onChange={setx('cellar')} />
        <Field label="Stellplatz / Garage" value={x.parking} onChangeText={setx('parking')} placeholder="z. B. TG-Platz 14" />
        <ChipField label="Küche" value={x.kitchen} options={['Einbauküche', 'Keine Küche']} onChange={setx('kitchen')} />
        <Field label="Ausstattung" value={x.equipment} onChangeText={setx('equipment')} multiline placeholder="z. B. Parkett, Fußbodenheizung, Aufzug" />
        <Field label="Notizen" value={x.notes} onChangeText={setx('notes')} multiline placeholder="optional" />
      </Disclosure>
      <Footer kind="units" id={old?.id} nav={navigation} onSave={submit} deleteText="Der Mieter dieser Wohnung, seine Zahlungen, Zähler und Dokumente werden ebenfalls gelöscht." />
    </Screen>
  );
}

/** Neue Mieter: Rückstände zählen ab dem aktuellen Monat, nicht ab einem Einzug vor Jahren. */
const defaultTrackFrom = () => today().slice(0, 7);

export function TenantForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const old = useItem<Tenant>('tenants', route.params?.id);
  const [f, setF] = useState({ name: old?.name ?? '', email: old?.email ?? '', phone: old?.phone ?? '', moveIn: old?.moveIn ?? today(), moveOut: old?.moveOut ?? '', iban: old?.iban ?? '', trackFrom: old ? old.trackFrom ?? '' : defaultTrackFrom(), deposit: old ? String(old.deposit || '') : '', unitId: old?.unitId ?? route.params?.unitId ?? '' });
  const [x, setX] = useState({ salutation: old?.salutation ?? '', mobile: old?.mobile ?? '', postalAddress: old?.postalAddress ?? '', emergencyContact: old?.emergencyContact ?? '', contractEnd: old?.contractEnd ?? '', noticeMonths: old?.noticeMonths ?? '', rentAdjust: old?.rentAdjust ?? '', nextAdjust: old?.nextAdjust ?? '', depositType: old?.depositType ?? '', depositAccount: old?.depositAccount ?? '', notes: old?.notes ?? '' });
  const setx = (k: keyof typeof x) => (v: string) => setX({ ...x, [k]: v });
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = () => {
    const e: Errors = {};
    if (!f.unitId) e.unitId = 'Bitte eine Wohnung auswählen.';
    if (!f.name.trim()) e.name = 'Bitte den Namen eingeben.';
    if (!isDate(f.moveIn)) e.moveIn = 'Bitte ein gültiges Einzugsdatum wählen.';
    if (f.moveOut && (!isDate(f.moveOut) || f.moveOut < f.moveIn)) e.moveOut = 'Der Auszug muss nach dem Einzug liegen.';
    if (f.trackFrom && !isMonth(f.trackFrom)) e.trackFrom = 'Bitte einen Monat wählen.';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Das sieht nicht nach einer E-Mail-Adresse aus.';
    setErr(e);
    if (Object.keys(e).length) return false;
    save('tenants', { ...x, id: old?.id ?? uid(), unitId: f.unitId, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), iban: f.iban.replace(/\s/g, '').toUpperCase(), moveIn: f.moveIn, moveOut: f.moveOut, deposit: num(f.deposit), trackFrom: f.trackFrom || undefined });
    return true;
  };
  return (
    <Screen>
      {db.units.length === 0 ? (
        <Section title="Wohnung"><Note>Es gibt noch keine Wohnung. Lege zuerst in einem Objekt eine Wohnung an.</Note></Section>
      ) : (
        <Section title="Wohnung" footer={err.unitId}>
          {db.units.map((u) => {
            const p = db.properties.find((x) => x.id === u.propertyId);
            const cur = db.tenants.find((t) => t.unitId === u.id && (!t.moveOut || t.moveOut >= today()) && t.id !== old?.id);
            return <OptionRow key={u.id} selected={f.unitId === u.id} onPress={() => setF({ ...f, unitId: u.id })} title={`${p?.name ?? ''} – ${u.name}`} subtitle={cur ? `Derzeit: ${cur.name}` : 'Frei'} />;
          })}
        </Section>
      )}
      <Section title="Kontakt">
        <Field label="Name" value={f.name} onChangeText={set('name')} error={err.name} placeholder="Vor- und Nachname" />
        <Field label="E-Mail" value={f.email} onChangeText={set('email')} keyboard="email-address" error={err.email} placeholder="optional" />
        <Field label="Telefon" value={f.phone} onChangeText={set('phone')} keyboard="phone-pad" placeholder="optional" />
        <Field label="IBAN (für die Zuordnung von Kontoauszügen)" value={f.iban} onChangeText={set('iban')} placeholder="optional" />
      </Section>
      <Section title="Mietverhältnis">
        <DateField label="Einzug" value={f.moveIn} onChange={set('moveIn')} error={err.moveIn} />
        <DateField label="Auszug (leer lassen, wenn aktiv)" value={f.moveOut} onChange={set('moveOut')} error={err.moveOut} optional />
        <Field label="Kaution" value={f.deposit} onChangeText={set('deposit')} keyboard="numeric" suffix="€" placeholder="optional" />
        <DateField label="Offene Posten zählen ab Monat" value={f.trackFrom} onChange={set('trackFrom')} mode="month" error={err.trackFrom} />
      </Section>
      <Note>Frühere Monate gelten nicht als Rückstand. Das ist sinnvoll, wenn der Mieter schon länger wohnt und ältere Mieten außerhalb der App erledigt sind.</Note>
      <Gap h={14} />
      <Disclosure title="Persönliches" filled={filled(x.salutation, x.mobile, x.postalAddress, x.emergencyContact)} hint="Anrede, Mobil, Postanschrift, Notfallkontakt">
        <ChipField label="Anrede" value={x.salutation} options={['Herr', 'Frau', 'Familie', 'Firma']} onChange={setx('salutation')} />
        <Field label="Mobil" value={x.mobile} onChangeText={setx('mobile')} keyboard="phone-pad" />
        <Field label="Abweichende Postanschrift" value={x.postalAddress} onChangeText={setx('postalAddress')} multiline placeholder="falls Post nicht an die Wohnung geht" />
        <Field label="Notfallkontakt" value={x.emergencyContact} onChangeText={setx('emergencyContact')} placeholder="Name und Telefon" />
      </Disclosure>
      <Disclosure title="Mietvertrag" filled={filled(x.contractEnd, x.noticeMonths, x.rentAdjust, x.nextAdjust, x.depositType, x.depositAccount)} hint="Befristung, Kündigungsfrist, Mietanpassung, Kaution">
        <DateField label="Befristet bis" value={x.contractEnd} onChange={setx('contractEnd')} optional />
        <ChipField label="Kündigungsfrist (Monate)" value={x.noticeMonths} options={['3', '6', '9', '12']} onChange={setx('noticeMonths')} />
        <ChipField label="Mietanpassung" value={x.rentAdjust} options={['Keine', 'Staffelmiete', 'Indexmiete']} onChange={setx('rentAdjust')} />
        <DateField label="Nächste Anpassung am" value={x.nextAdjust} onChange={setx('nextAdjust')} optional />
        <ChipField label="Kautionsart" value={x.depositType} options={['Barkaution', 'Kautionskonto', 'Bürgschaft']} onChange={setx('depositType')} />
        <Field label="Kautionskonto / Bürgschaft" value={x.depositAccount} onChangeText={setx('depositAccount')} placeholder="z. B. IBAN oder Bürgschaftsnummer" />
      </Disclosure>
      <Disclosure title="Notizen" filled={filled(x.notes)}>
        <Field label="Notizen" value={x.notes} onChangeText={setx('notes')} multiline placeholder="z. B. Absprachen, Besonderheiten" />
      </Disclosure>
      <Footer kind="tenants" id={old?.id} nav={navigation} onSave={submit} deleteText="Alle Zahlungen, Mahnungen und Dokumente dieses Mieters werden ebenfalls gelöscht." />
    </Screen>
  );
}

export function PaymentForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const old = useItem<Payment>('payments', route.params?.id);
  const pre = route.params ?? {};
  const [f, setF] = useState(() => {
    if (old) return { tenantId: old.tenantId, date: old.date, month: old.month, amount: String(old.amount), kind: old.kind as Payment['kind'], note: old.note };
    const t = db.tenants.find((x) => x.id === pre.tenantId);
    const sug = t ? suggestPayment(db, t) : null;
    return { tenantId: pre.tenantId ?? '', date: today(), month: pre.month ?? sug?.month ?? today().slice(0, 7), amount: pre.amount ? String(pre.amount) : sug ? String(sug.amount) : '', kind: 'miete' as Payment['kind'], note: '' };
  });
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const pickTenant = (id: string) => {
    const t = db.tenants.find((x) => x.id === id);
    const sug = t ? suggestPayment(db, t) : null;
    setF({ ...f, tenantId: id, ...(sug && !old ? { month: sug.month, amount: String(sug.amount) } : {}) });
  };
  const tenants = db.tenants.filter((t) => !t.moveOut || t.moveOut >= today() || t.id === f.tenantId);
  const submit = () => {
    const e: Errors = {};
    if (!f.tenantId) e.tenantId = 'Bitte einen Mieter auswählen.';
    if (num(f.amount) <= 0) e.amount = 'Bitte einen Betrag größer als 0 eingeben.';
    if (!isDate(f.date)) e.date = 'Bitte ein gültiges Datum wählen.';
    if (f.kind === 'miete' && !isMonth(f.month)) e.month = 'Bitte den Monat wählen, für den gezahlt wurde.';
    setErr(e);
    if (Object.keys(e).length) return false;
    save('payments', { id: old?.id ?? uid(), tenantId: f.tenantId, date: f.date, month: f.kind === 'miete' ? f.month : f.date.slice(0, 7), amount: num(f.amount), kind: f.kind, note: f.note });
    return true;
  };
  return (
    <Screen>
      <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ label: 'Miete', value: 'miete' }, { label: 'Kaution', value: 'kaution' }, { label: 'Nachzahlung', value: 'nachzahlung' }]} />
      <Section title="Mieter" footer={err.tenantId}>
        {tenants.length === 0 && <Note>Lege zuerst einen Mieter an.</Note>}
        {tenants.map((t) => <OptionRow key={t.id} selected={f.tenantId === t.id} onPress={() => pickTenant(t.id)} title={t.name} subtitle={db.units.find((u) => u.id === t.unitId)?.name} />)}
      </Section>
      <Section title="Zahlung" footer={f.kind === 'miete' && f.tenantId ? 'Betrag und Monat sind mit dem ältesten offenen Posten vorbelegt.' : undefined}>
        <Field label="Betrag" value={f.amount} onChangeText={set('amount')} keyboard="numeric" suffix="€" error={err.amount} />
        <DateField label="Zahlungsdatum" value={f.date} onChange={set('date')} error={err.date} />
        {f.kind === 'miete' && <DateField label="Miete für Monat" value={f.month} onChange={set('month')} mode="month" error={err.month} />}
        <Field label="Notiz" value={f.note} onChangeText={set('note')} placeholder="optional" />
      </Section>
      <Footer kind="payments" id={old?.id} nav={navigation} onSave={submit} label={f.amount && num(f.amount) > 0 ? `${eur(num(f.amount))} buchen` : 'Buchen'} />
    </Screen>
  );
}

export function CostForm({ route, navigation }: any) {
  const { save } = useStore();
  const old = useItem<Cost>('costs', route.params?.id);
  const [f, setF] = useState({ category: old?.category ?? '', amount: old ? String(old.amount) : '', year: String(old?.year ?? new Date().getFullYear() - 1), key: (old?.key ?? 'area') as Cost['key'] });
  const [mtype, setMtype] = useState<MeterType>(old?.meterType ?? 'wasser_kalt');
  const [cshare, setCshare] = useState<number>(old?.consumptionShare ?? 100);
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = () => {
    const e: Errors = {};
    if (!f.category.trim()) e.category = 'Bitte eine Kostenart eingeben, z. B. „Müllabfuhr“.';
    if (num(f.amount) <= 0) e.amount = 'Bitte den Gesamtbetrag eingeben.';
    if (!/^\d{4}$/.test(f.year)) e.year = 'Bitte ein Jahr wie 2025 eingeben.';
    setErr(e);
    if (Object.keys(e).length) return false;
    save('costs', { id: old?.id ?? uid(), propertyId: old?.propertyId ?? route.params.propertyId, year: Number(f.year), category: f.category.trim(), amount: num(f.amount), key: f.key, meterType: f.key === 'consumption' ? mtype : undefined, consumptionShare: f.key === 'consumption' && cshare < 100 ? cshare : undefined });
    return true;
  };
  return (
    <Screen>
      <Section title="Kostenposition">
        <Field label="Kostenart" value={f.category} onChangeText={set('category')} placeholder="z. B. Müllabfuhr, Wasser, Grundsteuer" error={err.category} />
        <Field label="Gesamtbetrag für das ganze Haus" value={f.amount} onChangeText={set('amount')} keyboard="numeric" suffix="€" error={err.amount} />
        <Field label="Abrechnungsjahr" value={f.year} onChangeText={set('year')} keyboard="numeric" error={err.year} />
      </Section>
      <Section title="Verteilung auf die Mieter">
        <OptionRow selected={f.key === 'area'} onPress={() => setF({ ...f, key: 'area' })} title="Nach Wohnfläche" subtitle="Anteil = Wohnfläche der Wohnung ÷ Gesamtfläche" />
        <OptionRow selected={f.key === 'units'} onPress={() => setF({ ...f, key: 'units' })} title="Je Wohneinheit" subtitle="Alle Wohnungen zahlen den gleichen Anteil" />
        <OptionRow selected={f.key === 'consumption'} onPress={() => setF({ ...f, key: 'consumption' })} title="Nach Verbrauch" subtitle="Anteil nach Zählerständen (z. B. Wasser, Heizung)" />
      </Section>
      {f.key === 'consumption' && (
        <Section title="Welcher Zähler?" footer="Dafür müssen Zähler und Stände im Objekt erfasst sein.">
          {METER_TYPES.map((t) => <OptionRow key={t} selected={mtype === t} onPress={() => { setMtype(t); if ((t === 'heizung' || t === 'wasser_warm') && cshare === 100) setCshare(70); }} title={meterTypeLabel(t)} />)}
        </Section>
      )}
      {f.key === 'consumption' && (
        <Section title="Anteil nach Verbrauch" footer={mtype === 'heizung' || mtype === 'wasser_warm' ? 'Die Heizkostenverordnung verlangt 50–70 % nach Verbrauch, der Rest (Grundkosten) wird nach Wohnfläche verteilt.' : 'Der Rest (Grundkosten) wird nach Wohnfläche verteilt. Bei Wasser meist 100 % nach Verbrauch.'}>
          <View style={{ padding: 12 }}>
            <Segmented value={cshare} onChange={setCshare} options={[{ label: '100 %', value: 100 }, { label: '70 %', value: 70 }, { label: '60 %', value: 60 }, { label: '50 %', value: 50 }]} />
          </View>
        </Section>
      )}
      <Footer kind="costs" id={old?.id} nav={navigation} onSave={submit} />
    </Screen>
  );
}
