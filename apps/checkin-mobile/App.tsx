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
import { PresenceLiveScreen } from './src/screens/PresenceLiveScreen';
import { ShiftApprovalScreen } from './src/screens/ShiftApprovalScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/**
 * Point d'entrée. UNE SEULE app pour staff et managers — la navigation
 * s'adapte selon `currentUser.role`. Ne JAMAIS ajouter d'écran de création
 * d'horaires ici, même pour les managers : c'est exclusif à web-manager
 * (voir CLAUDE.md, décision d'architecture).
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
  const { user } = useAuth();
  const isManager = user?.role === 'manager' || user?.role === 'admin';

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Écrans communs à tous les rôles */}
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

      {/* Écrans manager uniquement */}
      {isManager ? (
        <>
          <Tab.Screen
            name="PresenceLive"
            component={PresenceLiveScreen}
            options={{ title: 'Présence' }}
          />
          <Tab.Screen
            name="ShiftApproval"
            component={ShiftApprovalScreen}
            options={{ title: 'Échanges' }}
          />
        </>
      ) : null}

      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}
