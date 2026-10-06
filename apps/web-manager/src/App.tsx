import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { colors } from '@horaires/ui-tokens';
import { AuthProvider, useAuth } from './services/AuthService';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { PlanningPage } from './pages/PlanningPage'; // SEUL endroit avec création d'horaires
import { PresenceLivePage } from './pages/PresenceLivePage';
import { ShiftApprovalPage } from './pages/ShiftApprovalPage';
import { TeamPage } from './pages/TeamPage'; // gestion des employés, badges, PIN
import { SettingsPage } from './pages/SettingsPage'; // réglages entreprise (ex: pointage GPS)
import { SitesPage } from './pages/SitesPage'; // gestion des lieux de travail (adresse -> coordonnées)

/**
 * App web réservée aux managers/admins. C'est le SEUL endroit de tout le
 * produit où on peut créer/éditer des horaires (voir CLAUDE.md — décision
 * d'architecture, traitée comme un choix produit plutôt qu'un blocage API).
 *
 * Reprend aussi les fonctionnalités manager déjà présentes sur checkin-mobile
 * (validation d'échanges, présence en direct) pour un usage confortable sur
 * grand écran.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RootRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

function RootRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: colors.textSecondary }}>
        Chargement…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/planning" replace />} />
        <Route path="/planning" element={<PlanningPage />} />
        <Route path="/presence" element={<PresenceLivePage />} />
        <Route path="/approvals" element={<ShiftApprovalPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/sites" element={<SitesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/planning" replace />} />
      </Routes>
    </AppShell>
  );
}
