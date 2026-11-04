// Réglages de pointage résolus pour un employé (décisions #9 et #35) : la
// surcharge individuelle (User.*, non null) prime sur le réglage entreprise
// (Company.*). Le GPS passe par l'app mobile : il n'est jamais actif si le
// pointage mobile est coupé, quel que soit son propre réglage.
export type ClockInSettingsSource = {
  gpsClockInEnabled?: boolean | null;
  mobileClockInEnabled?: boolean | null;
  company?: { gpsClockInEnabled?: boolean | null; mobileClockInEnabled?: boolean | null } | null;
} | null;

export type ClockInSettings = { mobileClockInEnabled: boolean; gpsClockInEnabled: boolean };

export function resolveClockInSettings(user: ClockInSettingsSource): ClockInSettings {
  const mobile = user?.mobileClockInEnabled ?? user?.company?.mobileClockInEnabled ?? true;
  const gps = user?.gpsClockInEnabled ?? user?.company?.gpsClockInEnabled ?? true;
  return { mobileClockInEnabled: mobile, gpsClockInEnabled: mobile && gps };
}

export const CLOCK_IN_SETTINGS_SELECT = {
  gpsClockInEnabled: true,
  mobileClockInEnabled: true,
  company: { select: { gpsClockInEnabled: true, mobileClockInEnabled: true } },
} as const;

export const MOBILE_CLOCK_IN_DISABLED_MESSAGE =
  "Le pointage depuis l'app mobile est désactivé : utilisez votre PIN ou votre badge sur la tablette";
