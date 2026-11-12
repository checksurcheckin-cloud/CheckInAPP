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
// Vers le planning, `focusShiftId` le fait s'ouvrir sur la semaine du shift
// (pour un regroupement hebdomadaire, le premier shift de la semaine) ;
// `focusNonce` distingue deux ouvertures successives du même shift.
export function notificationRoute(type: NotificationType, shiftId: string | null | undefined) {
  const screen = NOTIFICATION_TARGET_TAB[type];
  if (screen !== 'Planning' || !shiftId) return { screen };
  return { screen, params: { focusShiftId: shiftId, focusNonce: Date.now() } };
}
