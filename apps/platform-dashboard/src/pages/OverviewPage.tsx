import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { STATUS_LABELS, STATUS_TONES, formatDate } from '../lib/format';
import type { SubscriptionStatus } from '../lib/types';
import { PageHeader, QueryState, StatCard, StatusBadge } from '../components/ui';

const STATUS_ORDER: (SubscriptionStatus | 'none')[] = ['active', 'trialing', 'past_due', 'suspended', 'canceled', 'none'];

export function OverviewPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['overview'], queryFn: api.overview, refetchInterval: 60_000 });

  return (
    <div>
      <PageHeader title="Vue d'ensemble" subtitle="Toutes les entreprises clientes" />
      <QueryState isPending={isPending} error={error} />
      {data ? (
        <>
          <div className="stats">
            <StatCard label="Entreprises" value={data.companies.total} hint={`${data.sites} site${data.sites > 1 ? 's' : ''}`} />
            <StatCard
              label="Utilisateurs actifs"
              value={data.users.active}
              hint={`dont ${data.users.activeEmployees} employé${data.users.activeEmployees > 1 ? 's' : ''}`}
            />
            <StatCard label="Tablettes en ligne" value={`${data.devices.online} / ${data.devices.total}`} hint="actives ces 10 dernières minutes" />
            <StatCard label="Pointages aujourd'hui" value={data.activity.clockInsToday} hint="arrivées enregistrées" />
            <StatCard label="Shifts publiés" value={data.activity.publishedShiftsNext7Days} hint="dans les 7 prochains jours" />
          </div>

          <div className="grid-2">
            <section className="card">
              <h2>Abonnements</h2>
              <div className="bars">
                {STATUS_ORDER.map((status) => {
                  const count = data.companies.bySubscriptionStatus[status] ?? 0;
                  const pct = data.companies.total ? (count / data.companies.total) * 100 : 0;
                  return (
                    <div key={status} className="bar-row">
                      <span className="bar-label">{STATUS_LABELS[status]}</span>
                      <span className="bar-track">
                        <span className={`bar-fill tone-${STATUS_TONES[status]}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="bar-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <h2>Dernières entreprises inscrites</h2>
              {data.recentCompanies.length === 0 ? (
                <p className="muted">Aucune entreprise pour l’instant.</p>
              ) : (
                <ul className="list">
                  {data.recentCompanies.map((c) => (
                    <li key={c.id}>
                      <Link to={`/companies/${c.id}`} className="list-link">
                        <span className="strong">{c.name}</span>
                        <span className="muted small">{formatDate(c.createdAt)}</span>
                      </Link>
                      <StatusBadge status={c.subscription?.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
