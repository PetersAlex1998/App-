import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_WIDTH, MIN_TARGET, type, useColors, useIsDark } from './theme';

export { useColors };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tone = 'ok' | 'danger' | 'warn' | 'neutral' | 'primary' | 'plain';

/* ───────── Layout ───────── */

const webGradient = (dark: boolean) =>
  Platform.OS === 'web'
    ? { backgroundImage: dark ? 'linear-gradient(180deg,#14161A 0%,#0A0B0D 100%)' : 'linear-gradient(180deg,#F3F4F7 0%,#E3E5EA 55%,#DADCE2 100%)', backgroundAttachment: 'fixed' }
    : null;

export function Screen({ children, tab }: { children: React.ReactNode; tab?: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.bg }, webGradient(dark) as object]}
      contentContainerStyle={{ paddingTop: tab ? insets.top + 4 : 8, paddingBottom: tab ? 130 : 40, alignItems: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, paddingHorizontal: 16 }}>{children}</View>
    </ScrollView>
  );
}

export function CircleButton({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [{ width: MIN_TARGET, height: MIN_TARGET, borderRadius: MIN_TARGET / 2, backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, softShadow as object, glassWeb as object]}>
      <Ionicons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}
const softShadow = { shadowColor: '#1B1D22', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 4 };
const cardShadow = { shadowColor: '#1B1D22', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 };
const glassWeb = Platform.OS === 'web' ? { backdropFilter: 'blur(24px) saturate(1.8)' } : {};

/** Kleine zentrierte Navigationszeile (wie iOS) über einer großen, fetten Überschrift. */
export function LargeHeader({ navTitle, title, subtitle, action }: { navTitle: string; title: string; subtitle?: string; action?: { label: string; onPress: () => void; icon?: IconName } }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: MIN_TARGET + 4 }}>
        <Text accessible={false} style={{ fontSize: type.headline, fontWeight: '600', color: c.text }}>{navTitle}</Text>
        {action ? <View style={{ position: 'absolute', right: 0 }}><CircleButton label={action.label} icon={action.icon ?? 'add'} onPress={action.onPress} /></View> : null}
      </View>
      <Text accessibilityRole="header" style={{ fontSize: type.display, fontWeight: '800', color: c.text, letterSpacing: -0.6, marginTop: 14, lineHeight: 38 }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: type.subhead, color: c.muted, marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Section({ title, footer, children, action }: { title?: string; footer?: string; children: React.ReactNode; action?: { label: string; onPress: () => void } }) {
  const c = useColors();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginBottom: 22 }}>
      {title ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: type.footnote, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</Text>
          {action ? (
            <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}>
              <Text style={{ fontSize: type.subhead, fontWeight: '600', color: c.primary }}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {items.length > 0 && (
        <View style={[{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.glassBorder }, cardShadow as object]}>
          <View style={{ borderRadius: 21, overflow: 'hidden' }}>
          {items.map((child, i) => (
            <View key={i}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: c.line, marginLeft: 14 }} /> : null}
              {child}
            </View>
          ))}
          </View>
        </View>
      )}
      {footer ? <Text style={{ fontSize: type.footnote, color: c.muted, marginTop: 6, paddingHorizontal: 4 }}>{footer}</Text> : null}
    </View>
  );
}

/* ───────── Bausteine ───────── */

export function Avatar({ text, size = 40 }: { text: string; size?: number }) {
  const c = useColors();
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: size * 0.38 }}>{text}</Text>
    </View>
  );
}

export function IconBubble({ name, tone = 'plain', size = 40 }: { name: IconName; tone?: Tone; size?: number }) {
  const c = useColors();
  const { fg, bg } = toneColors(c, tone);
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.55} color={fg} />
    </View>
  );
}

