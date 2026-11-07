import React, { createRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { Badge, Button, DateField, Field, ListRow, Note, notify, useColors } from './ui';
import { today } from './calc';
import { PadHandle, SignaturePad } from './SignaturePad';
import { FORM_HINT, auditLines } from './signature';
import type { SigField } from './letters';
import { type } from './theme';

/**
 * Vollbild zum Unterschreiben am Handy: je Feld eine Zeichenfläche. Die eigene Unterschrift ist (falls gespeichert) vorbelegt.
 * Liefert die gezeichneten Unterschriften und den Nachweis-Text für das PDF.
 */
export function SignSheet({ visible, fields, saved, schriftform, place: place0 = '', date: date0 = '', onClose, onDone }: {
  visible: boolean; fields: SigField[]; saved?: string; schriftform?: boolean; place?: string; date?: string;
  onClose: () => void; onDone: (signatures: Record<string, string>, audit: string[], place: string, date: string) => void;
}) {
  const c = useColors();
  const pads = useRef<Record<string, React.RefObject<PadHandle | null>>>({});
  const own = (k: string) => (pads.current[k] ??= createRef<PadHandle>());
  const [useSaved, setUseSaved] = useState<Record<string, boolean>>({});
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  // Ort und Datum: Ort des Hauses, Datum heute (änderbar). Das Datum gilt für den Tag der Unterschrift.
  const [place, setPlace] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => { if (visible) { setPlace(null); setDate(null); setUseSaved({}); setFilled({}); } }, [visible]);
  const placeV = place ?? place0;
  const dateV = date ?? (date0 || today());
  const usesSaved = (f: SigField) => f.key === 'vermieter' && !!saved && useSaved[f.key] !== false;

  const sheetFields = useMemo(() => fields, [fields]);
  const done = () => {
    const sigs: Record<string, string> = {};
    const who: { label: string; name?: string }[] = [];
    for (const f of sheetFields) {
      const url = usesSaved(f) ? saved! : own(f.key).current?.toDataUrl() ?? null;
      if (url) { sigs[f.key] = url; who.push({ label: f.label, name: f.name }); }
    }
    if (who.length === 0) return notify('Bitte zuerst unterschreiben.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateV)) return notify('Bitte ein Datum wählen.');
    onDone(sigs, auditLines(who, new Date(), placeV.trim()), placeV.trim(), dateV);
  };
  const anySigned = sheetFields.some((f) => usesSaved(f) || filled[f.key]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: Platform.OS === 'web' ? 24 : 56, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.text, letterSpacing: -0.5 }}>Unterschreiben</Text>
          <Text style={{ color: c.muted, fontSize: type.body }}>Gib das Handy der unterschreibenden Person. Unterschrieben wird mit dem Finger in das Feld. Dann auf „Fertig“ tippen.</Text>
          {schriftform && <Note>{FORM_HINT}</Note>}
          <View style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.glassBorder, overflow: 'hidden' }}>
            <Field label="Ort" value={placeV} onChangeText={setPlace} placeholder="z. B. Paderborn" />
            <DateField label="Datum" value={dateV} onChange={setDate} />
          </View>
          {sheetFields.map((f) => (
            <View key={f.key} style={{ backgroundColor: c.card, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: c.glassBorder, gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: type.headline, fontWeight: '700' }}>{f.label}</Text>
                  {f.name ? <Text style={{ color: c.muted, fontSize: type.subhead }}>{f.name}</Text> : null}
                </View>
                {(usesSaved(f) || filled[f.key]) && <Badge text="Unterschrieben" tone="ok" />}
              </View>
              {usesSaved(f) ? (
                <View style={{ gap: 8 }}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: c.glassBorder, padding: 10, height: 110, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={{ uri: saved }} resizeMode="contain" style={{ width: '100%', height: 90 }} accessibilityLabel="Gespeicherte Unterschrift" />
                  </View>
                  <ListRow icon="create-outline" title="Neu zeichnen" subtitle="Statt der gespeicherten Unterschrift" onPress={() => setUseSaved({ ...useSaved, [f.key]: false })} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <SignaturePad ref={own(f.key)} label={f.label} onChange={(empty) => setFilled((p) => ({ ...p, [f.key]: !empty }))} />
                  {f.key === 'vermieter' && !!saved && <ListRow icon="bookmark-outline" title="Gespeicherte Unterschrift verwenden" onPress={() => setUseSaved({ ...useSaved, [f.key]: true })} />}
                </View>
              )}
            </View>
          ))}
          <Button icon="checkmark" title="Fertig" onPress={done} disabled={!anySigned} />
          <Button kind="plain" title="Abbrechen" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}
