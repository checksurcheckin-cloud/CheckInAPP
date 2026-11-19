import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { HealthPage } from './pages/HealthPage';
import { AuditPage } from './pages/AuditPage';

/**
 * Console interne de l'équipe CheckInApp (pas des entreprises clientes) :
 * vue de toutes les entreprises, abonnements, tablettes, santé du backend.
 * Parle uniquement à /platform/* avec son propre token (voir
 * apps/backend/src/platform) — aucun lien avec les sessions du web-manager.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Root() {
  const { admin, isLoading } = useAuth();

  if (isLoading) return <div className="splash">Chargement…</div>;
  if (!admin) return <LoginPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:id" element={<CompanyDetailPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
