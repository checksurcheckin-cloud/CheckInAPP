import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { OnlineBadge, PageHeader, QueryState } from '../components/ui';

type Filter = 'all' | 'online' | 'offline';

export function DevicesPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['devices'], queryFn: api.devices, refetchInterval: 60_000 });
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () => (data ?? []).filter((d) => filter === 'all' || (filter === 'online' ? d.online : !d.online)),
    [data, filter],
  );
  const online = data?.filter((d) => d.online).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Tablettes"
        subtitle={data ? `${online} en ligne sur ${data.length} — en ligne = activité dans les 10 dernières minutes` : undefined}
      />
      <div className="toolbar">
        <div className="segmented">
          {(['all', 'online', 'offline'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Toutes' : f === 'online' ? 'En ligne' : 'Hors ligne'}
            </button>
          ))}
        </div>
      </div>
      <QueryState isPending={isPending} error={error} />
      {data ? (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Tablette</th>
                <th>Entreprise</th>
                <th>Site</th>
                <th>État</th>
                <th>Dernière activité</th>
                <th>QR renouvelé</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="strong">{d.label}</td>
                  <td>
                    <Link to={`/companies/${d.company.id}`}>{d.company.name}</Link>
                  </td>
                  <td>{d.site.name}</td>
                  <td>
                    <OnlineBadge online={d.online} />
                  </td>
                  <td>{timeAgo(d.lastSeenAt)}</td>
                  <td className="muted">{formatDateTime(d.qrRotatedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted empty-row">
                    Aucune tablette.
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