function toneColors(c: ReturnType<typeof useColors>, tone: Tone) {
  switch (tone) {
    case 'ok': return { fg: c.ok, bg: c.okSoft };
    case 'danger': return { fg: c.danger, bg: c.dangerSoft };
    case 'warn': return { fg: c.warn, bg: c.warnSoft };
    case 'primary': return { fg: c.primary, bg: c.primarySoft };
    case 'plain': return { fg: c.text, bg: c.fill };
    default: return { fg: c.muted, bg: c.fill };
  }
}
const toneIcon: Record<Tone, IconName | null> = { ok: 'checkmark-circle', danger: 'alert-circle', warn: 'time', neutral: null, primary: null, plain: null };

/** Status immer mit Text UND Symbol – nie nur Farbe. */
export function Badge({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const c = useColors();
  const { fg, bg } = toneColors(c, tone);
  const icon = toneIcon[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: type.footnote, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function ListRow({ title, subtitle, right, rightColor, rightSub, badge, avatar, icon, iconTone, onPress, chevron }: {
  title: string; subtitle?: string; right?: string; rightColor?: string; rightSub?: string;
  badge?: { text: string; tone?: Tone }; avatar?: string; icon?: IconName; iconTone?: Tone; onPress?: () => void; chevron?: boolean;
}) {
  const c = useColors();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 }}>
      {avatar ? <Avatar text={avatar} /> : icon ? <IconBubble name={icon} tone={iconTone} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: type.body, fontWeight: '600', color: c.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: type.subhead, color: c.muted }}>{subtitle}</Text> : null}
        {badge ? <View style={{ marginTop: 4 }}><Badge text={badge.text} tone={badge.tone} /></View> : null}
      </View>
      {right ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: type.body, fontWeight: '600', color: rightColor ?? c.text, fontVariant: ['tabular-nums'] }}>{right}</Text>
          {rightSub ? <Text style={{ fontSize: type.footnote, color: c.muted }}>{rightSub}</Text> : null}
        </View>
      ) : null}
      {(chevron ?? !!onPress) ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}>{content}</Pressable>;
}

export function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const color = tone === 'danger' ? c.danger : tone === 'ok' ? c.ok : c.text;
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: c.card, borderRadius: 22, padding: 16, gap: 6, borderWidth: 1, borderColor: c.glassBorder, ...cardShadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Ionicons name={icon} size={15} color={c.muted} /> : null}
        <Text style={{ fontSize: type.footnote, color: c.muted, fontWeight: '600' }}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 24, fontWeight: '800', color, fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );
}
export const StatGrid = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>{children}</View>
);

export function EmptyState({ icon, title, text, actionLabel, onAction }: { icon: IconName; title: string; text: string; actionLabel?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 8 }}>
      <IconBubble name={icon} size={64} />
      <Text style={{ fontSize: type.title, fontWeight: '700', color: c.text, marginTop: 8, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: type.body, color: c.muted, textAlign: 'center', maxWidth: 380 }}>{text}</Text>
      {actionLabel && onAction ? <View style={{ marginTop: 12, maxWidth: 320, width: '100%', alignSelf: 'center' }}><Button title={actionLabel} onPress={onAction} /></View> : null}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'destructive' | 'plain'; icon?: IconName; disabled?: boolean }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.ink : kind === 'secondary' ? c.primarySoft : kind === 'destructive' ? c.dangerSoft : 'transparent';
  const fg = kind === 'primary' ? c.onInk : kind === 'destructive' ? c.danger : c.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, minHeight: 52, paddingHorizontal: 18, borderRadius: 26, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 })}>
      {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: type.body, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}
