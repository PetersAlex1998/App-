import React from 'react';
import { ActivityIndicator } from 'react-native';
import { ThemeProvider, useColors, useIsDark } from './src/theme';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { Dashboard, Payments, Properties, Tenants } from './src/screens/Lists';
import { CostForm, PaymentForm, PropertyForm, TenantForm, UnitForm } from './src/screens/Forms';
import { DataScreen } from './src/screens/Data';
import { SearchScreen } from './src/screens/Search';
import { FloatingTabBar } from './src/FloatingTabBar';
import { PropertyDetail, TenantDetail } from './src/screens/Details';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();


function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Übersicht" component={Dashboard} />
      <Tab.Screen name="Objekte" component={Properties} />
      <Tab.Screen name="Mieter" component={Tenants} />
      <Tab.Screen name="Zahlungen" component={Payments} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready } = useStore();
  const c = useColors();
  const dark = useIsDark();
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  return (
    <NavigationContainer theme={{ dark, colors: { primary: c.primary, background: c.bg, card: c.card, text: c.text, border: c.line, notification: c.danger }, fonts: DefaultTheme.fonts }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.primary, headerTitleStyle: { color: c.text, fontWeight: '700' }, headerBackTitle: 'Zurück', headerTitleAlign: 'center', contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Suche' }} />
        <Stack.Screen name="Daten" component={DataScreen} options={{ title: 'Daten' }} />
        <Stack.Screen name="PropertyForm" component={PropertyForm} options={({ route }: any) => ({ title: route.params?.id ? 'Objekt bearbeiten' : 'Neues Objekt' })} />
        <Stack.Screen name="PropertyDetail" component={PropertyDetail} options={({ route }: any) => ({ title: 'Objekt' })} />
        <Stack.Screen name="UnitForm" component={UnitForm} options={({ route }: any) => ({ title: route.params?.id ? 'Wohnung bearbeiten' : 'Neue Wohnung' })} />
        <Stack.Screen name="CostForm" component={CostForm} options={({ route }: any) => ({ title: route.params?.id ? 'Kostenposition bearbeiten' : 'Neue Kostenposition' })} />
        <Stack.Screen name="TenantForm" component={TenantForm} options={({ route }: any) => ({ title: route.params?.id ? 'Mieter bearbeiten' : 'Neuer Mieter' })} />
        <Stack.Screen name="TenantDetail" component={TenantDetail} options={({ route }: any) => ({ title: 'Mieter' })} />
        <Stack.Screen name="PaymentForm" component={PaymentForm} options={({ route }: any) => ({ title: route.params?.id ? 'Zahlung bearbeiten' : 'Zahlung erfassen' })} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StoreProvider>
          <Root />
        </StoreProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
