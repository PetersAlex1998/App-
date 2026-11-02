import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './src/theme';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { Dashboard, Payments, Properties, Tenants } from './src/screens/Lists';
import { CostForm, PaymentForm, PropertyForm, TenantForm, UnitForm } from './src/screens/Forms';
import { DataScreen } from './src/screens/Data';
import { PropertyDetail, TenantDetail } from './src/screens/Details';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const icon = (name: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.card }, tabBarLabelStyle: { fontSize: 11 }, headerStyle: { backgroundColor: c.card }, headerTintColor: c.text }}>
      <Tab.Screen name="Übersicht" component={Dashboard} options={{ tabBarIcon: icon('stats-chart') }} />
      <Tab.Screen name="Objekte" component={Properties} options={{ tabBarIcon: icon('business') }} />
      <Tab.Screen name="Mieter" component={Tenants} options={{ tabBarIcon: icon('people') }} />
      <Tab.Screen name="Zahlungen" component={Payments} options={{ tabBarIcon: icon('card') }} />
      <Tab.Screen name="Daten" component={DataScreen} options={{ tabBarIcon: icon('cloud-download') }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready } = useStore();
  const c = useColors();
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  return (
    <NavigationContainer theme={{ dark: c.bg === "#000000", colors: { primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.line, notification: c.danger }, fonts: DefaultTheme.fonts }}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: c.card }, headerTintColor: c.primary, headerTitleStyle: { color: c.text }, headerBackTitle: 'Zurück' }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="PropertyForm" component={PropertyForm} options={{ title: 'Objekt' }} />
        <Stack.Screen name="PropertyDetail" component={PropertyDetail} options={{ title: 'Objekt' }} />
        <Stack.Screen name="UnitForm" component={UnitForm} options={{ title: 'Wohnung' }} />
        <Stack.Screen name="CostForm" component={CostForm} options={{ title: 'Betriebskosten' }} />
        <Stack.Screen name="TenantForm" component={TenantForm} options={{ title: 'Mieter' }} />
        <Stack.Screen name="TenantDetail" component={TenantDetail} options={{ title: 'Mieter' }} />
        <Stack.Screen name="PaymentForm" component={PaymentForm} options={{ title: 'Zahlung' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
        <StatusBar style="auto" />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
