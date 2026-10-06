// Types partagés entre backend, checkin-mobile, checkin-pos et web-manager.
// Reflètent le schéma Prisma — à garder synchronisé manuellement pour l'instant
// (on pourra générer ce fichier automatiquement depuis Prisma plus tard si besoin).

export type UserRole = 'admin' | 'manager' | 'employee';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type ShiftStatus = 'draft' | 'published' | 'cancelled';
export type AssignmentStatus =
  | 'assigned'
  | 'offered'
  | 'swap_pending'
  | 'confirmed'
  | 'cancelled';
export type OfferStatus = 'open' | 'accepted' | 'approved' | 'rejected' | 'expired';
export type TimeEntryType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
export type TimeEntrySource =
  | 'qr_scan_own_phone'
  | 'badge_scan'
  | 'pin_code'
  | 'gps'
  | 'manual_by_manager';

export interface Company {
  id: string;
  name: string;
  plan: string;
  gpsClockInEnabled: boolean;
  createdAt: string;
}

export interface Site {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  geoLat?: number;
  geoLng?: number;
  timezone: string;
}

export interface User {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  // null = suit le réglage entreprise par défaut (Company.gpsClockInEnabled),
  // true/false = surcharge individuelle explicite.
  gpsClockInEnabled?: boolean | null;
  // Site de rattachement, optionnel — null = pas encore assigné, reste
  // visible sur tous les sites de la grille planning (voir CLAUDE.md
  // décision #25).
  siteId?: string | null;
  // pas de pinCodeHash exposé côté client par défaut
}

export interface TimeEntry {
  id: string;
  userId: string;
  siteId: string;
  deviceId?: string;
  type: TimeEntryType;
  timestamp: string;
  source: TimeEntrySource;
  isEdited: boolean;
  editReason?: string;
}

export interface Shift {
  id: string;
  siteId: string;
  startsAt: string;
  endsAt: string;
  roleNeeded?: string;
  status: ShiftStatus;
  assignments?: ShiftAssignment[];
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  userId: string;
  status: AssignmentStatus;
  offers?: ShiftOffer[];
}

export interface ShiftOffer {
  id: string;
  shiftAssignmentId: string;
  offeredBy: string;
  acceptedBy?: string;
  status: OfferStatus;
  requiresManagerApproval: boolean;
}

// Un collègue candidat sur une offre encore ouverte — plusieurs candidatures
// possibles par offre, le manager choisit laquelle approuver.
export interface ShiftOfferCandidate {
  id: string;
  offerId: string;
  userId: string;
  createdAt: string;
}

// ---- GET /shift-offers : Marché de shifts (offres ouvertes de toute
// l'entreprise, sauf celles de l'appelant) ----
export interface OpenShiftOffer {
  id: string; // id de l'offre — à passer à applyToShiftOffer
  shiftId: string;
  shift: Shift;
  offeredBy: string; // id de l'employé qui a proposé le shift
  createdAt: string;
  hasApplied: boolean; // l'appelant a déjà candidaté sur cette offre
}

// ---- GET /shift-offers/pending : page "Échanges à valider" (web-manager) ----
export interface PendingShiftOffer {
  id: string;
  shiftId: string;
  shift: Shift;
  offeredBy: string;
  createdAt: string;
  candidates: ShiftOfferCandidate[];
}

export interface Availability {
  id: string;
  userId: string;
  dayOfWeek?: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

// ---- checkin-pos : le device s'authentifie lui-même, pas un utilisateur ----

export interface DeviceAuthResponse {
  deviceToken: string;
  siteId: string;
  deviceLabel: string;
}

export interface DeviceTimeEntryResult extends TimeEntry {
  employee: { firstName: string; lastName: string };
}

// ---- checkin-mobile : QR rotatif (TOTP) affiché par le téléphone de
// l'employé et scanné par checkin-pos — voir RotatingQrService côté backend ----

export interface RotatingQrCode {
  payload: string; // à passer tel quel dans le QR ; encode { userId, code }
  validUntil: string;
}

// ---- GET /geocoding/search, GET /geocoding/reverse (managers/admins) ----

export interface GeocodeCandidate {
  label: string;
  lat: number;
  lng: number;
}

// ---- GET /sites/:id/presence (managers/admins uniquement) ----

export interface PresentEmployee {
  id: string;
  firstName: string;
  lastName: string;
  since: string;
  source: TimeEntrySource;
  geoLat: number | null;
  geoLng: number | null;
  // null si source !== 'gps', ou si le site n'a pas de coordonnées déclarées.
  distanceFromSiteMeters: number | null;
}
