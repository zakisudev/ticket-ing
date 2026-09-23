import { createContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/api/hooks';
import { queryKeys } from '@/api/hooks';
import type { UserDto } from '@zakisu-tickets/shared';

interface AuthState {
  user: UserDto | null;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthState>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();
  const qc = useQueryClient();

  useEffect(() => {
    const onExpired = () => {
      qc.setQueryData(queryKeys.me, { user: null });
    };
    window.addEventListener('zt:session-expired', onExpired);
    return () => window.removeEventListener('zt:session-expired', onExpired);
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({ user: data?.user ?? null, isLoading }),
    [data, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
