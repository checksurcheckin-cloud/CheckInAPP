import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { colors } from '@horaires/ui-tokens';
import { AuthProvider, useAuth } from './src/services/AuthService';
import { FloatingTabBar } from './src/components/FloatingTabBar';

// Écrans partagés (staff + manager)
import { LoginScreen } from './src/screens/LoginScreen';
import { ClockInScreen } from './src/screens/ClockInScreen';
import { AvailabilitiesScreen } from './src/screens/AvailabilitiesScreen';
import { ShiftMarketplaceScreen } from './src/screens/ShiftMarketplaceScreen';
import { PlanningScreen } from './src/screens/PlanningScreen'; // lecture seule
import { ProfileScreen } from './src/screens/ProfileScreen';

// Écrans manager uniquement

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="ClockIn" component={ClockInScreen} options={{ title: 'Pointage' }} />
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
