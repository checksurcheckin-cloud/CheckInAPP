// Réponses de /platform/* (apps/backend/src/platform/platform.service.ts).
// Dates en chaînes ISO (JSON).

export type PlatformRole = 'owner' | 'admin' | 'readonly';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
export type SubscriptionPlan = 'trial' | 'starter' | 'pro' | 'enterprise';

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
}

export interface Subscription {
  plan: string;
  status: SubscriptionStatus;
  seats: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface Overview {
  companies: { total: number; bySubscriptionStatus: Record<SubscriptionStatus | 'none', number> };
  users: { active: number; activeEmployees: number };
  sites: number;
  devices: { total: number; online: number };
  activity: { clockInsToday: number; publishedShiftsNext7Days: number };
  recentCompanies: { id: string; name: string; createdAt: string; subscription: Subscription | null }[];
}

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: string;
  jointCommittee: string | null;
  subscription: Subscription | null;
  counts: { activeUsers: number; sites: number; devices: number };
  lastActivityAt: string | null;
}

export interface DeviceSummary {
  id: string;
  label: string;
  lastSeenAt: string | null;
  online: boolean;
  qrRotatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
  admin: { id: string; name: string; email: string };
}

export interface CompanyDetail {
  id: string;
  name: string;
  createdAt: string;
  jointCommittee: string | null;
  planningMode: string;
  settings: { gpsClockInEnabled: boolean; mobileClockInEnabled: boolean };
  subscription: Subscription | null;
  admins: { id: string; firstName: string; lastName: string; email: string; status: string }[];
  usersByRole: { role: string; status: string; count: number }[];
  sites: { id: string; name: string; address: string | null; timezone: string | null; devices: DeviceSummary[] }[];
  activity: { clockInsLast7Days: number; publishedShiftsNext7Days: number; lastActivityAt: string | null };
  audit: AuditEntry[];
}

export interface DeviceRow extends DeviceSummary {
  site: { id: string; name: string };
  company: { id: string; name: string };
}

export interface Health {
  status: 'ok' | 'degraded';
  checkedAt: string;
  uptimeSeconds: number;
  nodeVersion: string;
  memoryMb: number;
  database: { ok: boolean; latencyMs: number | null; appliedMigrations: number | null; lastMigration: string | null };
  config: { pinEncryptionKey: boolean; expoAccessToken: boolean };
  push: { registeredPhones: number | null; notificationsLast24h: number | null };
}

export interface SubscriptionUpdate {
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  seats?: number | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  notes?: string | null;
}
