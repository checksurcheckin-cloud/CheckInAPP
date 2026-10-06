import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { colors, spacing, radius, nativeShadow } from '@horaires/ui-tokens';
import type { Availability } from '@horaires/shared-types';
import { apiClient, useAuth } from '../services/AuthService';
import { ConfirmationBanner } from '../components/ConfirmationBanner';
import { fonts } from '../theme';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
// Sentinelle "toute la journée" pour une indisponibilité non restreinte à une
// plage précise (voir ShiftsService.ensureAvailable côté backend, qui lit
// désormais ces bornes plutôt que de les ignorer quand isAvailable est
// false). Un jour "Disponible" n'a plus d'heures propres — on stocke les
// mêmes bornes, uniquement pour satisfaire le schema (champs non nullables).
const FULL_DAY_START = '00:00';
const FULL_DAY_END = '23:59';
// Point de départ raisonnable à l'ouverture de l'éditeur de plage, avant
// ajustement au picker par l'employé.
const DEFAULT_RANGE_TIME = '12:00';

type RangeMode = 'from' | 'until';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Lundi de la semaine courante, à minuit local — base pour dater les
// exceptions ponctuelles (specificDate) "cette semaine" créées par le
// dialogue de récurrence (voir keepRecurringButFreeThisWeek).
function getWeekStart(): Date {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6);
  return `${start.getDate()} au ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

// "YYYY-MM-DD" en heure locale (pas .toISOString(), qui bascule sur le jour
// civil précédent pour un fuseau à décalage négatif) — le format attendu par
// CreateAvailabilityDto.specificDate (@IsDateString()).
function toDateOnlyString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "HH:mm" <-> Date — le picker natif travaille avec un Date, mais tout le
// reste de l'écran (state, API) manipule la chaîne HH:mm attendue par
// Availability.startTime/endTime côté backend.
function timeToDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Une indisponibilité sans plage précisée est stockée avec ces bornes
// plutôt qu'un champ nullable, pour rester compatible avec le schema
// (startTime/endTime non nullables) — voir CLAUDE.md décision #8.
function isFullDayBlock(record?: Availability): boolean {
  if (!record) return true;
  return record.startTime === FULL_DAY_START && record.endTime === FULL_DAY_END;
}

// Résumé affiché sur la ligne (hors édition) pour une indisponibilité
// restreinte : un seul des deux bords est significatif (l'autre est la
// sentinelle "toute la journée" de son côté) — voir saveEditing, qui ne
// produit plus que ces deux formes. Un ancien enregistrement avec les deux
// bords personnalisés (avant cette simplification) retombe sur "à partir de"
// par défaut, sans perdre sa borne de fin qui reste stockée telle quelle.
function describeUnavailableRange(record: Availability): { label: string; mode: RangeMode; time: string } {
  if (record.startTime === FULL_DAY_START) {
    return { label: `Jusqu'à ${record.endTime}`, mode: 'until', time: record.endTime };
  }
  return { label: `À partir de ${record.startTime}`, mode: 'from', time: record.startTime };
}

// Signe distinctif confirmant qu'une indisponibilité affichée provient bien
// de la récurrence (par opposition à une déclaration qui n'engagerait que la
// semaine affichée) — voir isRecurringApplied.
function RecurringBadge() {
  return (
    <View style={styles.recurringBadge}>
      <Ionicons name="repeat" size={11} color={colors.primary} />
    </View>
  );
}

