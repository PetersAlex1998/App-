import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export const colors = { bg: '#f3f5f9', card: '#fff', primary: '#1d4ed8', text: '#111827', muted: '#6b7280', danger: '#dc2626', ok: '#16a34a', line: '#e5e7eb' };

export function Screen({ children }: { children: React.ReactNode }) {
  return <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export const Title = ({ children }: { children: React.ReactNode }) => <Text style={s.title}>{children}</Text>;
export const Muted = ({ children }: { children: React.ReactNode }) => <Text style={{ color: colors.muted, marginTop: 2 }}>{children}</Text>;
export const Empty = ({ text }: { text: string }) => <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 24 }}>{text}</Text>;

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && onPress ? { opacity: 0.7 } : null]}>{children}</Pressable>;
}
export function Btn({ title, onPress, kind = 'primary' }: { title: string; onPress: () => void; kind?: 'primary' | 'danger' | 'ghost' }) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : 'transparent';
  return (
    <Pressable onPress={onPress} style={[s.btn, { backgroundColor: bg, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: colors.primary }]}>
      <Text style={{ color: kind === 'ghost' ? colors.primary : '#fff', fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, value, onChangeText, keyboard, multiline, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; keyboard?: 'numeric' | 'email-address' | 'phone-pad'; multiline?: boolean; placeholder?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboard} multiline={multiline} placeholder={placeholder} style={[s.input, multiline && { minHeight: 70 }]} />
    </View>
  );
}
export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[s.chip, o.value === value && { backgroundColor: colors.primary }]}>
            <Text style={{ color: o.value === value ? '#fff' : colors.text }}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Row({ left, right, bold, color }: { left: string; right: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontWeight: bold ? '700' : '400', flex: 1 }}>{left}</Text>
      <Text style={{ fontWeight: bold ? '700' : '400', color }}>{right}</Text>
    </View>
  );
}
export function confirm(title: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: onYes }]);
}
export function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(msg);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginVertical: 6 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontSize: 15 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#e5e7eb' },
});
