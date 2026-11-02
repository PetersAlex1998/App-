import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MIN_TARGET, type, useColors } from './theme';

export { useColors };

export function Screen({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">{children}</ScrollView>;
}
export const Title = ({ children }: { children: React.ReactNode }) => {
  const c = useColors();
  return <Text accessibilityRole="header" style={{ fontSize: type.title, fontWeight: '700', color: c.text, marginBottom: 8, marginTop: 16 }}>{children}</Text>;
};
export const Muted = ({ children }: { children: React.ReactNode }) => {
  const c = useColors();
  return <Text style={{ color: c.muted, marginTop: 2, fontSize: type.subhead }}>{children}</Text>;
};
export const Body = ({ children, bold, color }: { children: React.ReactNode; bold?: boolean; color?: string }) => {
  const c = useColors();
  return <Text style={{ color: color ?? c.text, fontSize: type.body, fontWeight: bold ? '600' : '400' }}>{children}</Text>;
};
export const Empty = ({ text }: { text: string }) => {
  const c = useColors();
  return <Text style={{ color: c.muted, textAlign: 'center', marginVertical: 24, fontSize: type.body }}>{text}</Text>;
};

export function Card({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  const c = useColors();
  const style = { backgroundColor: c.card, borderRadius: 12, padding: 14, marginBottom: 10, minHeight: onPress ? MIN_TARGET : undefined };
  if (!onPress) return <View style={style}>{children}</View>;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>{children}</Pressable>;
}
export function Btn({ title, onPress, kind = 'primary' }: { title: string; onPress: () => void; kind?: 'primary' | 'danger' | 'ghost' }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : c.card;
  const fg = kind === 'primary' ? c.onPrimary : kind === 'danger' ? '#ffffff' : c.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, minHeight: MIN_TARGET, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginVertical: 6, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: type.body, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, value, onChangeText, keyboard, multiline, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; keyboard?: 'numeric' | 'email-address' | 'phone-pad'; multiline?: boolean; placeholder?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: type.footnote, color: c.muted, marginBottom: 4 }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
        keyboardType={keyboard === 'numeric' ? 'decimal-pad' : keyboard} autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        multiline={multiline} placeholder={placeholder} placeholderTextColor={c.muted}
        style={{ backgroundColor: c.card, color: c.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: type.body, minHeight: multiline ? 88 : MIN_TARGET }} />
    </View>
  );
}
export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: type.footnote, color: c.muted, marginBottom: 4 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
              style={{ minHeight: MIN_TARGET, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: on ? c.primary : c.fill }}>
              <Text style={{ color: on ? c.onPrimary : c.text, fontSize: type.body, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export function Row({ left, right, bold, color }: { left: string; right: string; bold?: boolean; color?: string }) {
  const c = useColors();
  const st = { fontWeight: bold ? ('700' as const) : ('400' as const), fontSize: type.body, color: c.text };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 }}>
      <Text style={[st, { flex: 1 }]}>{left}</Text>
      <Text style={[st, color ? { color } : null]}>{right}</Text>
    </View>
  );
}
export function confirm(title: string, onYes: () => void, yesLabel = 'Löschen') {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onYes();
    return;
  }
  Alert.alert(title, undefined, [{ text: 'Abbrechen', style: 'cancel' }, { text: yesLabel, style: yesLabel === 'Löschen' ? 'destructive' : 'default', onPress: onYes }]);
}
export function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(msg);
}
