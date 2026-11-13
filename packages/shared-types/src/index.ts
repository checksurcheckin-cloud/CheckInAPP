// Types partagés entre backend, checkin-mobile, checkin-pos et web-manager.
// Reflètent le schéma Prisma — à garder synchronisé manuellement pour l'instant
// (on pourra générer ce fichier automatiquement depuis Prisma plus tard si besoin).

export type UserRole = 'admin' | 'manager' | 'employee';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type ShiftStatus = 'draft' | 'published' | 'cancelled';

// Public d'un créneau libre sur le marché : 'site' = employés du magasin du
// shift (défaut), sinon choisi par le manager.
export type MarketScope = 'site' | 'all_sites' | 'sites' | 'employees';

export interface ProposeShiftOnMarketPayload {
  scope: MarketScope;
  siteIds?: string[]; // requis pour 'sites'
  userIds?: string[]; // requis pour 'employees'
}
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
  // Pointage depuis l'app mobile (QR rotatif + GPS) — désactivé, l'onglet
  // Pointage disparaît de checkin-mobile.
  mobileClockInEnabled: boolean;
  // Commission paritaire ("302", "201"…) : règles de conformité du planning.
  jointCommittee?: string | null;
  // Création des horaires : libre, ou seulement d'après les besoins de l'admin.
  planningMode?: PlanningMode;
  createdAt: string;
}

export type PlanningMode = 'free' | 'needs';

// ---- Besoins journaliers en personnel (page Besoins, admin) ----
// Heures locales du site ; fin avant début = shift de nuit.
export interface StaffingNeedLine {
  startTime: string; // "HH:mm"
  endTime: string;
  roleNeeded: string | null;
  count: number;
}

export interface SiteStaffingNeeds {
  // Semaine type, lundi = 0.
  weekly: { dayOfWeek: number; needs: StaffingNeedLine[] }[];
  // Exceptions par date (liste vide = jour fermé).
  dates: { date: string; needs: StaffingNeedLine[] }[];
}

export interface ResolvedStaffingDay {
  date: string; // YYYY-MM-DD
  source: 'weekly' | 'date';
  needs: StaffingNeedLine[];
}

// Périmètre magasins de l'utilisateur connecté (manager limité à certains
// magasins, ou tous).
export interface SiteScope {
  allSites: boolean;
  siteIds: string[];
}

// Réglages de pointage résolus pour l'utilisateur connecté (surcharge
// individuelle > réglage entreprise ; GPS jamais actif sans pointage mobile).
export interface ClockInSettings {
  mobileClockInEnabled: boolean;
  gpsClockInEnabled: boolean;
}

export interface Site {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  geoLat?: number;
  geoLng?: number;
  timezone: string;
  // Commission paritaire propre au site — null = celle de l'entreprise.
  jointCommittee?: string | null;
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
  // Même principe pour le pointage depuis l'app mobile.
  mobileClockInEnabled?: boolean | null;
  // Magasins gérés par un manager — vide = tous les magasins.
  managedSites?: { siteId: string }[];
  // Site de rattachement, optionnel — null = pas encore assigné, reste
  // visible sur tous les sites de la grille planning (voir CLAUDE.md
  // décision #25).
  siteId?: string | null;
  // Contrat — contrôles de conformité du planning (null = non renseigné).
  contractType?: ContractType | null;
  weeklyContractHours?: number | null;
  birthDate?: string | null; // "YYYY-MM-DD…"
  // pas de pinCodeHash exposé côté client par défaut
}

export type ContractType = 'full_time' | 'part_time' | 'student' | 'flexi_job';

// ---- Conformité du planning au droit du travail belge (GET /compliance) ----
// Avertissements, jamais bloquants. `error` = interdit sans dérogation
// spécifique, `warning` = à vérifier, `info` = rappel.
export type ComplianceSeverity = 'error' | 'warning' | 'info';

