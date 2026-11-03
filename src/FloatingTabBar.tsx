import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Übersicht: 'stats-chart', Objekte: 'business', Mieter: 'people', Zahlungen: 'card',
};

/** Schwebende Tab-Leiste im Stil von iOS 26: Glas-Oval plus separater runder Suchknopf. */
export function FloatingTabBar({ state, descriptors }: any) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const glass: any = { backgroundColor: c.glass, borderWidth: 1, borderColor: c.glassBorder, shadowColor: '#1B1D22', shadowOpacity: 0.18, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 12 };
  if (Platform.OS === 'web') glass.backdropFilter = 'blur(28px) saturate(1.8)';
  else glass.backgroundColor = c.glass.replace(/0\.\d+\)/, '0.86)'); // ohne Unschärfe weniger transparent
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 14), paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <View style={[{ flex: 1, maxWidth: 520, flexDirection: 'row', borderRadius: 40, padding: 6 }, glass]}>
        {state.routes.map((route: any, i: number) => {
          const focused = state.index === i;
          const title: string = descriptors?.[route.key]?.options?.title ?? route.name;
          const color = focused ? c.primary : c.text;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{ selected: focused }}
              onPress={() => { if (!focused) router.navigate((route.name === 'index' ? '/' : `/${route.name}`) as never); }}
              style={{ flex: 1, minHeight: 56, borderRadius: 34, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: focused ? c.primarySoft : 'transparent' }}>
              <Ionicons name={ICONS[title] ?? 'ellipse'} size={24} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color }}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Suche" onPress={() => router.push('/suche')}
        style={[{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' }, glass]}>
        <Ionicons name="search" size={28} color={c.text} />
      </Pressable>
    </View>
  );
}
