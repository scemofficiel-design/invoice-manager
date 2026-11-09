import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './styles/index.css';
import './i18n';
import { ApiError } from './services/api';
import { SessionProvider } from './contexts/session';
import { ConfirmProvider } from './contexts/confirm';
import { App } from './App';

/** Session expirée : on renvoie vers la connexion en rafraîchissant l'état d'authentification. */
const onAuthError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401 && !location.pathname.startsWith('/login')) {
    void queryClient.invalidateQueries({ queryKey: ['auth', 'status'] });
  }
};
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </SessionProvider>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton theme="system" />
    </QueryClientProvider>
  </StrictMode>,
);
