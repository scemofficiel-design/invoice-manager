import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Confirmation dans une modale de l'application (remplace window.confirm). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <Dialog open onOpenChange={(o) => !o && close(false)} title={opts.title} description={opts.message}
          footer={<><Button variant="secondary" onClick={() => close(false)}>{t('common.cancel')}</Button><Button variant={opts.danger ? 'danger' : 'primary'} autoFocus onClick={() => close(true)}>{opts.confirmLabel ?? t('common.confirm')}</Button></>}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error('ConfirmProvider manquant');
  return c;
}
