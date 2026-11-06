import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { PendingShiftOffer, Site, User } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient } from '../services/AuthService';
import { queryKeys, usePendingOffers, useSiteScope, useUsers } from '../lib/queries';
import { Dialog } from '../components/Dialog';

const NO_OFFERS: PendingShiftOffer[] = [];
const NO_USERS: User[] = [];
const NO_SITES: Site[] = [];

// Page "Échanges à valider" : toutes les offres d'échange encore ouvertes du
// marché de shifts, candidatures comprises — y compris celles sans aucun
// candidat, pour que le manager voie ce qui reste sans preneur — plus les
// créneaux libres du planning (publiés sans titulaire) qui ont reçu au moins
// une candidature. Plusieurs employés peuvent candidater sur la même entrée ;
// le manager choisit lequel approuver dans le menu déroulant.
export function ShiftApprovalPage() {
  const queryClient = useQueryClient();
  // Un employé peut candidater (ou un autre manager valider/rejeter) pendant
  // que cette page reste ouverte : le signal `shifts:changed` recharge les
  // offres en cache (voir lib/queries.ts).
  const offersQuery = usePendingOffers();
  const usersQuery = useUsers();
  const scopeQuery = useSiteScope();
  const offers = offersQuery.data ?? NO_OFFERS;
  const users = usersQuery.data ?? NO_USERS;
  const sites = scopeQuery.data?.sites ?? NO_SITES;
  const isLoading = offersQuery.isPending || usersQuery.isPending || scopeQuery.isPending;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Candidat sélectionné dans le menu déroulant, par offre — par défaut le
  // premier candidat s'il y en a.
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedCandidate((current) => {
      const next = { ...current };
      for (const offer of offers) {
        if (!next[offer.id] && offer.candidates.length > 0) {
          next[offer.id] = offer.candidates[0].userId;
        }
      }
      return next;
    });
  }, [offers]);

  // Valider ou retirer une offre change aussi le planning (titulaire du shift).
  const load = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingOffers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.shifts }),
    ]);

  const approve = async (offer: PendingShiftOffer) => {
    const userId = selectedCandidate[offer.id];
    if (!userId) return;
    setBusyId(offer.id);
    try {
      await apiClient.approveMarketEntry(offer, userId);
      await load();
    } catch (err) {
      // Le backend refuse (409) si le candidat choisi a depuis récupéré un
      // shift qui chevauche celui-ci dans le temps, ou s'est déclaré
      // indisponible — sans ce catch, l'erreur passait inaperçue et le
      // bouton semblait ne rien faire pour la ligne.
      setErrorMessage(err instanceof ApiError ? err.message : "Impossible de valider cet échange");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (offer: PendingShiftOffer) => {
    setBusyId(offer.id);
    try {
      await apiClient.rejectMarketEntry(offer);
      await load();
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : "Impossible de retirer cette offre");
    } finally {
      setBusyId(null);
    }
  };

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId;
  const userName = (userId: string) => {
    const u = users.find((candidate) => candidate.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  };

  return (
    <div>
      <h1 style={styles.title}>Échanges à valider</h1>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : offers.length === 0 ? (
        <p style={styles.muted}>Aucun échange ni candidature à valider sur le marché de shifts actuellement.</p>
      ) : (
        <div style={styles.tableWrap}>
        <table className="data-table" style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Shift</th>
              <th style={styles.th}>Proposé par</th>
              <th style={styles.th}>Candidat</th>
              <th style={styles.th} />
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => {
              const busy = busyId === offer.id;
              const hasCandidates = offer.candidates.length > 0;
              return (
                <tr key={offer.id}>
                  <td style={styles.td}>
                    {siteName(offer.shift.siteId)} —{' '}
                    {new Date(offer.shift.startsAt).toLocaleString('fr-BE', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={styles.td}>
                    {offer.offeredBy ? userName(offer.offeredBy) : <span style={styles.openSlot}>Créneau libre</span>}
                  </td>
                  <td style={styles.td}>
                    {hasCandidates ? (
                      <select
                        style={styles.select}
                        value={selectedCandidate[offer.id] ?? ''}
                        onChange={(e) => setSelectedCandidate((prev) => ({ ...prev, [offer.id]: e.target.value }))}
                      >
                        {offer.candidates.map((c) => (
                          <option key={c.id} value={c.userId}>
                            {userName(c.userId)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={styles.noCandidate}>Aucun candidat pour l'instant</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button
                        className="btn"
                        style={styles.approveButton}
                        disabled={busy || !hasCandidates}
                        onClick={() => approve(offer)}
                        title={hasCandidates ? undefined : 'Aucun candidat à valider'}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        Valider
                      </button>
                      <button
                        className="btn"
                        style={styles.rejectButton}
                        disabled={busy}
                        onClick={() => reject(offer)}
                        title={
                          offer.kind === 'swap'
                            ? 'Retirer cette offre du marché'
                            : 'Refuser les candidatures (le créneau reste sur le marché)'
                        }
                      >
                        <X size={14} strokeWidth={2.5} />
                        {offer.kind === 'swap' ? 'Retirer' : 'Refuser'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <Dialog
        open={errorMessage !== null}
        variant="warning"
        title="Action impossible"
        message={errorMessage ?? ''}
        cancelLabel="Compris"
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, marginBottom: spacing.lg },
  muted: { color: colors.textSecondary },
  tableWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    overflowX: 'auto',
    boxShadow: shadows.sm,
  },
  table: { width: '100%', minWidth: 560, borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: spacing.sm,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  td: { padding: spacing.sm, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary },
  select: {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  noCandidate: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontStyle: 'italic' },
  openSlot: {
    fontSize: typography.sizes.sm,
    fontWeight: 600,
    color: colors.accent,
    backgroundColor: colors.accentTint,
    padding: `2px ${spacing.sm}px`,
    borderRadius: radius.full,
  },
  actions: { display: 'flex', gap: spacing.xs },
  approveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  rejectButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
