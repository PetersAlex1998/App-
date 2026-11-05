import { paidDeposit } from '../deposit';
import React, { useState } from 'react';

import { useStore, uid } from '../store';
import { useDelete } from '../undo';
import { Button, ChipField, DateField, Disclosure, Field, Gap, Note, OptionRow, Row, Screen, Section, Segmented, confirm, infoRows } from '../ui';
import { sourceLong, sourceOf, stamp } from '../payments';
import { defaultUnitName, houseId, nextHouseNo, nextUnitNo, unitLetter, unitPrefix, unitRef } from '../ids';
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
  const del = useDelete();
  return (
    <>
      <Button title={label} icon="checkmark" onPress={() => onSave() && nav.goBack()} />
      {id ? (
        <>
          <Gap h={22} />
          <Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => { del(kind, id); nav.goBack(); }} />
        </>
      ) : null}
    </>
  );
}

const addYears = (iso: string, y: number) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(0, 4)) + y}${iso.slice(4)}` : '');
const filled = (...v: (string | undefined)[]) => v.some((x) => x && x.trim());

export function PropertyForm({ route, navigation }: any) {
  const { db, save } = useStore();
  const old = useItem<Property>('properties', route.params?.id);
  const [f, setF] = useState<Property>(old ?? { id: uid(), name: '', street: '', zip: '', city: '', yearBuilt: '', notes: '' });
  const [houseNo, setHouseNo] = useState(String(old?.houseNo ?? nextHouseNo(db)));
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof Property) => (v: string) => setF({ ...f, [k]: v });
  const setIssued = (v: string) => setF({ ...f, eaIssued: v, eaValidUntil: !f.eaValidUntil || f.eaValidUntil === addYears(f.eaIssued ?? '', 10) ? addYears(v, 10) : f.eaValidUntil });
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Bitte eine Bezeichnung eingeben, z. B. „Haus Lindenstraße“.';
    const hn = Math.round(num(houseNo));
    if (!(hn >= 1 && hn <= 999)) e.houseNo = 'Bitte eine Nummer von 1 bis 999 eingeben.';
    else if (db.properties.some((p) => p.id !== f.id && p.houseNo === hn)) e.houseNo = `Die Haus-ID ${houseId({ houseNo: hn })} gibt es schon bei „${db.properties.find((p) => p.id !== f.id && p.houseNo === hn)?.name}“.`;
    setErr(e);
    if (Object.keys(e).length) return false;
    save('properties', { ...f, houseNo: hn });
    return true;
  };
  return (
    <Screen>
      <Section title="Objekt">
        <Field label="Bezeichnung" value={f.name} onChangeText={set('name')} placeholder="z. B. Haus Lindenstraße" error={err.name} />
        <Field label="Baujahr" value={f.yearBuilt} onChangeText={set('yearBuilt')} keyboard="numeric" placeholder="optional" />
      </Section>
      <Section title="Haus-ID" footer="Eindeutige Kennung des Hauses. Sie ist der Anfang der Wohnungs-IDs, die Mieter bei jeder Zahlung als Verwendungszweck angeben.">
        <Field label="Haus-Nr." value={houseNo} onChangeText={setHouseNo} keyboard="numeric" error={err.houseNo} hint={`Haus-ID: ${houseId({ houseNo: Math.round(num(houseNo)) || undefined }) || '–'}`} />
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
  const { db, save } = useStore();
  const old = useItem<Unit>('units', route.params?.id);
  const propertyId: string = old?.propertyId ?? route.params.propertyId;
  const prop = db.properties.find((p) => p.id === propertyId);
  const startNo = old?.no ?? nextUnitNo(db, propertyId, old?.kind ?? 'wohnung');
  const [no, setNo] = useState(String(startNo));
  const [nameTouched, setNameTouched] = useState(!!old);
  const [f, setF] = useState({ name: old?.name ?? defaultUnitName('wohnung', startNo), area: old ? String(old.area) : '', rooms: old ? String(old.rooms) : '', coldRent: old ? String(old.coldRent) : '', advance: old ? String(old.advance) : '' });
  const [kind, setKind] = useState<UnitKind>(old?.kind ?? 'wohnung');
  const [vat, setVat] = useState<number>(old?.vat ?? 0);
  const [x, setX] = useState({ floor: old?.floor ?? '', position: old?.position ?? '', balcony: old?.balcony ?? '', cellar: old?.cellar ?? '', parking: old?.parking ?? '', kitchen: old?.kitchen ?? '', equipment: old?.equipment ?? '', notes: old?.notes ?? '' });
  const setx = (k: keyof typeof x) => (v: string) => setX({ ...x, [k]: v });
  const [err, setErr] = useState<Errors>({});
  const set = (k: keyof typeof f) => (v: string) => { if (k === 'name') setNameTouched(true); setF({ ...f, [k]: v }); };
  // Neue Einheit: Nummer und Name folgen der Art (Wohnung 4 / Gewerbe 2), solange der Name nicht von Hand geändert wurde
  const changeKind = (k: UnitKind) => {
    setKind(k);
    if (old) return;
    const n = nextUnitNo(db, propertyId, k);
    setNo(String(n));
    if (!nameTouched) setF((cur) => ({ ...cur, name: defaultUnitName(k, n) }));
  };
  const changeNo = (v: string) => {
    setNo(v);
    const n = Math.round(num(v));
    if (!old && !nameTouched && n >= 1) setF((cur) => ({ ...cur, name: defaultUnitName(kind, n) }));
  };
  const net = num(f.coldRent) + num(f.advance);
  const total = net * (1 + (kind === 'gewerbe' ? vat : 0) / 100);
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Bitte eine Bezeichnung eingeben, z. B. „WE 2, 1. OG links“.';
    if (num(f.area) <= 0) e.area = 'Die Wohnfläche wird für die Nebenkostenabrechnung gebraucht.';
    if (num(f.coldRent) <= 0) e.coldRent = 'Bitte die Kaltmiete eingeben.';
    const n = Math.round(num(no));
    if (!(n >= 1 && n <= 999)) e.no = 'Bitte eine Nummer von 1 bis 999 eingeben.';
    else {
      const clash = db.units.find((u) => u.id !== old?.id && u.propertyId === propertyId && unitLetter(u.kind) === unitLetter(kind) && u.no === n);
      if (clash) e.no = `Die ID ${unitRef(prop, { kind, no: n })} ist schon vergeben (${clash.name}).`;
    }
    setErr(e);
    if (Object.keys(e).length) return false;
    save('units', { ...x, id: old?.id ?? uid(), no: n, kind, vat: kind === 'gewerbe' ? vat : 0, propertyId, name: f.name.trim(), area: num(f.area), rooms: num(f.rooms), coldRent: num(f.coldRent), advance: num(f.advance) });
    return true;
  };
  return (
    <Screen>
      <Segmented value={kind} onChange={changeKind} options={[{ label: 'Wohnung', value: 'wohnung' }, { label: 'Gewerbe', value: 'gewerbe' }, { label: 'Eigentum', value: 'eigentum' }]} />
      <Section title="Einheit" footer={kind === 'gewerbe' ? 'Gewerbe: andere Regeln als bei Wohnraum. Bei Umsatzsteuer-Option wird die USt auf Miete und Nebenkosten aufgeschlagen.' : kind === 'eigentum' ? 'Eigentumswohnung: Hausgeld und WEG-Abrechnung erfasst du später als Kosten.' : undefined}>
        <Field label="Bezeichnung" value={f.name} onChangeText={set('name')} placeholder={kind === 'gewerbe' ? 'z. B. Gewerbe 1' : 'z. B. Wohnung 1'} error={err.name} />
        <Field label="Nummer im Haus" value={no} onChangeText={changeNo} keyboard="numeric" error={err.no} />
        <Field label="Wohnfläche" value={f.area} onChangeText={set('area')} keyboard="numeric" suffix="m²" error={err.area} />
        <Field label="Zimmer" value={f.rooms} onChangeText={set('rooms')} keyboard="numeric" />
      </Section>
      <Section title="Kennung" footer="Eindeutig in allen deinen Häusern. Mieter geben sie bei jeder Zahlung als Verwendungszweck an, so kann die App den Eingang sicher zuordnen.">
        <Row left="Wohnungs-ID" right={unitRef(prop, { kind, no: Math.round(num(no)) || undefined }) || '–'} bold />
      </Section>
      {kind === 'gewerbe' && (
        <Segmented value={vat} onChange={setVat} options={[{ label: 'Ohne USt', value: 0 }, { label: '7 % USt', value: 7 }, { label: '19 % USt', value: 19 }]} />
      )}
      <Section title="Miete (netto)" footer={total > 0 ? `Gesamt pro Monat${kind === 'gewerbe' && vat ? ` inkl. ${vat} % USt` : ''}: ${eur(total)}` : undefined}>
        {(old?.terms?.length ?? 0) > 0 ? <Note>Diese Wohnung hat einen Mietverlauf. Die Werte hier gelten vor dem ersten Eintrag. Neue Erhöhungen trägst du über „Miete erhöhen“ ein.</Note> : null}
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
  const [f, setF] = useState({ name: old?.name ?? '', email: old?.email ?? '', phone: old?.phone ?? '', moveIn: old?.moveIn ?? today(), moveOut: old?.moveOut ?? '', coldRent: old?.coldRent ? String(old.coldRent).replace('.', ',') : '', iban: old?.iban ?? '', trackFrom: old ? old.trackFrom ?? '' : defaultTrackFrom(), deposit: old ? String(old.deposit || '') : '', unitId: old?.unitId ?? route.params?.unitId ?? '' });
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
    save('tenants', { ...old, ...x, id: old?.id ?? uid(), unitId: f.unitId, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), iban: f.iban.replace(/\s/g, '').toUpperCase(), moveIn: f.moveIn, moveOut: f.moveOut, deposit: num(f.deposit), trackFrom: f.trackFrom || undefined, coldRent: f.moveOut && num(f.coldRent) > 0 ? num(f.coldRent) : undefined });
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
        {f.moveOut ? <Field label="Kaltmiete während der Mietzeit (für die Historie)" value={f.coldRent} onChangeText={set('coldRent')} keyboard="numeric" suffix="€" placeholder="optional" /> : null}
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
  const { db, save, replaceAll } = useStore();
  const old = useItem<Payment>('payments', route.params?.id);
  const pre = route.params ?? {};
  const [f, setF] = useState(() => {
    if (old) return { tenantId: old.tenantId, date: old.date, month: old.month, amount: String(old.amount), kind: old.kind as Payment['kind'], note: old.note };
    const t = db.tenants.find((x) => x.id === pre.tenantId);
    const sug = t ? suggestPayment(db, t) : null;
    return { tenantId: pre.tenantId ?? '', date: today(), month: pre.month ?? sug?.month ?? today().slice(0, 7), amount: pre.amount ? String(pre.amount) : pre.kind === 'kaution' && t ? String(Math.max(0, Math.round(((t.deposit || 0) - paidDeposit(db, t)) * 100) / 100) || '') : sug ? String(sug.amount) : '', kind: (pre.kind === 'kaution' ? 'kaution' : 'miete') as Payment['kind'], note: '' };
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
    const next = { tenantId: f.tenantId, date: f.date, month: f.kind === 'miete' ? f.month : f.date.slice(0, 7), amount: num(f.amount), kind: f.kind, note: f.note };
    if (old) {
      // Herkunft bleibt erhalten; eine Änderung wird mit Zeitpunkt vermerkt
      const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => old[k] !== next[k]);
      save('payments', { ...old, ...next, ...(changed ? { editedAt: new Date().toISOString() } : {}) });
    } else {
      save('payments', { id: uid(), ...next, source: 'manuell', createdAt: new Date().toISOString() });
    }
    return true;
  };
  return (
    <Screen>
      <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ label: 'Miete', value: 'miete' }, { label: 'Kaution', value: 'kaution' }, { label: 'Nachzahlung', value: 'nachzahlung' }]} />
      <Section title="Mieter" footer={err.tenantId}>
        {tenants.length === 0 && <Note>Lege zuerst einen Mieter an.</Note>}
        {tenants.map((t) => <OptionRow key={t.id} selected={f.tenantId === t.id} onPress={() => pickTenant(t.id)} title={t.name} subtitle={db.units.find((u) => u.id === t.unitId)?.name} />)}
      </Section>
      <Section title="Zahlung" footer={!old && f.kind === 'miete' && f.tenantId ? 'Betrag und Monat sind mit dem ältesten offenen Posten vorbelegt.' : undefined}>
        <Field label="Betrag" value={f.amount} onChangeText={set('amount')} keyboard="numeric" suffix="€" error={err.amount} />
        <DateField label="Zahlungsdatum" value={f.date} onChange={set('date')} error={err.date} />
        {f.kind === 'miete' && <DateField label="Miete für Monat" value={f.month} onChange={set('month')} mode="month" error={err.month} />}
        <Field label="Notiz" value={f.note} onChangeText={set('note')} placeholder="optional" />
      </Section>
      {old && (
        <Section title="Herkunft" footer={sourceOf(old) === 'manuell' ? 'Diese Zahlung wurde von Hand erfasst.' : 'Diese Zahlung stammt aus einem eingelesenen Kontoauszug. Du kannst sie korrigieren; die Herkunft bleibt dokumentiert.'}>
          {infoRows([
            ['Quelle', sourceLong(old)],
            ['Erfasst am', stamp(old.createdAt) || (old.createdAt ? '' : 'vor der Herkunftsangabe')],
            ['Zuletzt geändert', stamp(old.editedAt)],
            ['Absender (Konto)', old.payer],
            ['Import', old.importLabel],
          ])}
        </Section>
      )}
      <Footer kind="payments" id={old?.id} nav={navigation} onSave={submit} label={old ? 'Änderungen speichern' : f.amount && num(f.amount) > 0 ? `${eur(num(f.amount))} buchen` : 'Buchen'} />
      {old?.importId && (() => {
        const batch = db.payments.filter((p) => p.importId === old.importId);
        return (
          <>
            <Gap h={12} />
            <Button kind="plain" icon="arrow-undo-outline" title={`Gesamten Import rückgängig machen (${batch.length})`}
              onPress={() => confirm('Import rückgängig machen?', () => { replaceAll({ ...db, payments: db.payments.filter((p) => p.importId !== old.importId) }); navigation.goBack(); }, 'Rückgängig', `Alle ${batch.length} Zahlungen aus „${old.importLabel ?? 'diesem Import'}“ werden gelöscht. Manuell erfasste Zahlungen bleiben.`)} />
          </>
        );
      })()}
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

/** Mehrere Einheiten auf einmal anlegen: Wohnung 1 bis Wohnung 20 usw. */
export function UnitSeries({ route, navigation }: any) {
  const { db, save } = useStore();
  const propertyId: string = route.params.propertyId;
  const prop = db.properties.find((p) => p.id === propertyId);
  const [kind, setKind] = useState<UnitKind>('wohnung');
  const [count, setCount] = useState('10');
  const [start, setStart] = useState(String(nextUnitNo(db, propertyId, 'wohnung')));
  const [d, setD] = useState({ area: '', rooms: '', coldRent: '', advance: '' });
  const [err, setErr] = useState<Errors>({});
  const n = Math.round(num(count));
  const from = Math.round(num(start));
  const last = from + n - 1;
  const changeKind = (k: UnitKind) => { setKind(k); setStart(String(nextUnitNo(db, propertyId, k))); };
  const clash = (() => {
    for (let i = from; i <= last && n > 0; i++) if (db.units.some((u) => u.propertyId === propertyId && unitLetter(u.kind) === unitLetter(kind) && u.no === i)) return i;
    return 0;
  })();
  const submit = () => {
    const e: Errors = {};
    if (!(n >= 1 && n <= 200)) e.count = 'Bitte eine Anzahl von 1 bis 200 eingeben.';
    if (!(from >= 1 && last <= 999)) e.start = 'Die Nummern müssen zwischen 1 und 999 liegen.';
    else if (clash) e.start = `Die Nummer ${clash} ist in diesem Haus schon vergeben (${unitRef(prop, { kind, no: clash })}).`;
    setErr(e);
    if (Object.keys(e).length) return false;
    for (let i = from; i <= last; i++) {
      save('units', { id: uid(), propertyId, kind, vat: 0, no: i, name: defaultUnitName(kind, i), area: num(d.area), rooms: num(d.rooms), coldRent: num(d.coldRent), advance: num(d.advance) });
    }
    return true;
  };
  const preview = n >= 1 && from >= 1 ? `${defaultUnitName(kind, from)}${n > 1 ? ` bis ${defaultUnitName(kind, last)}` : ''} · IDs ${unitRef(prop, { kind, no: from })}${n > 1 ? ` … ${unitRef(prop, { kind, no: last })}` : ''}` : undefined;
  return (
    <Screen>
      <Segmented value={kind} onChange={changeKind} options={[{ label: 'Wohnungen', value: 'wohnung' }, { label: 'Gewerbe', value: 'gewerbe' }]} />
      <Section title={`Anlegen in ${prop?.name ?? ''}`} footer={preview}>
        <Field label="Anzahl" value={count} onChangeText={setCount} keyboard="numeric" error={err.count} />
        <Field label="Beginnt bei Nummer" value={start} onChangeText={setStart} keyboard="numeric" error={err.start} />
      </Section>
      <Section title="Gleiche Werte für alle (optional)" footer="Fläche, Miete und Nebenkosten kannst du später pro Einheit ändern. Ohne Fläche ist keine Abrechnung nach Wohnfläche möglich.">
        <Field label={`${unitPrefix(kind)}sfläche`.replace('Wohnungsfläche', 'Wohnfläche').replace('Gewerbesfläche', 'Nutzfläche')} value={d.area} onChangeText={(v) => setD({ ...d, area: v })} keyboard="numeric" suffix="m²" />
        <Field label="Zimmer" value={d.rooms} onChangeText={(v) => setD({ ...d, rooms: v })} keyboard="numeric" />
        <Field label="Kaltmiete pro Monat" value={d.coldRent} onChangeText={(v) => setD({ ...d, coldRent: v })} keyboard="numeric" suffix="€" />
        <Field label="Nebenkosten-Vorauszahlung pro Monat" value={d.advance} onChangeText={(v) => setD({ ...d, advance: v })} keyboard="numeric" suffix="€" />
      </Section>
      <Button icon="checkmark" title={n >= 1 ? `${n} ${n === 1 ? 'Einheit' : 'Einheiten'} anlegen` : 'Anlegen'} onPress={() => submit() && navigation.goBack()} />
    </Screen>
  );
}
