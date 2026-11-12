import React, { useMemo, useState } from 'react';
import { colors, spacing, radius, typography } from '@horaires/ui-tokens';
import type { ContractType, User } from '@horaires/shared-types';
import { CONTRACT_LABELS, ContractPayload, dialogStyles as styles } from './ContractDialog';

type Props = {
  open: boolean;
  users: User[];
  // Même règle que la page : un manager limité n'importe que pour ses employés.
  canManage: (user: User) => boolean;
  onClose: () => void;
  onImport: (rows: { userId: string; payload: ContractPayload }[]) => Promise<void>;
};

type ParsedRow =
  | { ok: true; line: number; user: User; payload: ContractPayload }
  | { ok: false; line: number; email: string; reason: string };

// Valeurs acceptées dans la colonne contrat (export de secrétariat social,
// saisie à la main…).
const CONTRACT_ALIASES: Record<string, ContractType> = {
  full_time: 'full_time',
  temps_plein: 'full_time',
  'temps plein': 'full_time',
  tp: 'full_time',
  part_time: 'part_time',
  temps_partiel: 'part_time',
  'temps partiel': 'part_time',
  mi_temps: 'part_time',
  student: 'student',
  etudiant: 'student',
  étudiant: 'student',
  flexi_job: 'flexi_job',
  flexi: 'flexi_job',
  'flexi-job': 'flexi_job',
};

const EXAMPLE = 'email;contrat;heures;naissance\nsophie@exemple.be;temps partiel;20;14/05/2001\nnabil@exemple.be;etudiant;;2007-09-30';

// "YYYY-MM-DD" ou "JJ/MM/AAAA" -> "YYYY-MM-DD" (null si vide, undefined si invalide).
function parseDate(value: string): string | null | undefined {
  const v = value.trim();
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const be = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : be ? [be[3], be[2].padStart(2, '0'), be[1].padStart(2, '0')] : [];
  if (!y) return undefined;
  const date = new Date(`${y}-${m}-${d}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${m}-${d}` ? undefined : `${y}-${m}-${d}`;
}

export function parseContractsCsv(text: string, users: User[], canManage: (u: User) => boolean): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(separator).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const emailCol = col('email', 'e-mail', 'mail');
  const typeCol = col('contrat', 'contract', 'type', 'contracttype');
  const hoursCol = col('heures', 'hours', 'heures/semaine', 'weeklycontracthours');
  const birthCol = col('naissance', 'date de naissance', 'birthdate', 'birth_date');
  const hasHeader = emailCol >= 0;
  const idx = hasHeader ? { email: emailCol, type: typeCol, hours: hoursCol, birth: birthCol } : { email: 0, type: 1, hours: 2, birth: 3 };
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  return lines.slice(hasHeader ? 1 : 0).map((line, i): ParsedRow => {
    const lineNumber = i + (hasHeader ? 2 : 1);
    const cells = line.split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = (cells[idx.email] ?? '').toLowerCase();
    const user = byEmail.get(email);
    if (!user) return { ok: false, line: lineNumber, email, reason: 'Aucun membre de l’équipe avec cet email' };
    if (!canManage(user)) return { ok: false, line: lineNumber, email, reason: 'Hors de vos magasins' };

    const rawType = idx.type >= 0 ? (cells[idx.type] ?? '').trim().toLowerCase() : '';
    const contractType = rawType ? CONTRACT_ALIASES[rawType] : null;
    if (contractType === undefined) return { ok: false, line: lineNumber, email, reason: `Contrat inconnu « ${rawType} »` };

    const rawHours = idx.hours >= 0 ? (cells[idx.hours] ?? '').trim() : '';
    const hours = rawHours ? Number(rawHours.replace(',', '.')) : null;
    if (hours !== null && (Number.isNaN(hours) || hours < 1 || hours > 50)) {
      return { ok: false, line: lineNumber, email, reason: `Heures invalides « ${rawHours} »` };
    }

    const birthDate = idx.birth >= 0 ? parseDate(cells[idx.birth] ?? '') : null;
    if (birthDate === undefined) return { ok: false, line: lineNumber, email, reason: 'Date de naissance invalide' };

    return {
      ok: true,
      line: lineNumber,
      user,
      payload: { contractType, weeklyContractHours: contractType === 'part_time' ? hours : null, birthDate },
    };
  });
}

// Import des contrats depuis un fichier CSV (ex. export du secrétariat
// social) : aperçu ligne par ligne, puis enregistrement des lignes valides.
export function ContractImportDialog({ open, users, canManage, onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => parseContractsCsv(text, users, canManage), [text, users, canManage]);
  const valid = rows.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok);

  if (!open) return null;

  const close = () => {
    setText('');
    setError(null);
    onClose();
  };

  const readFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  const handleImport = async () => {
    setError(null);
    setIsImporting(true);
    try {
      await onImport(valid.map((r) => ({ userId: r.user.id, payload: r.payload })));
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={close}>
      <div style={{ ...styles.box, width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 style={styles.title}>Importer les contrats</h2>
          <p style={styles.subtitle}>
            Fichier CSV avec les colonnes <strong>email</strong>, <strong>contrat</strong> (temps plein, temps partiel,
            étudiant, flexi-job), <strong>heures</strong> (temps partiel) et <strong>naissance</strong> (JJ/MM/AAAA).
            Les employés sont reconnus par leur email.
          </p>
        </div>

        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
        <textarea
          style={{ ...styles.input, minHeight: 110, fontFamily: 'monospace', fontSize: typography.sizes.xs }}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {rows.length > 0 ? (
          <div style={preview.list}>
            {rows.map((r) =>
              r.ok ? (
                <div key={r.line} style={preview.row}>
                  <span style={preview.ok}>✓</span>
                  <span style={preview.name}>
                    {r.user.firstName} {r.user.lastName}
                  </span>
                  <span style={preview.detail}>
                    {r.payload.contractType ? CONTRACT_LABELS[r.payload.contractType] : 'Non renseigné'}
                    {r.payload.weeklyContractHours ? ` · ${r.payload.weeklyContractHours} h` : ''}
                    {r.payload.birthDate ? ` · né(e) le ${r.payload.birthDate.split('-').reverse().join('/')}` : ''}
                  </span>
                </div>
              ) : (
                <div key={r.line} style={preview.row}>
                  <span style={preview.ko}>✕</span>
                  <span style={preview.name}>
                    Ligne {r.line} {r.email ? `(${r.email})` : ''}
                  </span>
                  <span style={{ ...preview.detail, color: colors.danger }}>{r.reason}</span>
                </div>
              ),
            )}
          </div>
        ) : null}

        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.actions}>
          <button className="btn" style={styles.secondaryButton} onClick={close}>
            Annuler
          </button>
          <button
            className="btn"
            style={styles.primaryButton}
            disabled={isImporting || valid.length === 0}
            onClick={handleImport}
          >
            {isImporting ? 'Import…' : `Importer ${valid.length} contrat${valid.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const preview: Record<string, React.CSSProperties> = {
  list: {
    maxHeight: 220,
    overflowY: 'auto',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  row: { display: 'flex', alignItems: 'baseline', gap: spacing.sm, padding: `4px ${spacing.sm}px`, fontSize: typography.sizes.sm },
  ok: { color: colors.success, fontWeight: 700 },
  ko: { color: colors.danger, fontWeight: 700 },
  name: { fontWeight: 600, color: colors.textPrimary, whiteSpace: 'nowrap' },
  detail: { color: colors.textSecondary },
};
