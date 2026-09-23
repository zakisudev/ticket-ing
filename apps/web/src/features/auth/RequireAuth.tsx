import { useContext } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AuthContext } from './AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui';

export function RequireAuth() {
  const { user, isLoading } = useContext(AuthContext);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AppShell />;
}
