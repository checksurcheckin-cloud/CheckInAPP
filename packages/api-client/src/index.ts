import type {
  AuthResponse,
  Availability,
  Company,
  DeviceAuthResponse,
  DeviceTimeEntryResult,
  GeocodeCandidate,
  OpenShiftOffer,
  PendingShiftOffer,
  PresentEmployee,
  RotatingQrCode,
  Shift,
  ShiftAssignment,
  ShiftOffer,
  ShiftOfferCandidate,
  Site,
  TimeEntry,
  User,
} from '@horaires/shared-types';

export { connectRealtime } from './realtime';
export type { Socket } from './realtime';

// Client HTTP typé partagé par checkin-mobile, checkin-pos et web-manager.
// But : écrire la logique d'appel API (gestion du token, des erreurs) une
// seule fois plutôt que de la dupliquer dans les 3 apps.

// Porte le status HTTP pour que les appelants distinguent un vrai rejet
// (401/403 → identifiants invalides) d'un souci réseau (à réessayer).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// React Native n'a pas toujours URLSearchParams disponible selon la version —
// on construit la query string à la main plutôt que d'en dépendre.
function toQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void; // ex: rediriger vers le login si le token a expiré
}

export class ApiClient {
  private baseUrl: string;
  private getAccessToken?: () => string | null;
  private onUnauthorized?: () => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = this.getAccessToken?.();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.onUnauthorized?.();
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new ApiError(errorBody.message ?? `Erreur API (${res.status})`, res.status);
    }

    // 204 (ex: DELETE /shifts/:id) n'a pas de corps — res.json() lèverait une
    // erreur de parsing sur une réponse vide et empêcherait tout code après
    // l'appel de s'exécuter (ex: le rechargement de la liste après suppression).
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  // ---- Auth ----
  login(email: string, password: string) {
    return this.request<AuthResponse>('POST', '/auth/login', { email, password });
  }

  register(payload: {
    companyName: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return this.request<AuthResponse>('POST', '/auth/register', payload);
  }

  refresh(refreshToken: string) {
    return this.request<AuthResponse>('POST', '/auth/refresh', { refreshToken });
  }

  // ---- Device (checkin-pos) — pas d'utilisateur connecté, le device
  // s'authentifie lui-même avec son qrSecret ----
  authenticateDevice(deviceId: string, qrSecret: string) {
    return this.request<DeviceAuthResponse>('POST', '/site-devices/authenticate', {
      deviceId,
      qrSecret,
    });
  }

  enrollBadge(pin: string, badgeCode: string) {
    return this.request<{ id: string; firstName: string; lastName: string; badgeCode: string }>(
      'POST',
      '/site-devices/enroll-badge',
      { pin, badgeCode },
    );
  }

  // Pas de `type` à fournir : le serveur bascule automatiquement
  // clock_in/clock_out selon le dernier pointage de l'employé sur ce site.
  clockInWithBadge(badgeCode: string) {
    return this.request<DeviceTimeEntryResult>('POST', '/time-entries/device', {
      source: 'badge_scan',
      badgeCode,
    });
  }

  clockInWithPin(pin: string) {
    return this.request<DeviceTimeEntryResult>('POST', '/time-entries/device', {
      source: 'pin_code',
      pin,
    });
  }

  // QR rotatif (TOTP) affiché par le téléphone de l'employé, scanné par la
  // tablette — `payload` est la chaîne brute lue par la caméra, transmise
  // telle quelle (décodée et vérifiée côté serveur).
  scanRotatingQr(payload: string) {
    return this.request<DeviceTimeEntryResult>('POST', '/time-entries/scan-rotating-qr', {
      payload,
    });
  }

  // ---- Entreprise ----
  getMyCompany() {
    return this.request<Company>('GET', '/companies/me');
  }

  // Réglage GPS par défaut de l'entreprise (admin uniquement).
  updateCompanySettings(payload: { gpsClockInEnabled: boolean }) {
    return this.request<Company>('PATCH', '/companies/me/settings', payload);
  }

  // ---- Sites ----
  getSites() {
    return this.request<Site[]>('GET', '/sites');
  }

  createSite(payload: { name: string; address?: string; geoLat?: number; geoLng?: number; timezone?: string }) {
    return this.request<Site>('POST', '/sites', payload);
  }

  updateSite(
    siteId: string,
    payload: Partial<{ name: string; address: string; geoLat: number; geoLng: number; timezone: string }>,
  ) {
    return this.request<Site>('PATCH', `/sites/${siteId}`, payload);
  }

  deleteSite(siteId: string) {
    return this.request<void>('DELETE', `/sites/${siteId}`);
  }

  // ---- Géocodage (managers/admins) ----
  // Adresse -> liste de coordonnées candidates, pour remplir la fiche d'un site.
  geocodeSearch(query: string) {
    return this.request<GeocodeCandidate[]>('GET', `/geocoding/search${toQueryString({ query })}`);
  }

  // Coordonnées -> adresse lisible, pour l'écran Présence quand le site n'a
  // pas de coordonnées enregistrées (fallback : coordonnées brutes affichées
  // telles quelles si le géocodage échoue).
  geocodeReverse(lat: number, lng: number) {
    return this.request<{ label: string | null }>(
      'GET',
      `/geocoding/reverse${toQueryString({ lat: String(lat), lng: String(lng) })}`,
    );
  }

  // ---- Utilisateurs (annuaire de l'entreprise — noms des collègues) ----
  // `siteId` optionnel : ne renvoie que les employés de ce site (plus ceux
  // sans site assigné, plus les managers/admins) — voir CLAUDE.md décision
  // #25. Omis, renvoie toute l'entreprise comme avant.
  getUsers(siteId?: string) {
    return this.request<User[]>('GET', `/users${toQueryString({ siteId })}`);
  }

  inviteUser(payload: { email: string; firstName: string; lastName: string; role?: string; siteId?: string }) {
    return this.request<User>('POST', '/users/invite', payload);
  }

  updateUserRole(userId: string, role: string) {
    return this.request<User>('PATCH', `/users/${userId}/role`, { role });
  }

  // Pas encore de flow "accepter l'invitation" — en attendant, un manager
  // peut faire passer un compte `invited` à `active` (ou `disabled`)
  // directement depuis la page Équipe.
  updateUserStatus(userId: string, status: string) {
    return this.request<User>('PATCH', `/users/${userId}/status`, { status });
  }

  regenerateBadge(userId: string) {
    return this.request<User>('POST', `/users/${userId}/badge/regenerate`);
  }

  setUserPin(userId: string, pin: string) {
    return this.request<{ ok: true }>('POST', `/users/${userId}/pin`, { pin });
  }

  // Surcharge individuelle du réglage GPS et/ou site de rattachement —
  // `gpsClockInEnabled: null` remet l'employé sur le réglage entreprise par
  // défaut, `siteId: null` le désassigne de tout site (redevient visible
  // partout, voir décision #25). Un champ omis reste inchangé côté backend.
  updateUserSettings(userId: string, payload: { gpsClockInEnabled?: boolean | null; siteId?: string | null }) {
    return this.request<User>('PATCH', `/users/${userId}/settings`, payload);
  }

  // Managers/admins uniquement — inclut désormais le mode de pointage et,
  // pour un pointage GPS, la distance par rapport au site.
  getPresence(siteId: string) {
    return this.request<PresentEmployee[]>('GET', `/sites/${siteId}/presence`);
  }

  // ---- Pointage (checkin-mobile — l'employé pointe pour lui-même) ----
  clockInWithGps(siteId: string, type: string, geoLat: number, geoLng: number) {
    return this.request<TimeEntry>('POST', '/time-entries/self', {
      source: 'gps',
      siteId,
      type,
      geoLat,
      geoLng,
    });
  }

  // Génère le QR rotatif de l'employé connecté (nouveau modèle : c'est la
  // tablette qui scanne, voir scanRotatingQr côté device).
  getMyRotatingQr() {
    return this.request<RotatingQrCode>('GET', '/users/me/rotating-qr');
  }

  getMyTimeEntries(params?: { userId?: string; from?: string; to?: string }) {
    return this.request<TimeEntry[]>('GET', `/time-entries${toQueryString(params)}`);
  }

  // ---- Shifts ----
  getShifts(params?: { siteId?: string; from?: string; to?: string }) {
    return this.request<Shift[]>('GET', `/shifts${toQueryString(params)}`);
  }

  // Écriture réservée en pratique à web-manager (choix produit — un manager
  // reste autorisé par son rôle quel que soit le client, voir CLAUDE.md).
  createShift(payload: {
    siteId: string;
    startsAt: string;
    endsAt: string;
    roleNeeded?: string;
    status?: string;
  }) {
    return this.request<Shift>('POST', '/shifts', payload);
  }

  updateShift(
    shiftId: string,
    payload: Partial<{
      siteId: string;
      startsAt: string;
      endsAt: string;
      roleNeeded: string;
      status: string;
    }>,
  ) {
    return this.request<Shift>('PATCH', `/shifts/${shiftId}`, payload);
  }

  deleteShift(shiftId: string) {
    return this.request<void>('DELETE', `/shifts/${shiftId}`);
  }

  assignShift(shiftId: string, userId: string) {
    return this.request<ShiftAssignment>('POST', `/shifts/${shiftId}/assign`, { userId });
  }

  // Marché de shifts : offres d'échange ouvertes des collègues (jamais les
  // siennes). Séparé de getShifts, qui ne renvoie que les shifts de l'employé.
  getOpenShiftOffers() {
    return this.request<OpenShiftOffer[]>('GET', '/shift-offers');
  }

  offerShiftAssignment(assignmentId: string) {
    return this.request<ShiftOffer>('POST', `/shift-assignments/${assignmentId}/offer`);
  }

  // Candidater sur une offre ouverte — plusieurs collègues peuvent le faire
  // pour la même offre, le manager choisit ensuite lequel approuver.
  applyToShiftOffer(offerId: string) {
    return this.request<ShiftOfferCandidate>('POST', `/shift-offers/${offerId}/accept`);
  }

  // Page "Échanges à valider" (managers/admins) : offres ouvertes de
  // l'entreprise, candidatures comprises (même vides).
  getPendingShiftOffers() {
    return this.request<PendingShiftOffer[]>('GET', '/shift-offers/pending');
  }

  approveShiftOffer(offerId: string, userId: string) {
    return this.request<ShiftAssignment>('POST', `/shift-offers/${offerId}/approve`, { userId });
  }

  rejectShiftOffer(offerId: string) {
    return this.request<ShiftAssignment>('POST', `/shift-offers/${offerId}/reject`);
  }

  // ---- Disponibilités ----
  getAvailabilities(userId?: string) {
    return this.request<Availability[]>('GET', `/availabilities${toQueryString({ userId })}`);
  }

  createAvailability(payload: {
    dayOfWeek?: number;
    specificDate?: string;
    startTime: string;
    endTime: string;
    isAvailable?: boolean;
  }) {
    return this.request<Availability>('POST', '/availabilities', payload);
  }

  updateAvailability(
    id: string,
    payload: Partial<{
      dayOfWeek: number;
      specificDate: string;
      startTime: string;
      endTime: string;
      isAvailable: boolean;
    }>,
  ) {
    return this.request<Availability>('PATCH', `/availabilities/${id}`, payload);
  }

  deleteAvailability(id: string) {
    return this.request<void>('DELETE', `/availabilities/${id}`);
  }
}
