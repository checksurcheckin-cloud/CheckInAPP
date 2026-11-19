import type { PlatformRole, SubscriptionPlan, SubscriptionStatus } from './types';

export const STATUS_LABELS: Record<SubscriptionStatus | 'none', string> = {
  trialing: 'Essai',
  active: 'Actif',
  past_due: 'Paiement en retard',
  suspended: 'Suspendu',
  canceled: 'Résilié',
  none: 'Non configuré',
};

// Couleur de pastille par statut (classe CSS badge-*).
export const STATUS_TONES: Record<SubscriptionStatus | 'none', 'info' | 'success' | 'warning' | 'danger' | 'muted'> = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  canceled: 'muted',
  none: 'muted',
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  trial: 'Essai',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Entreprise',
};

export const ROLE_LABELS: Record<PlatformRole, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  readonly: 'Lecture seule',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: 'Admins',
  manager: 'Managers',
  employee: 'Employés',
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// « il y a 5 min », « il y a 3 j » — pour l'activité et les tablettes.
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Jamais';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Il y a ${days} j`;
  return formatDate(iso);
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

// Date ISO -> valeur d'un <input type="date"> (et inversement).
export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function fromDateInput(value: string): string | null {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}
