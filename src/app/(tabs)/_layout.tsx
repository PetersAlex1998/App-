import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { FloatingTabBar } from '../../FloatingTabBar';

/** Vier Hauptbereiche. Die Leiste ist die schwebende Glas-Leiste mit Suchknopf. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Übersicht' }} />
      <Tabs.Screen name="objekte" options={{ title: 'Objekte' }} />
      <Tabs.Screen name="mieter" options={{ title: 'Mieter' }} />
      <Tabs.Screen name="zahlungen" options={{ title: 'Zahlungen' }} />
    </Tabs>
  );
}
