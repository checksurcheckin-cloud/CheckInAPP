import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ExpoNotifications from 'expo-notifications';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { colors } from '@horaires/ui-tokens';
import type { NotificationType } from '@horaires/shared-types';
import { AuthProvider, apiClient, useAuth } from './src/services/AuthService';
import { FloatingTabBar } from './src/components/FloatingTabBar';
import { ClockInSettingsProvider, useClockInSettings } from './src/services/ClockInSettings';
import { NotificationsProvider } from './src/services/Notifications';
import { registerForPush } from './src/services/PushNotifications';
import { NOTIFICATION_TARGET_TAB, notificationRoute } from './src/lib/notificationTargets';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from './src/lib/queryClient';
import { useRealtimeInvalidation } from './src/lib/queries';

// Écrans partagés (staff + manager)
import { LoginScreen } from './src/screens/LoginScreen';
import { ClockInScreen } from './src/screens/ClockInScreen';
import { AvailabilitiesScreen } from './src/screens/AvailabilitiesScreen';
import { ShiftMarketplaceScreen } from './src/screens/ShiftMarketplaceScreen';
import { PlanningScreen } from './src/screens/PlanningScreen'; // lecture seule
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';

// Écrans manager uniquement

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
// Pour ouvrir le bon onglet quand on touche une notification push, depuis
// l'extérieur des écrans.
const navigationRef = createNavigationContainerRef<any>();

/**
 * Point d'entrée. UNE SEULE app, IDENTIQUE pour tous les rôles : un manager
 * y a exactement les écrans d'un employé (son propre planning, ses dispos,
 * le marché, le pointage). Tout ce qui relève de la gestion (présence en
 * direct, validation des échanges, création d'horaires...) est exclusif à
 * web-manager — voir CLAUDE.md, décision #31. Ne pas réintroduire d'écran
 * ou d'onglet conditionné au rôle ici.
 */
export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    // Le cache sauvegardé sur le téléphone est relu au lancement : le
    // planning s'affiche même sans réseau (voir lib/queryClient.ts).
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}

// Notifications push : enregistre le téléphone à chaque session, et ouvre
// l'onglet concerné quand on touche une notification — y compris celle qui a
// lancé l'app, une fois la session restaurée et l'écran principal affiché.
function usePushNotifications(isSignedIn: boolean) {
  const lastResponse = ExpoNotifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);
  // Au lancement de l'app par une notification, la navigation n'est pas
  // toujours prête au premier passage : on réessaie un peu plus tard.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (isSignedIn) void registerForPush(apiClient);
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledId.current === id) return;
    const data = lastResponse.notification.request.content.data;
    const type = data?.type as NotificationType | undefined;
    const tab = type ? NOTIFICATION_TARGET_TAB[type] : undefined;
    if (!tab) return;
    if (!navigationRef.isReady()) {
      if (retry < 10) {
        const timer = setTimeout(() => setRetry((n) => n + 1), 200);
        return () => clearTimeout(timer);
      }
      return;
    }
    handledId.current = id;
    navigationRef.navigate('Main', notificationRoute(type!, data?.shiftId as string | undefined));
  }, [isSignedIn, lastResponse, retry]);
}

function RootNavigator() {
  const { user, isLoading, socket } = useAuth();
  usePushNotifications(Boolean(user) && !isLoading);
  // Un seul abonnement aux signaux temps réel pour tous les écrans : chacun
  // lit le cache, qui se recharge tout seul quand le backend signale un
  // changement.
  useRealtimeInvalidation(socket);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // La cloche des en-têtes et l'écran Notifications lisent le même état.
  return (
    <NotificationsProvider>
      <Stack.Navigator>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainWithSettings} options={{ headerShown: false }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NotificationsProvider>
  );
}

function MainWithSettings() {
  return (
    <ClockInSettingsProvider>
      <MainTabs />
    </ClockInSettingsProvider>
  );
}

// Ni QR ni GPS autorisés sur le téléphone (réglages entreprise ou surcharges
// employé, décisions #9 et #35) : pas d'onglet Pointage, et le Planning
// devient l'écran d'accueil. L'un des deux suffit à garder l'onglet. La `key`
// remonte le navigateur quand ça bascule, pour repartir sur le bon accueil.
function MainTabs() {
  const settings = useClockInSettings();

  if (!settings) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const mobileClockIn = settings.mobileClockInEnabled || settings.gpsClockInEnabled;
  return (
    <Tab.Navigator
      key={mobileClockIn ? 'with-clock-in' : 'planning-home'}
      initialRouteName={mobileClockIn ? 'ClockIn' : 'Planning'}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {mobileClockIn ? (
        <Tab.Screen name="ClockIn" component={ClockInScreen} options={{ title: 'Pointage' }} />
      ) : null}
      <Tab.Screen name="Planning" component={PlanningScreen} options={{ title: 'Planning' }} />
      <Tab.Screen
        name="ShiftMarketplace"
        component={ShiftMarketplaceScreen}
        options={{ title: 'Marché' }}
      />
      <Tab.Screen
        name="Availabilities"
        component={AvailabilitiesScreen}
        options={{ title: 'Dispos' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}
