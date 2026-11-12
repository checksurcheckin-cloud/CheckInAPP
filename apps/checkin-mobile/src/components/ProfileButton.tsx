import React from 'react';
import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withPressedFeedback } from '../lib/pressedStyle';

// Avatar des en-têtes d'écran (à côté de la cloche) : ouvre l'onglet Profil.
// Chaque écran garde son propre rendu de l'avatar, passé en enfant.
export function ProfileButton({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();

  return (
    <Pressable
      onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
      style={withPressedFeedback()}
      accessibilityRole="button"
      accessibilityLabel="Profil"
      hitSlop={6}
    >
      {children}
    </Pressable>
  );
}
