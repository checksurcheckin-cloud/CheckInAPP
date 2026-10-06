import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import { useDeviceAuth } from '../services/DeviceAuthService';
import { withPressedFeedback } from '../lib/pressedStyle';

// 1er lancement (ou après rotation du qrSecret) : un manager génère un QR
// d'appairage depuis web-manager (encode { deviceId, qrSecret }) et le
// présente à la caméra de la tablette. Saisie manuelle en secours.
export function DevicePairingScreen() {
  const { pair } = useDeviceAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [deviceId, setDeviceId] = useState('');
  const [qrSecret, setQrSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const submitPairing = async (id: string, secret: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await pair(id.trim(), secret.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'appairer ce terminal");
      setHasScanned(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (hasScanned || isSubmitting) return;
    setHasScanned(true);
    try {
      const parsed = JSON.parse(data);
      if (!parsed.deviceId || !parsed.qrSecret) throw new Error('QR invalide');
      void submitPairing(parsed.deviceId, parsed.qrSecret);
    } catch {
      setError('QR non reconnu — utilisez la saisie manuelle');
      setHasScanned(false);
    }
  };

  return (
    <View style={styles.container}>
    <View style={styles.card}>
      <Text style={styles.title}>Appairage du terminal</Text>
      <Text style={styles.subtitle}>
        Scannez le QR d'appairage généré depuis le panel manager pour ce site.
      </Text>

      {mode === 'scan' ? (
        <View style={styles.cameraWrapper}>
          {!permission?.granted ? (
            <Pressable style={withPressedFeedback(styles.button)} onPress={requestPermission}>
              <Text style={styles.buttonText}>Autoriser la caméra</Text>
            </Pressable>
          ) : (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
          )}
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Device ID"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            value={deviceId}
            onChangeText={setDeviceId}
          />
          <TextInput
            style={styles.input}
            placeholder="Code secret (qrSecret)"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            value={qrSecret}
            onChangeText={setQrSecret}
          />
          <Pressable
            style={withPressedFeedback(
              styles.button,
              (isSubmitting || !deviceId || !qrSecret) && styles.buttonDisabled,
            )}
            disabled={isSubmitting || !deviceId || !qrSecret}
            onPress={() => submitPairing(deviceId, qrSecret)}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Appairer</Text>
            )}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={withPressedFeedback()} onPress={() => setMode(mode === 'scan' ? 'manual' : 'scan')}>
        <Text style={styles.link}>
          {mode === 'scan' ? 'Saisir les identifiants manuellement' : 'Scanner un QR à la place'}
        </Text>
      </Pressable>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...nativeShadow.md,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  cameraWrapper: {
    height: 320,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: { flex: 1, width: '100%' },
  form: { gap: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    ...nativeShadow.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontWeight: '600', fontSize: typography.sizes.md },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing.md },
  link: { color: colors.primary, textAlign: 'center', marginTop: spacing.lg, fontSize: typography.sizes.sm },
});
