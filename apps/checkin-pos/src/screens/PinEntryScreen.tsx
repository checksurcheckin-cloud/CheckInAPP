import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, typography, nativeShadow } from '@horaires/ui-tokens';
import type { DeviceTimeEntryResult, KioskEmployee } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/DeviceAuthService';
import { PinPad } from '../components/PinPad';
import { ConfirmationOverlay } from '../components/ConfirmationOverlay';
import { withPressedFeedback } from '../lib/pressedStyle';

type Props = { onDone: () => void };
type Feedback =
  | { kind: 'clock'; type: 'clock_in' | 'clock_out'; name: string; time: string }
  | { kind: 'error'; message: string };

const PIN_LENGTH = 4;
const RETURN_DELAY_MS = 2500;
// Un employé qui s'en va au milieu de la saisie ne doit pas laisser son nom
// sélectionné sur le kiosk : retour au scan après 30s sans interaction.
const IDLE_TIMEOUT_MS = 30_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

function initials(e: KioskEmployee): string {
  return `${e.firstName.charAt(0)}${e.lastName.charAt(0)}`.toUpperCase();
}

// Pointage par PIN façon login classique : l'employé choisit son nom dans la
// liste du site, puis tape son PIN à 4 chiffres (validé dès le 4e chiffre).
export function PinEntryScreen({ onDone }: Props) {
  const [employees, setEmployees] = useState<KioskEmployee[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KioskEmployee | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    apiClient
      .getKioskEmployees()
      .then(setEmployees)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Liste des employés indisponible'));
  }, []);

  useEffect(() => {
    if (feedback) return;
    const timer = setTimeout(onDone, IDLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [search, selected, pin, feedback, onDone]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!employees || !query) return employees ?? [];
    return employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(query));
  }, [employees, search]);

  const submit = async (employee: KioskEmployee, value: string) => {
    setIsSubmitting(true);
    setPinError(null);
    try {
      const result: DeviceTimeEntryResult = await apiClient.clockInWithPin(employee.id, value);
      setFeedback({
        kind: 'clock',
        type: result.type as 'clock_in' | 'clock_out',
        name: `${result.employee.firstName} ${result.employee.lastName}`,
        time: formatTime(result.timestamp),
      });
      setTimeout(onDone, RETURN_DELAY_MS);
    } catch (err) {
      // Mauvais PIN : on reste sur le clavier pour réessayer (comme un login),
      // le blocage après 5 essais est géré côté serveur.
      setPinError(err instanceof ApiError ? err.message : 'PIN incorrect');
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const changePin = (value: string) => {
    setPin(value);
    setPinError(null);
    if (selected && value.length === PIN_LENGTH) void submit(selected, value);
  };

  const backToList = () => {
    setSelected(null);
    setPin('');
    setPinError(null);
  };

  if (feedback) {
    return (
      <View style={styles.container}>
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
    );
  }

  if (selected) {
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <View style={styles.leftCol}>
            <Pressable style={withPressedFeedback(styles.back)} onPress={backToList}>
              <Text style={styles.link}>‹ Ce n'est pas moi</Text>
            </Pressable>
            <View style={styles.selectedAvatar}>
              <Text style={styles.selectedAvatarText}>{initials(selected)}</Text>
            </View>
            <Text style={styles.title}>
              {selected.firstName} {selected.lastName}
            </Text>
            <Text style={styles.helper}>Entrez votre code PIN à 4 chiffres.</Text>
            {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
          </View>

          <View style={styles.rightCol}>
            <PinPad value={pin} onChange={changePin} maxLength={PIN_LENGTH} disabled={isSubmitting} />
            {isSubmitting ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <Pressable style={withPressedFeedback(styles.back)} onPress={onDone}>
            <Text style={styles.link}>‹ Retour au scan</Text>
          </Pressable>
          <Text style={styles.title}>Qui êtes-vous ?</Text>
          <Text style={styles.helper}>Choisissez votre nom, puis entrez votre code PIN.</Text>
          <TextInput
            style={styles.search}
            placeholder="Rechercher mon nom"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>

        <View style={styles.listCol}>
          {loadError ? (
            <Text style={styles.error}>{loadError}</Text>
          ) : !employees ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(e) => e.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.helper}>Aucun employé ne correspond.</Text>}
              renderItem={({ item }) => (
                <Pressable style={withPressedFeedback(styles.employee)} onPress={() => setSelected(item)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(item)}</Text>
                  </View>
                  <Text style={styles.employeeName} numberOfLines={1}>
                    {item.firstName} {item.lastName}
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: spacing.xl, gap: spacing.xl },
  leftCol: { flex: 1, gap: spacing.sm },
  rightCol: { flex: 1.2, alignItems: 'center', justifyContent: 'center' },
  listCol: { flex: 1.4, alignSelf: 'stretch', justifyContent: 'center' },
  back: { alignSelf: 'flex-start' },
  link: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: '600' },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  helper: { fontSize: typography.sizes.md, color: colors.textSecondary, lineHeight: 22 },
  error: { fontSize: typography.sizes.md, color: colors.danger, fontWeight: '600', marginTop: spacing.sm },
  search: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  grid: { gap: spacing.sm, paddingVertical: spacing.md },
  gridRow: { gap: spacing.sm },
  employee: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...nativeShadow.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },
  employeeName: { flex: 1, fontSize: typography.sizes.md, fontWeight: '600', color: colors.textPrimary },
  selectedAvatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  selectedAvatarText: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.xl },
  spinner: { marginTop: spacing.lg },
});
