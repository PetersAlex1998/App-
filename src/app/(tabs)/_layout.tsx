import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { FloatingTabBar } from '../../FloatingTabBar';

/** Vier Bereiche in der Leiste. „Mieter“ ist ein verstecktes Modul (siehe „Alle Module“). */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Übersicht' }} />
      <Tabs.Screen name="objekte" options={{ title: 'Objekte' }} />
      <Tabs.Screen name="zahlungen" options={{ title: 'Zahlungen' }} />
      <Tabs.Screen name="module" options={{ title: 'Module' }} />
      <Tabs.Screen name="mieter" options={{ title: 'Mieter' }} />
    </Tabs>
  );
}