export interface ComplianceViolation {
  ruleId: string;
  severity: ComplianceSeverity;
  userId: string;
  shiftIds: string[];
  date: string; // jour local (YYYY-MM-DD), ou lundi de la semaine
  message: string;
  legalRef: string;
  // La valeur sectorielle utilisée reste à faire valider.
  toValidate?: boolean;
}

export interface ComplianceReport {
  violations: ComplianceViolation[];
  // Employés planifiés sans contrat renseigné (contrôlés comme temps plein majeur).
  missingContract: string[];
}

export interface JointCommittee {
  code: string;
  label: string;
  toValidate: string[];
  sources: string[];
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
  marketScope?: MarketScope;
  marketSiteIds?: string[];
  marketUserIds?: string[];
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

// ---- GET /shift-offers : Marché de shifts ----
// Deux sortes d'entrées :
// - 'swap' : un collègue cède son shift assigné (ShiftOffer) ;
// - 'open_shift' : un shift publié resté sans titulaire (ligne « Shifts
//   disponibles » du planning), du magasin de l'appelant.
// Les deux se candidatent et se valident de la même façon côté écran ; le
// client API choisit la bonne route selon `kind` (applyToMarketEntry, etc.).
export type MarketEntryKind = 'swap' | 'open_shift';

export interface OpenShiftOffer {
  kind: MarketEntryKind;
  id: string; // 'swap' : id de l'offre ; 'open_shift' : id du shift
  shiftId: string;
  shift: Shift;
  offeredBy: string | null; // employé qui cède le shift — null pour 'open_shift'
  createdAt: string | null; // date de l'offre — null pour 'open_shift'
  hasApplied: boolean; // l'appelant a déjà candidaté sur cette entrée
}

// ---- GET /shift-offers/pending : page "Échanges à valider" (web-manager) ----
// 'swap' : toutes les offres ouvertes, même sans candidat ; 'open_shift' :
// seulement les créneaux libres qui ont au moins un candidat.
export interface PendingShiftOffer {
  kind: MarketEntryKind;
  id: string;
  shiftId: string;
  shift: Shift;
  offeredBy: string | null;
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

// ---- checkin-pos : annuaire du kiosk (GET /site-devices/employees) — l'employé
// choisit son nom puis tape son PIN, comme un login classique ----
export interface KioskEmployee {
  id: string;
  firstName: string;
  lastName: string;
}

// GET /users/:id/pin, GET /users/me/pin, POST /users/:id/pin/regenerate —
// null = compte sans PIN consultable (à régénérer).
export interface UserPin {
  pin: string | null;
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

// 'left' = a pointé aujourd'hui mais est reparti (dernier pointage clock_out).
export type PresenceStatus = 'present' | 'on_break' | 'left';

export interface PresenceTimeEntry {
  type: TimeEntryType;
  timestamp: string;
  source: TimeEntrySource;
}

export interface PresentEmployee {
  id: string;
  firstName: string;
  lastName: string;
  status: PresenceStatus;
  // Dernier clock_in (début de la session en cours, ou de la dernière).
  since: string;
  // Début de la pause en cours, null si status !== 'on_break'.
  breakSince: string | null;
  // Pointages de la journée (jour civil du site), ordre chronologique — inclut
  // l'arrivée de la veille si la session était encore ouverte à minuit.
  entries: PresenceTimeEntry[];
  source: TimeEntrySource;
  geoLat: number | null;
  geoLng: number | null;
  // null si source !== 'gps', ou si le site n'a pas de coordonnées déclarées.
  distanceFromSiteMeters: number | null;
}

// Notification de la cloche (checkin-mobile). Titre et texte sont rédigés
// par le backend à l'envoi, en français, prêts à afficher.
export type NotificationType = 'shift_assigned' | 'application_accepted' | 'shift_available';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  shiftId: string | null;
  // « Nouveaux shifts » regroupés par semaine ISO ("2026-W47") : nombre de
  // shifts que résume la notification (1 pour les autres types).
  groupKey: string | null;
  groupCount: number;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  // Les 50 plus récentes.
  items: AppNotification[];
  unreadCount: number;
}
