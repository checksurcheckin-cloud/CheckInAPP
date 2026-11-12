import type { NotificationType } from '@horaires/shared-types';

// Onglet où mène une notification (liste de la cloche ou push touché) : son
// planning pour un shift qui lui est attribué, le marché pour un shift à
// prendre.
export const NOTIFICATION_TARGET_TAB: Record<NotificationType, string> = {
  shift_assigned: 'Planning',
  application_accepted: 'Planning',
  shift_available: 'ShiftMarketplace',
};

// Paramètres de navigation.navigate('Main', …) pour ouvrir une notification.
// Vers le planning, `focusShiftId` le fait s'ouvrir sur ce shift :
// `focusMode: 'week'` amène l'en-tête de sa semaine en haut (nouveaux shifts,
// regroupés par semaine — le premier shift de la semaine), `'shift'` la
// carte du shift elle-même (candidature acceptée : un shift précis).
// `focusNonce` distingue deux ouvertures successives du même shift.
export function notificationRoute(type: NotificationType, shiftId: string | null | undefined) {
  const screen = NOTIFICATION_TARGET_TAB[type];
  if (screen !== 'Planning' || !shiftId) return { screen };
  const focusMode = type === 'application_accepted' ? 'shift' : 'week';
  return { screen, params: { focusShiftId: shiftId, focusMode, focusNonce: Date.now() } };
}