// Un créneau récurrent par jour de semaine — l'écran affiche les 7 jours,
// pas seulement les disponibilités déjà déclarées, pour qu'ajuster un
// créneau existant ou en créer un se fasse au même endroit en un tap.
//
// Chaque jour n'est qu'une bascule Disponible / Indisponible — aucune heure
// à saisir pour "Disponible". En option, une fois le jour marqué
// indisponible, on peut préciser un seul bord ("à partir de" OU "jusqu'à",
// pas les deux) pour ne bloquer qu'une partie de la journée.
//
// Un jour jamais déclaré s'affiche "Disponible" par défaut (voir CLAUDE.md
// décision #8 révisée) — plus besoin de le déclarer explicitement pour
// pouvoir y être assigné, contrairement à avant. Ce qui bloque, c'est
// l'indisponibilité déclarée, jamais son absence.
//
// **La simple bascule ne concerne QUE le jour affiché** (crée/édite une
// exception ponctuelle, `specificDate` = la date exacte de cette occurrence
// dans la semaine affichée) — elle ne touche jamais la récurrence. Seul le
// bouton dédié « Rendre récurrente » / « Indisponibilité récurrente (toute
// la journée) » pose un blocage `dayOfWeek`, qui s'applique lui à toutes les
// semaines suivantes (voir CLAUDE.md décision #8 pour la précédence
// specificDate > dayOfWeek). Basculer un jour jamais déclaré vers
// Indisponible crée directement une exception ponctuelle (pas de récurrence
// à établir en contrepartie, contrairement à l'ancien comportement) ; le
// re-basculer vers Disponible supprime cette exception et retombe sur le
// défaut "Disponible" sans rien recréer.
//
// Remettre disponible un jour bloqué par une récurrence active (pas une
// exception ponctuelle) ouvre un choix explicite : garder la récurrence
// pour les semaines suivantes en ne libérant que celle-ci (crée une
// exception ponctuelle), ou l'annuler complètement pour toutes les
// semaines.
//
// La semaine affichée se navigue (flèches sous le titre) — utile pour
// vérifier qu'une récurrence s'applique bien plus tard : le badge répétition
// (RecurringBadge) confirme qu'une indisponibilité vue sur une semaine
// future vient bien de la récurrence, pas d'une exception ponctuelle isolée
// ; à l'inverse, "Exception cette semaine" signale une semaine où une
// récurrence existante a été explicitement mise en pause.
export function AvailabilitiesScreen() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>('from');
  const [rangeTime, setRangeTime] = useState(DEFAULT_RANGE_TIME);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  // Jour pour lequel on demande comment traiter la récurrence en dessous
  // avant de le remettre disponible — voir toggleDay.
  const [recurringPromptDay, setRecurringPromptDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    const list = await apiClient.getAvailabilities();
    setAvailabilities(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setIsRefreshing(true);
    await load().catch(() => {});
    setIsRefreshing(false);
  };

  // La récurrence (par jour de semaine, vaut pour toutes les semaines).
  const recordForDay = useMemo(() => {
    const map = new Map<number, Availability>();
    for (const a of availabilities) {
      if (a.dayOfWeek !== undefined && a.dayOfWeek !== null && !a.specificDate) {
        map.set(a.dayOfWeek, a);
      }
    }
    return map;
  }, [availabilities]);

  // L'exception ponctuelle éventuelle sur la semaine affichée (specificDate
  // == une des 7 dates de weekDates) — prime sur la récurrence, voir
  // keepRecurringButFreeThisWeek.
  const overrideForDay = useMemo(() => {
    const map = new Map<number, Availability>();
    for (const a of availabilities) {
      if (!a.specificDate) continue;
      const d = new Date(a.specificDate);
      const day = weekDates.findIndex((wd) => wd.toDateString() === d.toDateString());
      if (day !== -1) map.set(day, a);
    }
    return map;
  }, [availabilities, weekDates]);

  // Bascule Disponible <-> Indisponible pour LE JOUR AFFICHÉ SEULEMENT —
  // crée/édite une exception ponctuelle (specificDate), ne touche jamais la
  // récurrence. Seul le bouton dédié (applyRecurringFullDayBlock) pose un
  // blocage récurrent. Un jour jamais déclaré est déjà "Disponible" par
  // défaut (décision #8 révisée) : le premier tap dessus déclare une
  // indisponibilité ponctuelle, il n'y a plus besoin d'établir quoi que ce
  // soit pour le rendre disponible puisqu'il l'est déjà.
  const toggleDay = async (day: number) => {
    const recurring = recordForDay.get(day);
    const override = overrideForDay.get(day);
    const effective = override ?? recurring;
    const goingAvailable = !(effective?.isAvailable ?? true);

    // La récurrence est ce qui bloque ce jour (pas une exception ponctuelle
    // qui la masquerait déjà) : demander d'abord quoi faire des semaines
    // suivantes plutôt que l'écraser silencieusement.
    if (goingAvailable && recurring && !recurring.isAvailable && !override) {
      setRecurringPromptDay(day);
      return;
    }

    setBusyDay(day);
    setBanner(null);
    try {
      if (!goingAvailable) {
        if (override) {
          await apiClient.updateAvailability(override.id, {
            isAvailable: false,
            startTime: FULL_DAY_START,
            endTime: FULL_DAY_END,
          });
        } else {
          await apiClient.createAvailability({
            specificDate: toDateOnlyString(weekDates[day]),
            startTime: FULL_DAY_START,
            endTime: FULL_DAY_END,
            isAvailable: false,
          });
        }
      } else if (override) {
        // Une exception ponctuelle est ce qui bloquait ce jour précis (pas de
        // récurrence active en dessous) : la supprimer suffit à le libérer —
        // retombe sur le défaut "Disponible", rien à recréer.
        await apiClient.deleteAvailability(override.id);
      }
      // Sinon (recurring dit déjà isAvailable:true, ou rien n'est déclaré et
      // le défaut suffit) : rien à faire.
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la mise à jour' });
    } finally {
      setBusyDay(null);
    }
  };

  // Garde l'indisponibilité récurrente pour les semaines suivantes, ne
  // libère que la semaine affichée (exception ponctuelle, specificDate).
  const keepRecurringButFreeThisWeek = async () => {
    if (recurringPromptDay === null) return;
    const day = recurringPromptDay;
    const override = overrideForDay.get(day);
    setBusyDay(day);
    setRecurringPromptDay(null);
    setBanner(null);
    try {
      if (override) {
        await apiClient.updateAvailability(override.id, { isAvailable: true });
      } else {
        await apiClient.createAvailability({
          specificDate: toDateOnlyString(weekDates[day]),
          startTime: FULL_DAY_START,
          endTime: FULL_DAY_END,
          isAvailable: true,
        });
      }
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la mise à jour' });
    } finally {
      setBusyDay(null);
    }
  };

  // Annule l'indisponibilité récurrente pour de bon : toutes les semaines
  // suivantes deviennent disponibles ce jour-là.
  const cancelRecurring = async () => {
    if (recurringPromptDay === null) return;
    const day = recurringPromptDay;
    const recurring = recordForDay.get(day);
    const override = overrideForDay.get(day);
    setBusyDay(day);
    setRecurringPromptDay(null);
    setBanner(null);
    try {
      if (override) await apiClient.deleteAvailability(override.id);
      if (recurring) {
        await apiClient.updateAvailability(recurring.id, { isAvailable: true, startTime: FULL_DAY_START, endTime: FULL_DAY_END });
      }
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la mise à jour' });
    } finally {
      setBusyDay(null);
    }
  };

  // Ouvre l'édition de la plage d'indisponibilité — pré-remplie avec le bord
  // déjà déclaré s'il y en a un (exception ponctuelle si elle existe, sinon
  // la récurrence active), sinon "à partir de 12:00" par défaut.
  const startEditingUnavailableRange = (day: number) => {
    const effective = overrideForDay.get(day) ?? recordForDay.get(day);
    if (effective && !isFullDayBlock(effective)) {
      const { mode, time } = describeUnavailableRange(effective);
      setRangeMode(mode);
      setRangeTime(time);
    } else {
      setRangeMode('from');
      setRangeTime(DEFAULT_RANGE_TIME);
    }
    setEditingDay(day);
  };

  const cancelEditing = () => {
    setEditingDay(null);
    setPickerOpen(false);
  };

  const confirmPickedTime = (date: Date) => {
    setRangeTime(dateToTime(date));
    setPickerOpen(false);
  };

  // Édite l'exception ponctuelle si elle existe, sinon la récurrence active
  // (celle qui produit réellement l'affichage courant) ; s'il n'y a ni l'une
  // ni l'autre, crée une exception ponctuelle pour le jour affiché — jamais
  // la récurrence, cohérent avec toggleDay.
  const saveEditing = async () => {
    if (editingDay === null) return;
    setBanner(null);
    const target = overrideForDay.get(editingDay) ?? recordForDay.get(editingDay);
    const payload =
      rangeMode === 'from'
        ? { startTime: rangeTime, endTime: FULL_DAY_END, isAvailable: false }
        : { startTime: FULL_DAY_START, endTime: rangeTime, isAvailable: false };
    setBusyDay(editingDay);
    try {
      if (target) {
        await apiClient.updateAvailability(target.id, payload);
      } else {
        await apiClient.createAvailability({ specificDate: toDateOnlyString(weekDates[editingDay]), ...payload });
      }
      setEditingDay(null);
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : "Échec de l'enregistrement" });
    } finally {
      setBusyDay(null);
    }
  };

  // Seul point d'entrée qui pose (ou renforce) un blocage RÉCURRENT, journée
  // entière — l'exception ponctuelle du jour affiché, s'il y en avait une,
  // est supprimée : elle serait redondante avec la récurrence qui couvre
  // désormais ce jour de toute façon.
  const applyRecurringFullDayBlock = async (day: number) => {
    const override = overrideForDay.get(day);
    const recurring = recordForDay.get(day);
    setBusyDay(day);
    setBanner(null);
    try {
      if (override) await apiClient.deleteAvailability(override.id);
      if (recurring) {
        await apiClient.updateAvailability(recurring.id, { isAvailable: false, startTime: FULL_DAY_START, endTime: FULL_DAY_END });
      } else {
        await apiClient.createAvailability({ dayOfWeek: day, startTime: FULL_DAY_START, endTime: FULL_DAY_END, isAvailable: false });
      }
      setEditingDay(null);
      await load();
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof Error ? err.message : 'Échec de la mise à jour' });
    } finally {
      setBusyDay(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Disponibilités</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.weekNav}>
        <Pressable style={styles.weekNavButton} onPress={() => setWeekStart((d) => addDays(d, -7))}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.subtitle}>Semaine du {weekRangeLabel(weekStart)}</Text>
        <Pressable style={styles.weekNavButton} onPress={() => setWeekStart((d) => addDays(d, 7))}>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {banner ? <ConfirmationBanner kind={banner.kind} message={banner.message} /> : null}

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {DAYS.map((label, day) => {
          const record = recordForDay.get(day);
          const override = overrideForDay.get(day);
          const effective = override ?? record;
          // Rien de déclaré == Disponible par défaut (décision #8 révisée).
          const available = effective?.isAvailable ?? true;
          const fullDayBlock = isFullDayBlock(effective);
          const busy = busyDay === day;
          const editing = editingDay === day;
          // Signe distinctif : l'indisponibilité affichée vient bien de la
          // récurrence (pas d'exception ponctuelle qui la masquerait cette
          // semaine) — utile dès qu'on navigue au-delà de la semaine où elle
          // a été posée, pour confirmer qu'elle s'applique toujours.
          const isRecurringApplied = Boolean(record && !record.isAvailable && !override);
          // À l'inverse : la récurrence existe mais est mise en pause cette
          // semaine par une exception ponctuelle — sans ce repère, "Disponible"
          // pourrait laisser croire que la récurrence a été annulée.
          const isRecurringPaused = Boolean(available && override && record && !record.isAvailable);

          return (
            <View key={label} style={[styles.dayCard, editing && styles.dayCardEditing, !available && styles.dayCardOff]}>
              <View style={styles.dayRow}>
                <View>
                  <Text style={styles.dayName}>{label}</Text>
                  <Pressable
                    style={styles.toggle}
                    disabled={busy}
                    onPress={() => toggleDay(day)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: available }}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <View style={[styles.toggleTrack, available && styles.toggleTrackOn]}>
                        <View style={[styles.toggleKnob, available && styles.toggleKnobOn]} />
                      </View>
                    )}
                  </Pressable>
                </View>

                {available ? (
                  <View style={styles.availableCol}>
                    <Text style={styles.onLabel}>Disponible</Text>
                    {isRecurringPaused ? <Text style={styles.pausedNote}>Exception cette semaine</Text> : null}
                  </View>
                ) : fullDayBlock ? (
                  <View style={styles.unavailableCol}>
                    <View style={styles.offLabelRow}>
                      {isRecurringApplied ? <RecurringBadge /> : null}
                      <Text style={styles.offLabel}>Indisponible</Text>
                    </View>
                    <Pressable onPress={() => startEditingUnavailableRange(day)}>
                      <Text style={styles.narrowLink}>Préciser une plage horaire</Text>
                    </Pressable>
                    {!isRecurringApplied ? (
                      <Pressable onPress={() => applyRecurringFullDayBlock(day)}>
                        <Text style={styles.narrowLink}>Rendre récurrente</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <Pressable onPress={() => startEditingUnavailableRange(day)} style={styles.narrowedRow}>
                    {isRecurringApplied ? <RecurringBadge /> : null}
                    <Text style={styles.timePillText}>{describeUnavailableRange(effective!).label}</Text>
                    <Ionicons name="pencil" size={13} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>

              {editing ? (
                <View style={styles.editBlock}>
                  <View style={styles.modeRow}>
                    <Pressable
                      style={[styles.modeButton, rangeMode === 'from' && styles.modeButtonActive]}
                      onPress={() => setRangeMode('from')}
                    >
                      <Text style={[styles.modeButtonText, rangeMode === 'from' && styles.modeButtonTextActive]}>
                        À partir de
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeButton, rangeMode === 'until' && styles.modeButtonActive]}
                      onPress={() => setRangeMode('until')}
                    >
                      <Text style={[styles.modeButtonText, rangeMode === 'until' && styles.modeButtonTextActive]}>
                        Jusqu'à
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.editRow}>
                    <Pressable style={styles.timeButton} onPress={() => setPickerOpen(true)}>
                      <Text style={styles.timeButtonLabel}>
                        {rangeMode === 'from' ? 'Indisponible à partir de' : "Indisponible jusqu'à"}
                      </Text>
                      <Text style={styles.timeButtonValue}>{rangeTime}</Text>
                    </Pressable>
                    <Pressable style={styles.rowSaveBtn} onPress={saveEditing}>
                      <Ionicons name="checkmark" size={16} color={colors.surface} />
                    </Pressable>
                    <Pressable style={styles.rowCancelBtn} onPress={cancelEditing}>
                      <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => applyRecurringFullDayBlock(day)}>
                    <Text style={styles.resetFullDayText}>Indisponibilité récurrente (toute la journée)</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <DateTimePickerModal
        isVisible={pickerOpen}
        mode="time"
        is24Hour
        locale="fr-FR"
        date={timeToDate(rangeTime)}
        onConfirm={confirmPickedTime}
        onCancel={() => setPickerOpen(false)}
      />

      <Modal
        visible={recurringPromptDay !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRecurringPromptDay(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Indisponibilité récurrente</Text>
            <Text style={styles.modalMessage}>
              {recurringPromptDay !== null ? DAYS[recurringPromptDay] : ''} est marqué indisponible chaque
              semaine. Voulez-vous garder cette récurrence pour les semaines suivantes en ne libérant que
              celle-ci, ou l'annuler définitivement ?
            </Text>
            <Pressable style={styles.modalPrimaryBtn} onPress={keepRecurringButFreeThisWeek}>
              <Text style={styles.modalPrimaryBtnText}>Garder la récurrence, libérer cette semaine</Text>
            </Pressable>
            <Pressable style={styles.modalSecondaryBtn} onPress={cancelRecurring}>
              <Text style={styles.modalSecondaryBtnText}>Annuler la récurrence définitivement</Text>
            </Pressable>
            <Pressable style={styles.modalCancelBtn} onPress={() => setRecurringPromptDay(null)}>
              <Text style={styles.modalCancelBtnText}>Retour</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.saveBar}>
        <Pressable
          style={styles.saveBtn}
          onPress={() => {
            setEditingDay(null);
            setBanner({ kind: 'success', message: 'Disponibilités à jour' });
          }}
        >
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 28, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.primary },
  subtitle: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 18 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
  weekNavButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: { marginTop: 22, gap: 10, paddingBottom: 190 },
  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dayCardEditing: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCardOff: { opacity: 0.62 },

  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontFamily: fonts.displaySemiBold, fontSize: 14.5, color: colors.textPrimary, marginBottom: 8 },

  toggle: { alignSelf: 'flex-start' },
  toggleTrack: { width: 40, height: 23, borderRadius: 12, backgroundColor: colors.border, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: colors.primary },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface, marginLeft: 2.5, ...nativeShadow.sm },
  toggleKnobOn: { marginLeft: 19.5 },

  availableCol: { alignItems: 'flex-end', gap: 2 },
  onLabel: { fontSize: 12.5, color: colors.textPrimary, fontWeight: '600' },
  pausedNote: { fontSize: 10.5, color: colors.primary, fontWeight: '600' },
  offLabel: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  offLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  unavailableCol: { alignItems: 'flex-end', gap: 4 },
  narrowLink: { fontSize: 11.5, color: colors.primary, fontWeight: '600' },
  narrowedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timePillText: { fontFamily: fonts.displaySemiBold, fontSize: 12.5, color: colors.textPrimary },
  recurringBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editBlock: { marginTop: spacing.sm, gap: spacing.sm },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  modeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeButtonText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  modeButtonTextActive: { color: colors.surface },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  timeButtonLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 1 },
  timeButtonValue: { fontFamily: fonts.displaySemiBold, fontSize: 14, color: colors.textPrimary },
  rowSaveBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  rowCancelBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resetFullDayText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: '600', textDecorationLine: 'underline' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    gap: 12,
    ...nativeShadow.lg,
  },
  modalTitle: { fontFamily: fonts.displaySemiBold, fontSize: 17, color: colors.textPrimary },
  modalMessage: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
  modalPrimaryBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  modalPrimaryBtnText: { color: colors.surface, fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  modalSecondaryBtn: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  modalSecondaryBtnText: { color: colors.danger, fontSize: 13.5, fontWeight: '700' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: 6 },
  modalCancelBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

  saveBar: { position: 'absolute', left: 24, right: 24, bottom: 102 },
  saveBtn: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 6,
  },
  saveBtnText: { color: colors.surface, fontSize: 14.5, fontWeight: '700' },
});
