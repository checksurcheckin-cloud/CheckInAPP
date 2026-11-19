import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PLAN_LABELS, STATUS_LABELS, formatDateTime } from '../lib/format';
import type { AuditEntry, Subscription, SubscriptionPlan } from '../lib/types';
import { PageHeader, QueryState } from '../components/ui';

// « Pro → Entreprise · Actif → Suspendu » à partir de l'avant/après stocké.
function describeChange(entry: AuditEntry): string {
  if (entry.action !== 'subscription.update') return entry.action;
  const { before, after } = (entry.payload ?? {}) as { before?: Subscription | null; after?: Subscription | null };
  const changes: string[] = [];
  const plan = (p?: string) => (p ? PLAN_LABELS[p as SubscriptionPlan] ?? p : '—');
  if (before?.plan !== after?.plan) changes.push(`formule ${plan(before?.plan)} → ${plan(after?.plan)}`);
  if (before?.status !== after?.status) {
    changes.push(`statut ${before?.status ? STATUS_LABELS[before.status] : '—'} → ${after?.status ? STATUS_LABELS[after.status] : '—'}`);
  }
  if (before?.seats !== after?.seats) changes.push(`employés prévus ${before?.seats ?? '—'} → ${after?.seats ?? '—'}`);
  if (before?.notes !== after?.notes) changes.push('notes modifiées');
  if (before?.trialEndsAt !== after?.trialEndsAt || before?.currentPeriodEnd !== after?.currentPeriodEnd) changes.push('dates modifiées');
  return changes.length > 0 ? `Abonnement : ${changes.join(' · ')}` : 'Abonnement enregistré sans changement';
}

export function AuditPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['audit'], queryFn: api.audit });

  return (
    <div>
      <PageHeader title="Journal" subtitle="Les 100 dernières modifications faites depuis la console" />
      <QueryState isPending={isPending} error={error} />
      {data ? (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Par</th>
                <th>Modification</th>
                <th>Entreprise</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted">{formatDateTime(entry.createdAt)}</td>
                  <td>
                    <div className="cell-stack">
                      <span className="strong">{entry.admin.name}</span>
                      <span className="muted small">{entry.admin.email}</span>
                    </div>
                  </td>
                  <td>{describeChange(entry)}</td>
                  <td>{entry.targetType === 'company' && entry.targetId ? <Link to={`/companies/${entry.targetId}`}>Voir</Link> : '—'}</td>
                </tr>
              ))}
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted empty-row">
                    Aucune modification pour l’instant.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
