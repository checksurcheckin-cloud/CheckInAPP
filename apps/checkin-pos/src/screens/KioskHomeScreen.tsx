import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { DeviceTimeEntryResult } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient, useDeviceAuth } from '../services/DeviceAuthService';
import { ConfirmationOverlay } from '../components/ConfirmationOverlay';
import { Viewfinder } from '../components/Viewfinder';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = { onNavigatePin: () => void };

type Feedback =
  | { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string; time: string }
  | { kind: 'error'; message: string };

const FEEDBACK_DURATION_MS = 2500;

// Seule identification au scan : le QR rotatif affiché par le téléphone de
// l'employé (checkin-mobile, encode { userId, code }) — pas de badge
// physique dans ce produit, le PIN est l'unique filet de secours.
function isRotatingQrPayload(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return typeof parsed?.userId === 'string' && typeof parsed?.code === 'string';
  } catch {
    return false;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// Écran d'accueil en boucle : caméra active en continu (QR rotatif du
// téléphone, qr_scan_own_phone) et bouton PIN en secours. Jamais d'état
// "connecté" persistant pour un employé en particulier — tout retombe sur ce
// même écran 2 à 3 secondes après chaque tentative, succès ou échec.
export function KioskHomeScreen({ onNavigatePin }: Props) {
  const { session } = useDeviceAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const isProcessing = useRef(false);

  const resetAfterDelay = useCallback(() => {
    setTimeout(() => {
      setFeedback(null);
      isProcessing.current = false;
    }, FEEDBACK_DURATION_MS);
  }, []);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      if (!isRotatingQrPayload(data)) {
        setFeedback({ kind: 'error', message: 'QR non reconnu, réessayez' });
        resetAfterDelay();
        return;
      }

      try {
        const result: DeviceTimeEntryResult = await apiClient.scanRotatingQr(data);
        setFeedback({
          kind: 'clock',
          type: result.type as 'clock_in' | 'clock_out',
          name: `${result.employee.firstName} ${result.employee.lastName}`,
          time: formatTime(result.timestamp),
        });
      } catch (err) {
        setFeedback({ kind: 'error', message: err instanceof ApiError ? err.message : 'Code non reconnu' });
      } finally {
        resetAfterDelay();
      }
    },
    [resetAfterDelay],
  );

  return (
    <View style={styles.container}>
      <View style={styles.cameraPanel}>
        {!permission?.granted ? (
          <View style={styles.permissionPrompt}>
            <Text style={styles.permissionText}>
              La caméra est nécessaire pour scanner le QR de pointage.
            </Text>
            <Pressable style={withPressedFeedback(styles.permissionButton)} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <Viewfinder />
            <View style={styles.scanHintWrap} pointerEvents="none">
              <Text style={styles.scanHint}>Présentez le QR affiché sur votre téléphone</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoPanel}>
        <Text style={styles.deviceLabel}>{session?.deviceLabel ?? 'Terminal'}</Text>
        <Text style={styles.headline}>Scannez pour pointer</Text>
        <Text style={styles.helper}>
          Ouvrez l'app sur votre téléphone pour afficher votre QR personnel — il se renouvelle
          toutes les 30 secondes, pas besoin de le préparer à l'avance.
        </Text>

        <Pressable style={withPressedFeedback(styles.pinButton)} onPress={onNavigatePin}>
          <Text style={styles.pinButtonText}>Pointer avec mon code PIN</Text>
        </Pressable>
      </View>

      {feedback ? (
        <View style={styles.overlay}>
          {feedback.kind === 'clock' ? (
            <ConfirmationOverlay
              kind="clock"
              type={feedback.type}
              name={feedback.name}
              time={feedback.time}
              style={styles.fill}
            />
          ) : (
            <ConfirmationOverlay kind="error" message={feedback.message} style={styles.fill} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  cameraPanel: {
    flex: 1.3,
    margin: spacing.lg,
    marginRight: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    ...nativeShadow.md,
  },
  permissionPrompt: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  permissionText: { color: colors.surface, fontSize: typography.sizes.md, textAlign: 'center' },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  permissionButtonText: { color: colors.surface, fontWeight: '600' },
  scanHintWrap: { position: 'absolute', bottom: spacing.lg, left: 0, right: 0, alignItems: 'center' },
  scanHint: {
    color: colors.surface,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    overflow: 'hidden',
  },

  infoPanel: {
    flex: 1,
    margin: spacing.lg,
    marginLeft: spacing.md,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  deviceLabel: { fontSize: typography.sizes.sm, fontWeight: '700', color: colors.textSecondary },
  headline: { fontSize: typography.sizes['2xl'], fontWeight: '700', color: colors.textPrimary },
  helper: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  pinButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    alignSelf: 'flex-start',
    ...nativeShadow.sm,
  },
  pinButtonText: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sizes.md },

  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: spacing.xl },
  fill: { flex: 1 },
});
