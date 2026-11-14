import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import { api } from '@/services/api';
import { useSession } from '@/contexts/session';
import { useErrorMessage } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

/** Premier lancement : aucun compte ni mot de passe, l'application vit uniquement sur cet appareil. */
export function SetupPage() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const msg = useErrorMessage();
  const [form, setForm] = useState({ organizationName: '', displayName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/setup', form);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top))' }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="mb-4 size-12" />
          <h1 className="text-lg font-semibold">{t('auth.setupTitle')}</h1>
          <p className="mt-1 text-[13px] text-muted">{t('auth.setupSubtitle')}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label={t('auth.organizationName')} htmlFor="org"><Input id="org" required value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} autoFocus /></Field>
            <Field label={t('auth.displayName')} htmlFor="name"><Input id="name" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} autoComplete="name" /></Field>
            {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
            <Button type="submit" loading={busy} className="mt-1">{t('auth.setupSubmit')}</Button>
          </form>
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-subtle"><Smartphone className="mt-0.5 size-3.5 shrink-0" />{t('auth.localNote')}</p>
      </div>
    </div>
  );
}
