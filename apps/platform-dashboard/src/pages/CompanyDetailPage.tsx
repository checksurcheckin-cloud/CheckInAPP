import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  PLAN_LABELS,
  STATUS_LABELS,
  USER_ROLE_LABELS,
  formatDate,
  formatDateTime,
  fromDateInput,
  timeAgo,
  toDateInput,
} from '../lib/format';
import type { CompanyDetail, Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionUpdate } from '../lib/types';
import { OnlineBadge, PageHeader, QueryState, StatCard, StatusBadge } from '../components/ui';

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { data, isPending, error } = useQuery({ queryKey: ['company', id], queryFn: () => api.company(id) });

  return (
    <div>
      <Link to="/companies" className="back-link">
        <ArrowLeft size={15} />
        Entreprises
      </Link>
      <QueryState isPending={isPending} error={error} />
      {data ? <CompanyView company={data} /> : null}
    </div>
  );
}

function CompanyView({ company }: { company: CompanyDetail }) {
  const activeUsers = company.usersByRole.filter((r) => r.status === 'active');
  const devices = company.sites.flatMap((s) => s.devices);

  return (
    <>
      <PageHeader
        title={company.name}
        subtitle={`Inscrite le ${formatDate(company.createdAt)}${company.jointCommittee ? ` · CP ${company.jointCommittee}` : ''}`}
        actions={<StatusBadge status={company.subscription?.status} />}
      />

      <div className="stats">
        {['admin', 'manager', 'employee'].map((role) => (
          <StatCard
            key={role}
            label={USER_ROLE_LABELS[role]}
            value={activeUsers.find((r) => r.role === role)?.count ?? 0}
            hint="comptes actifs"
          />
        ))}
        <StatCard label="Pointages (7 j)" value={company.activity.clockInsLast7Days} hint={`dernière activité : ${timeAgo(company.activity.lastActivityAt)}`} />
        <StatCard
          label="Tablettes en ligne"
          value={`${devices.filter((d) => d.online).length} / ${devices.length}`}
          hint={`${company.sites.length} site${company.sites.length > 1 ? 's' : ''}`}
        />
      </div>

      <div className="grid-2">
        <SubscriptionCard companyId={company.id} subscription={company.subscription} />

        <section className="card">
          <h2>Contacts (admins de l’entreprise)</h2>
          {company.admins.length === 0 ? (
            <p className="muted">Aucun admin.</p>
          ) : (
            <ul className="list">
              {company.admins.map((a) => (
                <li key={a.id}>
                  <div className="cell-stack">
                    <span className="strong">
                      {a.firstName} {a.lastName}
                    </span>
                    <a href={`mailto:${a.email}`} className="small">
                      {a.email}
                    </a>
                  </div>
                  {a.status !== 'active' ? <span className="muted small">{a.status}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt">Réglages</h2>
          <ul className="list compact">
            <li>
              <span>Mode de planning</span>
              <span className="strong">{company.planningMode === 'needs' ? 'Par besoins' : 'Libre'}</span>
            </li>
            <li>
              <span>Pointage mobile</span>
              <span className="strong">{company.settings.mobileClockInEnabled ? 'Activé' : 'Désactivé'}</span>
            </li>
            <li>
              <span>Pointage GPS</span>
              <span className="strong">{company.settings.gpsClockInEnabled ? 'Activé' : 'Désactivé'}</span>
            </li>
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>Sites et tablettes</h2>
        {company.sites.length === 0 ? (
          <p className="muted">Aucun site.</p>
        ) : (
          <div className="sites">
            {company.sites.map((site) => (
              <div key={site.id} className="site">
                <div className="site-head">
                  <span className="strong">{site.name}</span>
                  <span className="muted small">{site.address ?? 'Adresse non renseignée'}</span>
                </div>
                {site.devices.length === 0 ? (
                  <p className="muted small">Aucune tablette.</p>
                ) : (
                  <ul className="list compact">
                    {site.devices.map((d) => (
                      <li key={d.id}>
                        <span>{d.label}</span>
                        <span className="cell-inline">
                          <span className="muted small">{timeAgo(d.lastSeenAt)}</span>
                          <OnlineBadge online={d.online} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Historique de la console</h2>
        {company.audit.length === 0 ? (
          <p className="muted">Aucune modification depuis la console.</p>
        ) : (
          <ul className="list">
            {company.audit.map((entry) => (
              <li key={entry.id}>
                <span>
                  <span className="strong">{entry.admin.name}</span> — {entry.action === 'subscription.update' ? 'abonnement modifié' : entry.action}
                </span>
                <span className="muted small">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

type FormState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  seats: string;
  trialEndsAt: string;
  currentPeriodEnd: string;
  notes: string;
};

function toForm(subscription: Subscription | null): FormState {
  return {
    plan: (subscription?.plan as SubscriptionPlan) ?? 'trial',
    status: subscription?.status ?? 'trialing',
    seats: subscription?.seats != null ? String(subscription.seats) : '',
    trialEndsAt: toDateInput(subscription?.trialEndsAt),
    currentPeriodEnd: toDateInput(subscription?.currentPeriodEnd),
    notes: subscription?.notes ?? '',
  };
}

function SubscriptionCard({ companyId, subscription }: { companyId: string; subscription: Subscription | null }) {
  const { admin } = useAuth();
  const canEdit = admin?.role === 'owner' || admin?.role === 'admin';
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(subscription));
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(toForm(subscription)), [subscription]);

  const mutation = useMutation({
    mutationFn: (update: SubscriptionUpdate) => api.updateSubscription(companyId, update),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      plan: form.plan,
      status: form.status,
      seats: form.seats === '' ? null : Number(form.seats),
      trialEndsAt: fromDateInput(form.trialEndsAt),
      currentPeriodEnd: fromDateInput(form.currentPeriodEnd),
      notes: form.notes.trim() || null,
    });
  };

  return (
    <section className="card">
      <h2>Abonnement</h2>
      {!subscription ? <p className="muted small">Jamais configuré : l’entreprise est considérée en essai.</p> : null}
      <form className="form" onSubmit={submit}>
        <fieldset disabled={!canEdit || mutation.isPending}>
          <div className="form-row">
            <label>
              Formule
              <select value={form.plan} onChange={(e) => update('plan', e.target.value as SubscriptionPlan)}>
                {(Object.keys(PLAN_LABELS) as SubscriptionPlan[]).map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Statut
              <select value={form.status} onChange={(e) => update('status', e.target.value as SubscriptionStatus)}>
                {(['trialing', 'active', 'past_due', 'suspended', 'canceled'] as SubscriptionStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Employés prévus
              <input type="number" min={0} value={form.seats} onChange={(e) => update('seats', e.target.value)} placeholder="—" />
            </label>
            <label>
              Fin d’essai
              <input type="date" value={form.trialEndsAt} onChange={(e) => update('trialEndsAt', e.target.value)} />
            </label>
            <label>
              Fin de période
              <input type="date" value={form.currentPeriodEnd} onChange={(e) => update('currentPeriodEnd', e.target.value)} />
            </label>
          </div>
          <label>
            Notes internes
            <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} maxLength={1000} />
          </label>
        </fieldset>
        {canEdit ? (
          <div className="form-actions">
            {mutation.error ? <span className="error">{mutation.error.message}</span> : null}
            {saved && !mutation.isPending ? <span className="success">Enregistré</span> : null}
            <button className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        ) : (
          <p className="muted small">Lecture seule : votre rôle ne permet pas de modifier l’abonnement.</p>
        )}
        <p className="muted small">
          Les statuts « Suspendu » et « Résilié » ne bloquent pas encore l’accès de l’entreprise.
        </p>
      </form>
    </section>
  );
}
