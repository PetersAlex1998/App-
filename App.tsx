import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { Dashboard, Payments, Properties, Tenants } from './src/screens/Lists';
import { CostForm, PaymentForm, PropertyForm, TenantForm, UnitForm } from './src/screens/Forms';
import { PropertyDetail, TenantDetail } from './src/screens/Details';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const icon = (e: string) => () => <Text style={{ fontSize: 18 }}>{e}</Text>;

function Tabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Übersicht" component={Dashboard} options={{ tabBarIcon: icon('📊') }} />
      <Tab.Screen name="Objekte" component={Properties} options={{ tabBarIcon: icon('🏢') }} />
      <Tab.Screen name="Mieter" component={Tenants} options={{ tabBarIcon: icon('👤') }} />
      <Tab.Screen name="Zahlungen" component={Payments} options={{ tabBarIcon: icon('💶') }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready } = useStore();
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  return (
    <NavigationContainer>
      <Stack.Navigator>
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
