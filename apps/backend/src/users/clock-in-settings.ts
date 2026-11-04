// Réglages de pointage résolus pour un employé (décisions #9 et #35) : la
// surcharge individuelle (User.*, non null) prime sur le réglage entreprise
// (Company.*). Les deux sont indépendants : `mobileClockInEnabled` couvre le
// QR rotatif affiché sur le téléphone, `gpsClockInEnabled` le GPS — l'un
// peut être actif sans l'autre.
export type ClockInSettingsSource = {
  gpsClockInEnabled?: boolean | null;
  mobileClockInEnabled?: boolean | null;
  company?: { gpsClockInEnabled?: boolean | null; mobileClockInEnabled?: boolean | null } | null;
} | null;

export type ClockInSettings = { mobileClockInEnabled: boolean; gpsClockInEnabled: boolean };

export function resolveClockInSettings(user: ClockInSettingsSource): ClockInSettings {
  const mobile = user?.mobileClockInEnabled ?? user?.company?.mobileClockInEnabled ?? true;
  const gps = user?.gpsClockInEnabled ?? user?.company?.gpsClockInEnabled ?? true;
  return { mobileClockInEnabled: mobile, gpsClockInEnabled: gps };
}

export const CLOCK_IN_SETTINGS_SELECT = {
  gpsClockInEnabled: true,
  mobileClockInEnabled: true,
  company: { select: { gpsClockInEnabled: true, mobileClockInEnabled: true } },
} as const;

export const MOBILE_CLOCK_IN_DISABLED_MESSAGE =
  'Le pointage par QR sur le téléphone est désactivé : utilisez votre PIN ou votre badge sur la tablette';
