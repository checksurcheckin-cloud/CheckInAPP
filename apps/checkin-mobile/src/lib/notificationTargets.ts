import type { NotificationType } from '@horaires/shared-types';

// Onglet où mène une notification (liste de la cloche ou push touché) : son
// planning pour un shift qui lui est attribué, le marché pour un shift à
// prendre.
export const NOTIFICATION_TARGET_TAB: Record<NotificationType, string> = {
  shift_assigned: 'Planning',
  application_accepted: 'Planning',
  shift_available: 'ShiftMarketplace',
};
