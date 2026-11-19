import React from 'react';
import { STATUS_LABELS, STATUS_TONES } from '../lib/format';
import type { SubscriptionStatus } from '../lib/types';

export function Badge({ tone, children }: { tone: 'info' | 'success' | 'warning' | 'danger' | 'muted'; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: SubscriptionStatus | null | undefined }) {
  const key = status ?? 'none';
  return <Badge tone={STATUS_TONES[key]}>{STATUS_LABELS[key]}</Badge>;
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span className={`online ${online ? 'online-on' : 'online-off'}`}>
      <span className="online-dot" />
      {online ? 'En ligne' : 'Hors ligne'}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

// États communs des pages : chargement et erreur de requête.
export function QueryState({ isPending, error }: { isPending: boolean; error: Error | null }) {
  if (isPending) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">Impossible de charger les données : {error.message}</p>;
  return null;
}
