import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { colors, gradients, spacing, radius, typography, shadows } from '@horaires/ui-tokens';
import { useAuth } from '../services/AuthService';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.mark}>
          <CalendarClock size={26} color={colors.surface} strokeWidth={2.25} />
        </div>
        <h1 style={styles.title}>Espace manager</h1>
        <p style={styles.subtitle}>Connectez-vous pour gérer le planning</p>
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Mot de passe"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p style={styles.error}>{error}</p> : null}
        <button
          className="btn btn-gradient"
          style={styles.button}
          type="submit"
          disabled={isSubmitting || !email || !password}
        >
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `radial-gradient(circle at 20% 20%, ${colors.primaryTint} 0%, ${colors.background} 55%)`,
  },
  card: {
    width: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    border: `1px solid ${colors.border}`,
    boxShadow: shadows.lg,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    background: gradients.brand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: "'Sora', sans-serif",
    fontSize: typography.sizes.xl,
    fontWeight: 700,
    color: colors.textPrimary,
    textAlign: 'center',
    margin: 0,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    margin: 0,
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.md,
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, margin: 0, textAlign: 'center' },
  button: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.md,
    border: 'none',
    fontWeight: 600,
    fontSize: typography.sizes.md,
    cursor: 'pointer',
  },
};