export const Gap = ({ h = 10 }: { h?: number }) => <View style={{ height: h }} />;

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 14, padding: 3, marginBottom: 16 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: on ? c.card : 'transparent' }}>
            <Text style={{ fontSize: type.subhead, fontWeight: on ? '700' : '500', color: on ? c.text : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, autoFocus }: { value: string; onChangeText: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 22, paddingHorizontal: 14, gap: 8, marginBottom: 14, minHeight: 48, borderWidth: 1, borderColor: c.glassBorder }}>
      <Ionicons name="search" size={18} color={c.muted} />
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} autoCorrect={false} autoFocus={autoFocus}
        style={{ flex: 1, color: c.text, fontSize: type.body, paddingVertical: 10 }} />
      {value ? <Pressable accessibilityLabel="Suche löschen" onPress={() => onChangeText('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable> : null}
    </View>
  );
}

/* ───────── Formulare ───────── */

function FieldShell({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <Text style={{ fontSize: type.footnote, color: error ? c.danger : c.muted, fontWeight: '600', marginBottom: 2 }}>{label}</Text>
      {children}
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Ionicons name="alert-circle" size={14} color={c.danger} />
          <Text style={{ color: c.danger, fontSize: type.footnote }}>{error}</Text>
        </View>
      ) : hint ? <Text style={{ color: c.muted, fontSize: type.footnote, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

export function Field({ label, value, onChangeText, keyboard, multiline, placeholder, error, suffix, hint }: {
  label: string; value: string; onChangeText: (v: string) => void; keyboard?: 'numeric' | 'email-address' | 'phone-pad'; multiline?: boolean; placeholder?: string; error?: string; suffix?: string; hint?: string;
}) {
  const c = useColors();
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
          keyboardType={keyboard === 'numeric' ? 'decimal-pad' : keyboard} autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
          multiline={multiline} placeholder={placeholder} placeholderTextColor={c.muted}
          style={[{ flex: 1, color: c.text, fontSize: type.body, paddingVertical: 6, minHeight: multiline ? 80 : 36 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]} />
        {suffix ? <Text style={{ color: c.muted, fontSize: type.body, marginLeft: 6 }}>{suffix}</Text> : null}
      </View>
    </FieldShell>
  );
}

/** Datum: im Browser/Handy der native Datumswähler, sonst Texteingabe. */
export function DateField({ label, value, onChange, mode = 'date', error, optional }: { label: string; value: string; onChange: (v: string) => void; mode?: 'date' | 'month'; error?: string; optional?: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  return (
    <FieldShell label={label} error={error}>
      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: mode, value, 'aria-label': label,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: { border: 'none', outline: 'none', background: 'transparent', color: c.text, fontSize: 17, padding: '6px 0', minHeight: 36, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', width: '100%', colorScheme: dark ? 'dark' : 'light' },
        })
      ) : (
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={mode === 'month' ? 'JJJJ-MM' : 'JJJJ-MM-TT'} placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation"
          style={{ color: c.text, fontSize: type.body, paddingVertical: 6, minHeight: 36 }} />
      )}
      {optional && value ? (
        <Pressable accessibilityRole="button" onPress={() => onChange('')} hitSlop={8} style={{ marginTop: 4 }}>
          <Text style={{ color: c.primary, fontSize: type.footnote, fontWeight: '600' }}>Datum entfernen</Text>
        </Pressable>
      ) : null}
    </FieldShell>
  );
}

export function OptionRow({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: type.body, color: c.text, fontWeight: selected ? '700' : '400' }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: type.footnote, color: c.muted }}>{subtitle}</Text> : null}
        </View>
        {selected ? <Ionicons name="checkmark-circle" size={24} color={c.primary} /> : <Ionicons name="ellipse-outline" size={24} color={c.line} />}
      </View>
    </Pressable>
  );
}

export function Row({ left, right, bold, color }: { left: string; right: string; bold?: boolean; color?: string }) {
  const c = useColors();
  const st = { fontWeight: bold ? ('700' as const) : ('400' as const), fontSize: type.body, color: c.text };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, gap: 12 }}>
      <Text style={[st, { flex: 1 }]}>{left}</Text>
      <Text style={[st, { fontVariant: ['tabular-nums'] }, color ? { color } : null]}>{right}</Text>
    </View>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: type.subhead, paddingHorizontal: 14, paddingVertical: 12 }}>{children}</Text>;
}

/* ───────── Dialoge ───────── */

export function confirm(title: string, onYes: () => void, yesLabel = 'Löschen', message?: string) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onYes();
    return;
  }
  Alert.alert(title, message, [{ text: 'Abbrechen', style: 'cancel' }, { text: yesLabel, style: yesLabel === 'Löschen' ? 'destructive' : 'default', onPress: onYes }]);
}
export function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert(msg);
}
