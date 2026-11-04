import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { barPath } from './tabBarShape';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, [Icon, Icon]> = {
  Übersicht: ['stats-chart-outline', 'stats-chart'], Objekte: ['business-outline', 'business'], Zahlungen: ['card-outline', 'card'], Module: ['apps-outline', 'apps'],
};

/** Routen, die zwar Tabs sind, aber nicht in der Leiste stehen (erreichbar über „Alle Module“). */
const HIDDEN = ['mieter'];

const BAR_H = 64; // Höhe der Glas-Leiste
const LIFT = 30; // Platz über der Leiste für die aktive Kugel
const BALL = 56; // Durchmesser der Kugel
const DEPTH = 38; // Tiefe der Mulde unter der Kugel
const HALF = 60; // halbe Breite der Mulde

/** Weiche Bewegung der Kugel zum neuen Eintrag (ohne Animation bei „Bewegung reduzieren“). */
function useTween(target: number, ms = 300) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (cur.current === 0 || reduce || Math.abs(target - cur.current) < 0.5) { cur.current = target; setV(target); return; }
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/**
 * Schwebende Glas-Leiste im Stil von iOS 26: Nur Symbole. Der aktive Eintrag wandert als Kugel nach oben,
 * die Leiste bildet darunter eine Mulde. Unter Web ist die Form per Pfad ausgeschnitten, sonst eine schlichte Pille.
 */
export function FloatingTabBar({ state, descriptors }: any) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => !HIDDEN.includes(r.name));
  const current = state.routes[state.index]?.name;
  const activeIdx = Math.max(0, routes.findIndex((r: any) => r.name === current || (r.name === 'module' && HIDDEN.includes(current))));
  const [w, setW] = useState(0);
  const slot = w / Math.max(1, routes.length);
  const cx = useTween(w ? slot * (activeIdx + 0.5) : 0);
  const web = Platform.OS === 'web';
  const bottom = Math.max(insets.bottom, 14);

  const go = (route: any, i: number) => { if (i !== activeIdx || current !== route.name) router.navigate((route.name === 'index' ? '/' : `/${route.name}`) as never); };
  const titleOf = (r: any): string => descriptors?.[r.key]?.options?.title ?? r.name;

  const g = { width: w, height: BAR_H, depth: DEPTH, halfWidth: HALF };
  const d = web && w ? barPath(cx, g) : '';
  const glass: any = { backgroundColor: c.glass };
  if (web) { glass.backdropFilter = 'blur(28px) saturate(1.8)'; glass.WebkitBackdropFilter = 'blur(28px) saturate(1.8)'; if (d) { glass.clipPath = `path('${d}')`; glass.WebkitClipPath = `path('${d}')`; } }
  else Object.assign(glass, { backgroundColor: c.glass.replace(/0\.\d+\)/, '0.86)'), borderWidth: 1, borderColor: c.glassBorder, borderRadius: BAR_H / 2 });

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom, paddingHorizontal: 16, alignItems: 'center' }}>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} pointerEvents="box-none" style={{ width: '100%', maxWidth: 560, height: LIFT + BAR_H }}>
        {web && w > 0 && (
          // Schatten als eigene weichgezeichnete Form unter der Leiste (ein Filter am Elternelement würde die Glas-Unschärfe stören)
          React.createElement('svg', { width: w, height: BAR_H, 'aria-hidden': true, style: { position: 'absolute', left: 0, top: LIFT + 10, filter: 'blur(14px)', opacity: 0.28, pointerEvents: 'none' } },
            React.createElement('path', { d, fill: '#1B1D22' }))
        )}
        <View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: LIFT, width: w || '100%', height: BAR_H }, glass]} />
        {web && w > 0 && (
          React.createElement('svg', { width: w, height: BAR_H, 'aria-hidden': true, style: { position: 'absolute', left: 0, top: LIFT, pointerEvents: 'none', overflow: 'visible' } },
            React.createElement('path', { d, fill: 'none', stroke: c.glassBorder, strokeWidth: 1.25, strokeLinejoin: 'round' }))
        )}

        <View style={{ position: 'absolute', left: 0, right: 0, top: LIFT, height: BAR_H, flexDirection: 'row' }}>
          {routes.map((route: any, i: number) => {
            const title = titleOf(route);
            const focused = i === activeIdx;
            const [outline] = ICONS[title] ?? ['ellipse-outline', 'ellipse'];
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{ selected: focused }} aria-selected={focused} onPress={() => go(route, i)}
                style={{ flex: 1, height: BAR_H, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                {!web || !focused ? <Ionicons name={outline} size={26} color={c.text} /> : null}
                {!web ? <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: focused ? c.primary : c.text }}>{title}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {web && w > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: cx - BALL / 2, top: LIFT + 4 - BALL / 2, width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', shadowColor: '#1B1D22', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
            <Ionicons name={(ICONS[titleOf(routes[activeIdx])] ?? ['ellipse-outline', 'ellipse'])[1]} size={26} color={c.onPrimary} />
          </View>
        )}
      </View>
    </View>
  );
}
