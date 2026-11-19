import type {
  AuditEntry,
  CompanyDetail,
  CompanyRow,
  DeviceRow,
  Health,
  Overview,
  PlatformAdmin,
  Subscription,
  SubscriptionUpdate,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// sessionStorage (pas localStorage) : la session de la console disparaît à la
// fermeture de l'onglet — elle voit toutes les entreprises.
const TOKEN_KEY = 'checkinapp_platform_token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Stockage indisponible : la session ne survivra pas au rechargement.
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && path !== '/platform/auth/login') {
    onUnauthorized?.();
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const message = Array.isArray(error.message) ? error.message.join(', ') : error.message;
    throw new ApiError(message ?? `Erreur API (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; admin: PlatformAdmin }>('POST', '/platform/auth/login', { email, password }),
  me: () => request<PlatformAdmin>('GET', '/platform/auth/me'),
  overview: () => request<Overview>('GET', '/platform/overview'),
  companies: () => request<CompanyRow[]>('GET', '/platform/companies'),
  company: (id: string) => request<CompanyDetail>('GET', `/platform/companies/${id}`),
  updateSubscription: (id: string, update: SubscriptionUpdate) =>
    request<Subscription>('PATCH', `/platform/companies/${id}/subscription`, update),
  devices: () => request<DeviceRow[]>('GET', '/platform/devices'),
  health: () => request<Health>('GET', '/platform/health'),
  audit: () => request<AuditEntry[]>('GET', '/platform/audit'),
};
