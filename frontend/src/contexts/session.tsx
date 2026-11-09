import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthStatus, MeResponse } from '@im/shared/types';
import { api } from '@/services/api';
import { setLocale } from '@/i18n';
import { applyTheme } from './theme';

interface SessionValue {
  status: AuthStatus | undefined;
  me: MeResponse | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['auth', 'status'], queryFn: () => api.get<AuthStatus>('/auth/status'), retry: 1 });
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    enabled: !!status.data?.authenticated,
    retry: false,
  });

  useEffect(() => {
    if (me.data) {
      setLocale(me.data.user.locale);
      applyTheme(me.data.user.theme);
    }
  }, [me.data]);

  const value: SessionValue = {
    status: status.data,
    me: me.data,
    loading: status.isLoading || (!!status.data?.authenticated && me.isLoading),
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['auth'] });
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('SessionProvider manquant');
  return v;
}

/** Utilisateur connecté (garanti dans les pages protégées). */
export function useMe(): MeResponse {
  const { me } = useSession();
  if (!me) throw new Error('Session requise');
  return me;
}
