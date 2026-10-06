import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@horaires/ui-tokens';
import { DeviceAuthProvider, useDeviceAuth } from './src/services/DeviceAuthService';
import { DevicePairingScreen } from './src/screens/DevicePairingScreen';
import { KioskHomeScreen } from './src/screens/KioskHomeScreen';
import { PinEntryScreen } from './src/screens/PinEntryScreen';
import { OfflineScreen } from './src/screens/OfflineScreen';

/**
 * App kiosk installée sur la tablette du site (caisse, vestiaire).
 *
 * DIFFÉRENCE FONDAMENTALE avec checkin-mobile : pas d'utilisateur connecté.
 * L'app s'authentifie comme un SiteDevice (deviceId + qrSecret stockés
 * localement après le pairing initial), pas comme une personne.
 *
 * Flux :
 * 1. Premier lancement → DevicePairingScreen (un manager scanne/saisit un
 *    code d'appairage généré depuis web-manager pour lier cette tablette à un site)
 * 2. Une fois appairée → KioskHomeScreen en boucle : la caméra de LA TABLETTE
 *    scanne le QR rotatif affiché sur LE TÉLÉPHONE de l'employé (jamais
 *    l'inverse — cette tablette n'affiche elle-même aucun QR), avec le PIN
 *    en alternative. Pas de badge physique dans ce produit.
 * 3. Après chaque pointage → retour automatique à KioskHomeScreen (jamais
 *    d'état "connecté" qui persiste pour un employé en particulier)
 */
export default function App() {
  return (
    <DeviceAuthProvider>
      <StatusBar style="auto" hidden />
      <RootNavigator />
    </DeviceAuthProvider>
  );
}

type Screen = 'home' | 'pin';

function RootNavigator() {
  const { isLoading, isPaired, session, isOffline } = useDeviceAuth();
  const [screen, setScreen] = useState<Screen>('home');

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isPaired) {
    return <DevicePairingScreen />;
  }

  if (!session) {
    return isOffline ? <OfflineScreen /> : (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  switch (screen) {
    case 'pin':
      return <PinEntryScreen onDone={() => setScreen('home')} />;
    default:
      return <KioskHomeScreen onNavigatePin={() => setScreen('pin')} />;
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
});
