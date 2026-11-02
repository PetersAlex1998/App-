import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Übersicht: 'stats-chart', Objekte: 'business', Mieter: 'people', Zahlungen: 'card',
};

/** Schwebende Tab-Leiste im Stil von iOS 26: Glas-Oval plus separater runder Suchknopf. */
export function FloatingTabBar({ state, navigation }: any) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const glass: any = { backgroundColor: c.glass, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10 };
  if (Platform.OS === 'web') glass.backdropFilter = 'blur(24px) saturate(1.6)';
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 14), paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <View style={[{ flex: 1, maxWidth: 520, flexDirection: 'row', borderRadius: 40, padding: 6 }, glass]}>
        {state.routes.map((route: any, i: number) => {
          const focused = state.index === i;
          const color = focused ? c.primary : c.text;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={route.name} accessibilityState={{ selected: focused }}
              onPress={() => { const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!focused && !e.defaultPrevented) navigation.navigate(route.name); }}
              style={{ flex: 1, minHeight: 56, borderRadius: 34, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: focused ? c.fill : 'transparent' }}>
              <Ionicons name={ICONS[route.name] ?? 'ellipse'} size={24} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color }}>{route.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Suche" onPress={() => navigation.navigate('Search')}
        style={[{ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' }, glass]}>
        <Ionicons name="search" size={28} color={c.text} />
      </Pressable>
    </View>
  );
}
