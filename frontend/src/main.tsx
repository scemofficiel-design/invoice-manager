import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './styles/index.css';
import './i18n';
import { boot } from './local/runtime';
import { SessionProvider } from './contexts/session';
import { ConfirmProvider } from './contexts/confirm';
import { App } from './App';
import { registerServiceWorker } from './pwa';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } },
});

const root = createRoot(document.getElementById('root')!);

boot()
  .then(() => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <SessionProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </SessionProvider>
          </BrowserRouter>
          <Toaster position="top-center" richColors closeButton theme="system" />
        </QueryClientProvider>
      </StrictMode>,
    );
    registerServiceWorker();
  })
  .catch((err: unknown) => {
    console.error(err);
    const el = document.getElementById('root')!;
    el.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:28rem;margin:20vh auto;padding:1.5rem;font-family:system-ui;text-align:center';
    const h = document.createElement('p');
    h.style.fontWeight = '600';
    h.textContent = 'Impossible d’ouvrir les données de l’application.';
    const p = document.createElement('p');
    p.style.cssText = 'color:#666;font-size:14px;margin-top:.5rem';
    p.textContent = String((err as Error)?.message ?? err);
    box.append(h, p);
    el.append(box);
  });
