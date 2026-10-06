import React from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';
import { colors, spacing, radius, typography, shadows } from '@horaires/ui-tokens';

type Variant = 'warning' | 'danger' | 'info';

type Props = {
  open: boolean;
  title: string;
  message: string;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
};

const VARIANT_STYLES: Record<Variant, { background: string; color: string; Icon: typeof Info }> = {
  warning: { background: '#FEF3C7', color: colors.warning, Icon: AlertTriangle },
  danger: { background: '#FEE2E2', color: colors.danger, Icon: Trash2 },
  info: { background: colors.primaryTint, color: colors.primary, Icon: Info },
};

// Modale générique — remplace window.confirm()/alert() pour rester cohérent
// avec le reste de l'interface (typo, couleurs, ombres).
export function Dialog({
  open,
  title,
  message,
  variant = 'info',
  confirmLabel,
  cancelLabel = 'Fermer',
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  const variantStyle = VARIANT_STYLES[variant];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.iconWrap, backgroundColor: variantStyle.background, color: variantStyle.color }}>
          <variantStyle.Icon size={20} strokeWidth={2.25} />
        </div>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button className="btn" style={styles.secondaryButton} onClick={onClose}>
            {cancelLabel}
          </button>
          {onConfirm ? (
            <button
              className="btn"
              style={{ ...styles.primaryButton, backgroundColor: variant === 'danger' ? colors.danger : colors.primary }}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    animation: 'fade-in 0.15s ease',
  },
  box: {
    width: 380,
    maxWidth: 'calc(100vw - 32px)',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    boxShadow: shadows.lg,
    textAlign: 'center',
    animation: 'scale-in 0.15s ease',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    margin: '0 auto',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
    marginBottom: spacing.sm,
  },
  message: { fontSize: typography.sizes.sm, color: colors.textSecondary, margin: 0, lineHeight: 1.5 },
  actions: { display: 'flex', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  secondaryButton: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: 'none',
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
