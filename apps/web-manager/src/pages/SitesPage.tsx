import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Search, Trash2, Pencil, X } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import type { GeocodeCandidate, Site } from '@horaires/shared-types';
import { apiClient } from '../services/AuthService';

type FormState = {
  name: string;
  address: string;
  geoLat: string;
  geoLng: string;
};

const EMPTY_FORM: FormState = { name: '', address: '', geoLat: '', geoLng: '' };

export function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busySiteId, setBusySiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      setSites(await apiClient.getSites());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingSiteId(null);
    setForm(EMPTY_FORM);
    setCandidates([]);
    setError(null);
  };

  const startEdit = (site: Site) => {
    setEditingSiteId(site.id);
    setForm({
      name: site.name,
      address: site.address ?? '',
      geoLat: site.geoLat != null ? String(site.geoLat) : '',
      geoLng: site.geoLng != null ? String(site.geoLng) : '',
    });
    setCandidates([]);
    setError(null);
  };

  // Cherche l'adresse tapée via le géocodage (Nominatim) plutôt que de faire
  // saisir des coordonnées GPS brutes au manager.
  const searchAddress = async () => {
    if (!form.address.trim()) return;
    setError(null);
    setIsSearching(true);
    try {
      const results = await apiClient.geocodeSearch(form.address.trim());
      setCandidates(results);
      if (results.length === 0) {
        setError("Aucune adresse trouvée — vous pouvez tout de même enregistrer le site sans coordonnées.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la recherche d\'adresse');
    } finally {
      setIsSearching(false);
    }
  };

  const pickCandidate = (candidate: GeocodeCandidate) => {
    setForm((prev) => ({
      ...prev,
      address: candidate.label,
      geoLat: String(candidate.lat),
      geoLng: String(candidate.lng),
    }));
    setCandidates([]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        geoLat: form.geoLat ? Number(form.geoLat) : undefined,
        geoLng: form.geoLng ? Number(form.geoLng) : undefined,
      };
      if (editingSiteId) {
        await apiClient.updateSite(editingSiteId, payload);
      } else {
        await apiClient.createSite(payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  };

  const removeSite = async (siteId: string) => {
    setBusySiteId(siteId);
    try {
      await apiClient.deleteSite(siteId);
      await load();
    } finally {
      setBusySiteId(null);
    }
  };

  return (
    <div>
      <h1 style={styles.title}>Sites</h1>

      <form style={styles.formCard} onSubmit={submit}>
        <h2 style={styles.sectionTitle}>{editingSiteId ? 'Modifier le site' : 'Ajouter un site'}</h2>

        <div style={styles.formRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Nom du site (ex: Magasin Namur Centre)"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div style={styles.formRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Adresse (ex: Rue de la Loi 16, 1000 Bruxelles)"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value, geoLat: '', geoLng: '' }))}
          />
          <button
            type="button"
            className="btn"
            style={styles.searchButton}
            onClick={searchAddress}
            disabled={isSearching || !form.address.trim()}
          >
            <Search size={14} strokeWidth={2.25} />
            {isSearching ? 'Recherche…' : 'Localiser'}
          </button>
        </div>

        {candidates.length > 0 ? (
          <div style={styles.candidateList}>
            {candidates.map((c) => (
              <button
                type="button"
                key={`${c.lat},${c.lng}`}
                style={styles.candidateItem}
                onClick={() => pickCandidate(c)}
              >
                <MapPin size={13} color={colors.primary} strokeWidth={2.25} />
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        {form.geoLat && form.geoLng ? (
          <p style={styles.coordsHint}>
            <MapPin size={13} color={colors.success} strokeWidth={2.25} />
            Coordonnées localisées : {Number(form.geoLat).toFixed(5)}, {Number(form.geoLng).toFixed(5)} — utilisées
            pour calculer la distance des pointages GPS sur ce site.
          </p>
        ) : (
          <p style={styles.muted}>
            Sans coordonnées, la distance du pointage GPS ne pourra pas être calculée sur l'écran Présence.
          </p>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.formActions}>
          <button className="btn btn-gradient" style={styles.submitButton} type="submit" disabled={isSaving || !form.name.trim()}>
            {editingSiteId ? <Pencil size={14} strokeWidth={2.25} /> : <Plus size={14} strokeWidth={2.25} />}
            {editingSiteId ? 'Enregistrer' : 'Créer le site'}
          </button>
          {editingSiteId ? (
            <button type="button" className="btn" style={styles.cancelButton} onClick={resetForm}>
              <X size={14} strokeWidth={2.25} />
              Annuler
            </button>
          ) : null}
        </div>
      </form>

      {isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : sites.length === 0 ? (
        <p style={styles.muted}>Aucun site enregistré.</p>
      ) : (
        <div style={styles.grid}>
          {sites.map((site) => (
            <div key={site.id} className="card-hover" style={styles.card}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={styles.siteName}>{site.name}</span>
                {site.address ? <span style={styles.siteAddress}>{site.address}</span> : null}
                {site.geoLat == null || site.geoLng == null ? (
                  <span style={styles.noCoords}>Pas de coordonnées — distance GPS indisponible</span>
                ) : null}
              </div>
              <div style={styles.cardActions}>
                <button
                  type="button"
                  className="btn"
                  style={styles.iconButton}
                  onClick={() => startEdit(site)}
                  aria-label="Modifier"
                >
                  <Pencil size={14} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  className="btn"
                  style={styles.iconButton}
                  disabled={busySiteId === site.id}
                  onClick={() => removeSite(site.id)}
                  aria-label="Supprimer"
                >
                  <Trash2 size={14} strokeWidth={2.25} color={colors.danger} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, marginBottom: spacing.lg },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    marginBottom: spacing.xl,
    boxShadow: shadows.sm,
    maxWidth: 640,
  },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm },
  formRow: { display: 'flex', gap: spacing.sm, marginBottom: spacing.sm },
  input: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
  },
  searchButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
    fontSize: typography.sizes.sm,
    whiteSpace: 'nowrap',
  },
  candidateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  candidateItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    border: 'none',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  coordsHint: { display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.sizes.xs, color: colors.success, margin: 0, marginBottom: spacing.sm },
  muted: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginBottom: spacing.sm },
  formActions: { display: 'flex', gap: spacing.sm },
  submitButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
    fontSize: typography.sizes.sm,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.md },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.sm,
  },
  siteName: { display: 'block', fontWeight: 600, color: colors.textPrimary },
  siteAddress: { display: 'block', fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  noCoords: { display: 'block', fontSize: typography.sizes.xs, color: colors.warning, marginTop: 4, fontWeight: 600 },
  cardActions: { display: 'flex', gap: spacing.xs, flexShrink: 0 },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    cursor: 'pointer',
  },
};
