import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime, formatDuration } from '../lib/format';
import { Badge, PageHeader, QueryState, StatCard } from '../components/ui';

export function HealthPage() {
  const { data, isPending, error, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Santé du backend"
        subtitle={dataUpdatedAt ? `Vérifié ${formatDateTime(new Date(dataUpdatedAt).toISOString())} · actualisé toutes les 30 s` : undefined}
        actions={data ? <Badge tone={data.status === 'ok' ? 'success' : 'danger'}>{data.status === 'ok' ? 'Opérationnel' : 'Dégradé'}</Badge> : null}
      />
      <QueryState isPending={isPending} error={error} />
      {data ? (
        <>
          <div className="stats">
            <StatCard
              label="Base de données"
              value={data.database.ok ? `${data.database.latencyMs} ms` : 'Injoignable'}
              hint="temps de réponse"
            />
            <StatCard label="En service depuis" value={formatDuration(data.uptimeSeconds)} hint={`Node ${data.nodeVersion}`} />
            <StatCard label="Mémoire" value={`${data.memoryMb} Mo`} hint="utilisée par le serveur" />
            <StatCard label="Téléphones (push)" value={data.push.registeredPhones ?? '—'} hint={`${data.push.notificationsLast24h ?? '—'} notifications en 24 h`} />
          </div>
          <div className="grid-2">
            <section className="card">
              <h2>Migrations</h2>
              <ul className="list compact">
                <li>
                  <span>Appliquées</span>
                  <span className="strong">{data.database.appliedMigrations ?? '—'}</span>
                </li>
                <li>
                  <span>Dernière</span>
                  <span className="strong mono">{data.database.lastMigration ?? '—'}</span>
                </li>
              </ul>
            </section>
            <section className="card">
              <h2>Configuration</h2>
              <ul className="list compact">
                <li>
                  <span>Clé de chiffrement des PIN</span>
                  <Badge tone={data.config.pinEncryptionKey ? 'success' : 'danger'}>
                    {data.config.pinEncryptionKey ? 'Présente' : 'Manquante'}
                  </Badge>
                </li>
                <li>
                  <span>Jeton Expo (push sécurisé)</span>
                  <Badge tone={data.config.expoAccessToken ? 'success' : 'muted'}>
                    {data.config.expoAccessToken ? 'Présent' : 'Facultatif, absent'}
                  </Badge>
                </li>
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
