import React, { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { PendingShiftOffer, Site, User } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient, useAuth } from '../services/AuthService';
import { Dialog } from '../components/Dialog';

// Page "Échanges à valider" : toutes les offres encore ouvertes du marché de
// shifts, candidatures comprises — y compris celles sans aucun candidat, pour
// que le manager voie ce qui reste sans preneur, pas seulement ce qui est
// prêt à valider. Plusieurs collègues peuvent candidater sur la même offre ;
// le manager choisit lequel approuver dans le menu déroulant.
export function ShiftApprovalPage() {
  const { socket } = useAuth();
  const [offers, setOffers] = useState<PendingShiftOffer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Candidat sélectionné dans le menu déroulant, par offre — par défaut le
  // premier candidat s'il y en a (voir load()).
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [offerList, userList, siteList] = await Promise.all([
      apiClient.getPendingShiftOffers(),
      apiClient.getUsers(),
      apiClient.getSites(),
    ]);
    setUsers(userList);
    setSites(siteList);
    setOffers(offerList);
    setSelectedCandidate((current) => {
      const next = { ...current };
      for (const offer of offerList) {
        if (!next[offer.id] && offer.candidates.length > 0) {
          next[offer.id] = offer.candidates[0].userId;
        }
      }
      return next;
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Un employé peut candidater (ou un autre manager valider/rejeter) pendant
  // que cette page reste ouverte — voir realtime.gateway.ts.
  useEffect(() => {
    if (!socket) return;
    const onShiftsChanged = () => void load();
    socket.on('shifts:changed', onShiftsChanged);
    return () => {
      socket.off('shifts:changed', onShiftsChanged);
    };
  }, [socket, load]);

  const approve = async (offerId: string) => {
    const userId = selectedCandidate[offerId];
    if (!userId) return;
    setBusyId(offerId);
    try {
      await apiClient.approveShiftOffer(offerId, userId);
      await load();
    } catch (err) {
      // Le backend refuse (409) si le candidat choisi a depuis récupéré un
      // shift qui chevauche celui-ci dans le temps — sans ce catch, l'erreur
      // passait inaperçue et le bouton semblait ne rien faire pour la ligne.
      setErrorMessage(err instanceof ApiError ? err.message : "Impossible de valider cet échange");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await apiClient.rejectShiftOffer(offerId);
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
        <p style={styles.muted}>Aucune offre ouverte sur le marché de shifts actuellement.</p>
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
                  <td style={styles.td}>{userName(offer.offeredBy)}</td>
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
                        onClick={() => approve(offer.id)}
                        title={hasCandidates ? undefined : 'Aucun candidat à valider'}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        Valider
                      </button>
                      <button
                        className="btn"
                        style={styles.rejectButton}
                        disabled={busy}
                        onClick={() => reject(offer.id)}
                        title="Retirer cette offre du marché"
                      >
                        <X size={14} strokeWidth={2.5} />
                        Retirer
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
