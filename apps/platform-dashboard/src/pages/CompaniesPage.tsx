import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { PLAN_LABELS, STATUS_LABELS, formatDate, timeAgo } from '../lib/format';
import type { SubscriptionPlan, SubscriptionStatus } from '../lib/types';
import { PageHeader, QueryState, StatusBadge } from '../components/ui';

type StatusFilter = SubscriptionStatus | 'none' | '';

export function CompaniesPage() {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({ queryKey: ['companies'], queryFn: api.companies });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (!term || c.name.toLowerCase().includes(term)) &&
        (!status || (c.subscription?.status ?? 'none') === status),
    );
  }, [data, search, status]);

  return (
    <div>
      <PageHeader title="Entreprises" subtitle={data ? `${data.length} entreprise${data.length > 1 ? 's' : ''} cliente${data.length > 1 ? 's' : ''}` : undefined} />
      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input placeholder="Rechercher une entreprise" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="">Tous les abonnements</option>
          {(Object.keys(STATUS_LABELS) as (SubscriptionStatus | 'none')[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <QueryState isPending={isPending} error={error} />
      {data ? (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Abonnement</th>
                <th className="num">Utilisateurs</th>
                <th className="num">Sites</th>
                <th className="num">Tablettes</th>
                <th>Dernière activité</th>
                <th>Inscrite le</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/companies/${c.id}`)}>
                  <td className="strong">{c.name}</td>
                  <td>
                    <div className="cell-stack">
                      <StatusBadge status={c.subscription?.status} />
                      {c.subscription ? (
                        <span className="muted small">{PLAN_LABELS[c.subscription.plan as SubscriptionPlan] ?? c.subscription.plan}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="num">{c.counts.activeUsers}</td>
                  <td className="num">{c.counts.sites}</td>
                  <td className="num">{c.counts.devices}</td>
                  <td>{timeAgo(c.lastActivityAt)}</td>
                  <td>{formatDate(c.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted empty-row">
                    Aucune entreprise ne correspond.
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
