import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from './auth/LoginPage';
import { RequireAdmin } from './auth/RequireAdmin';
import { AppLayout } from './layout/AppLayout';
import { AssistantPage } from './pages/AssistantPage';
import { AuditPage } from './pages/AuditPage';
import { BroadcastsPage } from './pages/BroadcastsPage';
import { DeadlinesPage } from './pages/DeadlinesPage';
import { FarmDetailPage } from './pages/FarmDetailPage';
import { FarmsPage } from './pages/FarmsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SupportPage } from './pages/SupportPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UsersPage } from './pages/UsersPage';
import { usePageTitle } from './hooks/usePageTitle';
import { EmptyState, Spinner } from './ui/States';

// Сводка тянет recharts — грузим её отдельным файлом
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

function NotFound() {
  usePageTitle('Страница не найдена');
  return (
    <EmptyState title="Страница не найдена" action={<Link to="/">На сводку</Link>}>
      Такого раздела нет. Проверьте адрес или выберите раздел в меню.
    </EmptyState>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAdmin>
            <AppLayout />
          </RequireAdmin>
        }
      >
        <Route
          index
          element={
            <Suspense
              fallback={
                <div className="state">
                  <Spinner size={28} />
                </div>
              }
            >
              <DashboardPage />
            </Suspense>
          }
        />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="farms" element={<FarmsPage />} />
        <Route path="farms/:id" element={<FarmDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="deadlines" element={<DeadlinesPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="broadcasts" element={<BroadcastsPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
