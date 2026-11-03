import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, uid } from '../store';
import { Badge, Button, ChipField, DateField, EmptyState, Field, Gap, ListRow, Note, Screen, Section, confirm, notify, useColors } from '../ui';
import { CATEGORIES_FOR, CATEGORY_ICON, CATEGORY_LABEL, HAS_EXPIRY, expiryState } from '../docs';
import { deleteBlob, filesSupported, fmtSize, getBlob, pickFiles, putBlob, shrinkImage } from '../files';
import { dateDE, today } from '../calc';
import { type } from '../theme';
import { Doc, DocCategory, DocOwner } from '../types';

/** Object-URL für eine gespeicherte Datei (wird beim Verlassen freigegeben). */
export function useBlobUrl(id: string): { url: string | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false });
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    if (!filesSupported()) { setState({ url: null, missing: true }); return; }
    getBlob(id).then((b) => {
      if (!alive) return;
      if (!b) return setState({ url: null, missing: true });
      revoke = URL.createObjectURL(b);
      setState({ url: revoke, missing: false });
    }).catch(() => alive && setState({ url: null, missing: true }));
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [id]);
  return state;
}

function Thumb({ doc, onPress }: { doc: Doc; onPress: () => void }) {
  const c = useColors();
  const { url } = useBlobUrl(doc.id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Foto ${doc.name}`} onPress={onPress} style={{ width: '31.5%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: c.fill }}>
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="image" size={26} color={c.muted} /></View>}
    </Pressable>
  );
}

/** Kleines quadratisches Titelbild (Listen). Ohne Bild: Haus-Symbol. */
export function CoverThumb({ docId, size = 40 }: { docId?: string; size?: number }) {
  const c = useColors();
  const { url } = useBlobUrl(docId ?? '');
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden', backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
      {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Ionicons name="business" size={size * 0.55} color={c.text} />}
    </View>
  );
}

/** Großes Titelbild unter dem Namen des Objekts. */
export function CoverHero({ doc, onPress, onChange }: { doc: Doc; onPress: () => void; onChange: () => void }) {
  const c = useColors();
  const { url, missing } = useBlobUrl(doc.id);
  if (missing) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Titelbild des Objekts" onPress={onPress} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 18, overflow: 'hidden', backgroundColor: c.fill }}>
        {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onChange} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 32, justifyContent: 'center' }}>
        <Text style={{ color: c.primary, fontSize: type.subhead, fontWeight: '600' }}>Bild ändern</Text>
      </Pressable>
    </View>
  );
}

/** Platzhalter, solange noch kein Titelbild gesetzt ist. */
export function CoverEmpty({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Bild des Objekts hinzufügen" onPress={onPress}
      style={{ width: '100%', minHeight: 88, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, backgroundColor: c.card, marginBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
      <Ionicons name="camera-outline" size={26} color={c.primary} />
      <Text style={{ color: c.primary, fontSize: type.body, fontWeight: '600' }}>Bild des Objekts hinzufügen</Text>
    </Pressable>
  );
}

/** Bereich „Dokumente und Fotos“ für Objekt, Wohnung oder Mieter. */
export function DocumentsSection({ ownerKind, ownerId, navigation }: { ownerKind: DocOwner; ownerId: string; navigation: any }) {
  const { db } = useStore();
  const docs = db.documents.filter((d) => d.ownerKind === ownerKind && d.ownerId === ownerId).sort((a, b) => b.added.localeCompare(a.added));
  const photos = docs.filter((d) => d.category === 'foto' && d.mime.startsWith('image/'));
  const files = docs.filter((d) => !photos.includes(d));
  const add = () => navigation.navigate('DocumentForm', { ownerKind, ownerId });
  const open = (d: Doc) => navigation.navigate('DocumentViewer', { id: d.id });
  return (
    <>
      <Section title="Dokumente und Fotos" action={filesSupported() ? { label: '+ Hinzufügen', onPress: add } : undefined}
        footer={!filesSupported() ? 'Dokumente und Fotos sind in der Web-App verfügbar.' : docs.length ? undefined : 'Energieausweis, Verträge, Rechnungen oder Fotos als Datei oder direkt mit der Kamera.'}>
        {docs.length === 0 && <Note>Noch nichts abgelegt.</Note>}
        {files.map((d) => {
          const ex = expiryState(d.validUntil);
          return (
            <ListRow key={d.id} icon={CATEGORY_ICON[d.category]} title={d.name} subtitle={`${CATEGORY_LABEL[d.category]} · ${dateDE(d.added)} · ${fmtSize(d.size)}${d.validUntil ? ` · gültig bis ${dateDE(d.validUntil)}` : ''}`}
              badge={ex && ex.tone !== 'ok' ? { text: ex.text, tone: ex.tone } : undefined} onPress={() => open(d)} />
          );
        })}
      </Section>
      {photos.length > 0 && (
        <View style={{ marginTop: -10, marginBottom: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
          {photos.map((d) => <Thumb key={d.id} doc={d} onPress={() => open(d)} />)}
        </View>
      )}
    </>
  );
}

/** Neue Dateien hinzufügen oder Metadaten eines Dokuments bearbeiten. */
export function DocumentForm({ route, navigation }: any) {
  const { db, save, remove } = useStore();
  const old = db.documents.find((d) => d.id === route.params?.id);
  const ownerKind: DocOwner = old?.ownerKind ?? route.params.ownerKind;
  const ownerId: string = old?.ownerId ?? route.params.ownerId;
  const cover = !old && route.params?.cover === '1' && ownerKind === 'property';
  const cats = CATEGORIES_FOR[ownerKind];
  const [category, setCategory] = useState<DocCategory>(old?.category ?? (route.params?.cover === '1' ? 'foto' : ownerKind === 'property' ? 'energieausweis' : ownerKind === 'tenant' ? 'mietvertrag' : 'foto'));
  const [name, setName] = useState(old?.name ?? '');
  const [validUntil, setValidUntil] = useState(old?.validUntil ?? '');
  const [note, setNote] = useState(old?.note ?? '');
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const choose = async (camera: boolean) => {
    const f = await pickFiles({ camera, multiple: !camera });
    const list = cover ? f.filter((x) => x.type.startsWith('image/')).slice(0, 1) : f;
    if (cover && f.length && list.length === 0) return setErr('Bitte ein Bild auswählen (JPG oder PNG).');
    if (list.length) { setPicked(list); setErr(''); if (list.length === 1 && !name) setName(cover ? 'Titelbild' : list[0].name.replace(/\.[^.]+$/, '')); }
  };
  const submit = async () => {
    if (old) {
      save('documents', { ...old, category, name: name.trim() || old.name, validUntil: validUntil || undefined, note: note.trim() || undefined });
      return navigation.goBack();
    }
    if (picked.length === 0) return setErr('Bitte zuerst eine Datei oder ein Foto auswählen.');
    setBusy(true);
    try {
      for (const f of picked) {
        const blob = await shrinkImage(f);
        const id = uid();
        await putBlob(id, blob);
        const single = picked.length === 1;
        if (cover && picked.indexOf(f) === 0) { const pr = db.properties.find((x) => x.id === ownerId); if (pr) save('properties', { ...pr, coverId: id }); }
        save('documents', { id, ownerKind, ownerId, category, name: (single && name.trim()) || f.name.replace(/\.[^.]+$/, ''), mime: blob.type || f.type || 'application/octet-stream', size: blob.size, added: today(), validUntil: HAS_EXPIRY.includes(category) && validUntil ? validUntil : undefined, note: note.trim() || undefined });
      }
      navigation.goBack();
    } catch (e: any) {
      setBusy(false);
      setErr(`Speichern fehlgeschlagen: ${e?.message ?? e}. Möglicherweise ist der Speicher voll.`);
    }
  };

  return (
    <Screen>
      {!old && (
        <Section title="Datei" footer={picked.length ? `${picked.length} Datei${picked.length === 1 ? '' : 'en'} ausgewählt: ${picked.map((f) => f.name).slice(0, 3).join(', ')}${picked.length > 3 ? ' …' : ''}` : 'Fotos werden automatisch verkleinert, damit viele Bilder Platz haben. PDFs bleiben unverändert.'}>
          <ListRow icon="camera" title="Foto aufnehmen" subtitle="Öffnet die Kamera" onPress={() => choose(true)} />
          <ListRow icon="folder-open" title="Foto oder Datei auswählen" subtitle="Bild oder PDF, auch mehrere" onPress={() => choose(false)} />
        </Section>
      )}
      {!cover && <Section title="Art">
        <ChipField label="Kategorie" value={CATEGORY_LABEL[category]} options={cats.map((k) => CATEGORY_LABEL[k])} onChange={(v) => v && setCategory(cats.find((k) => CATEGORY_LABEL[k] === v)!)} />
      </Section>}
      <Section title="Angaben">
        {(old || picked.length <= 1) && <Field label="Bezeichnung" value={name} onChangeText={setName} placeholder="z. B. Energieausweis 2024" />}
        {HAS_EXPIRY.includes(category) && <DateField label={category === 'energieausweis' ? 'Gültig bis (10 Jahre ab Ausstellung)' : 'Gültig bis'} value={validUntil} onChange={setValidUntil} optional />}
        <Field label="Notiz" value={note} onChangeText={setNote} placeholder="optional" />
      </Section>
      {err ? <View style={{ marginBottom: 12 }}><Badge text={err} tone="danger" /></View> : null}
      <Button icon="checkmark" title={busy ? 'Wird gespeichert …' : old ? 'Speichern' : cover ? 'Als Titelbild speichern' : picked.length > 1 ? `${picked.length} Dateien speichern` : 'Speichern'} onPress={submit} disabled={busy} />
      {old && (<><Gap h={22} /><Button kind="destructive" icon="trash-outline" title="Löschen" onPress={() => confirm('Dokument löschen?', () => { remove('documents', old.id); deleteBlob(old.id).catch(() => {}); navigation.goBack(); if (navigation.canGoBack()) navigation.goBack(); }, 'Löschen', 'Die Datei wird dauerhaft entfernt.')} /></>)}
    </Screen>
  );
}

/** Betrachter für Bilder und PDFs. */
export function DocumentViewer({ route, navigation }: any) {
  const { db, save } = useStore();
  const c = useColors();
  const doc = db.documents.find((d) => d.id === route.params.id);
  const { url, missing } = useBlobUrl(route.params.id);
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => (
      <Pressable accessibilityRole="button" accessibilityLabel="Bearbeiten" onPress={() => navigation.navigate('DocumentForm', { id: route.params.id })} hitSlop={10} style={{ paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.primary, fontSize: type.body, fontWeight: '600' }}>Bearbeiten</Text>
      </Pressable>) });
  });
  if (!doc) return <Screen><EmptyState icon="help-circle" title="Dokument nicht gefunden" text="Es wurde vermutlich gelöscht." /></Screen>;
  const isImage = doc.mime.startsWith('image/');
  const isPdf = doc.mime === 'application/pdf';
  const ex = expiryState(doc.validUntil);
  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    const ext = isPdf ? '.pdf' : doc.mime === 'image/png' ? '.png' : isImage ? '.jpg' : '';
    a.href = url; a.download = doc.name.endsWith(ext) ? doc.name : doc.name + ext; document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <Screen>
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.4, marginTop: 4 }}>{doc.name}</Text>
      <Text style={{ color: c.muted, fontSize: type.subhead, marginTop: 2, marginBottom: 10 }}>{CATEGORY_LABEL[doc.category]} · {dateDE(doc.added)} · {fmtSize(doc.size)}</Text>
      {ex ? <View style={{ marginBottom: 12 }}><Badge text={`${ex.text}${doc.validUntil ? ` (bis ${dateDE(doc.validUntil)})` : ''}`} tone={ex.tone} /></View> : null}
      {doc.note ? <Text style={{ color: c.text, fontSize: type.body, marginBottom: 12 }}>{doc.note}</Text> : null}
      {missing && <Note>Die Datei ist auf diesem Gerät nicht vorhanden. Spiele eine Vollsicherung mit Dokumenten ein.</Note>}
      {url && isImage && <Image source={{ uri: url }} accessibilityLabel={doc.name} style={{ width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: c.fill }} resizeMode="contain" />}
      {url && isPdf && Platform.OS === 'web' && React.createElement('iframe', { src: url, title: doc.name, style: { width: '100%', height: '65vh', border: 'none', borderRadius: 16, background: '#fff' } })}
      <Gap h={16} />
      {isImage && doc.ownerKind === 'property' && (() => {
        const pr = db.properties.find((x) => x.id === doc.ownerId);
        if (!pr) return null;
        return pr.coverId === doc.id
          ? <Badge text="Ist das Titelbild des Objekts" tone="ok" />
          : <Button icon="image-outline" title="Als Titelbild verwenden" onPress={() => { save('properties', { ...pr, coverId: doc.id }); notify('Als Titelbild gesetzt.'); }} />;
      })()}
      <Gap h={8} />
      {url && <Button icon="open-outline" title="In neuem Tab öffnen" kind="secondary" onPress={() => window.open(url, '_blank')} />}
      {url && <><Gap h={8} /><Button icon="download-outline" title="Herunterladen" kind="secondary" onPress={download} /></>}
    </Screen>
  );
}
