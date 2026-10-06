import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Animated } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, spacing, typography, nativeShadow } from '@horaires/ui-tokens';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/AuthService';
import { CountdownRing } from './CountdownRing';

// Le code est valide 30s côté serveur (RotatingQrService, fenêtre TOTP) —
// on rafraîchit un peu avant l'expiration pour qu'un scan tombant juste
// après un renouvellement ne trouve jamais un QR déjà expiré à l'écran.
const REFRESH_INTERVAL_MS = 25_000;
const RING_SIZE = 224;
const QR_SIZE = 150;

// Cœur de l'écran de pointage : le QR personnel rotatif de l'employé,
// entouré de l'anneau de progression (voir CountdownRing). Capture d'écran
// interdite tant que ce composant est monté — une photo rendrait le code
// rejouable jusqu'à son expiration.
export function PersonalQrCode() {
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;

  const refresh = useCallback(async () => {
    try {
      const { payload: nextPayload } = await apiClient.getMyRotatingQr();
      if (nextPayload) {
        // Fondu doux plutôt qu'un changement brutal du motif du QR.
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
      }
      setPayload(nextPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de générer le QR');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  useEffect(() => {
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return (
    <View style={styles.wrap}>
      <View style={styles.glow} />
      <CountdownRing size={RING_SIZE} color={colors.primary} trackColor={colors.border}>
        <View style={styles.card}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : payload ? (
            <Animated.View style={{ opacity }}>
              <QRCode value={payload} size={QR_SIZE} />
            </Animated.View>
          ) : null}
        </View>
      </CountdownRing>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: RING_SIZE + 68,
    height: RING_SIZE + 68,
    borderRadius: (RING_SIZE + 68) / 2,
    backgroundColor: colors.accentTint,
    opacity: 0.5,
  },
  card: {
    width: 176,
    height: 176,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...nativeShadow.lg,
  },
  error: { color: colors.danger, marginTop: spacing.md, fontSize: typography.sizes.sm, textAlign: 'center' },
});
