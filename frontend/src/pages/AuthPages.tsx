import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { api } from '@/services/api';
import { useSession } from '@/contexts/session';
import { useErrorMessage } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-4 size-10" />
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">{children}</div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-subtle"><Lock className="size-3" />Données stockées localement</p>
      </div>
    </div>
  );
}

export function SetupPage() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const msg = useErrorMessage();
  const [form, setForm] = useState({ organizationName: '', displayName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    try {
      const { confirm: _c, ...body } = form;
      await api.post('/auth/setup', body);
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.setupTitle')} subtitle={t('auth.setupSubtitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('auth.organizationName')} htmlFor="org"><Input id="org" required value={form.organizationName} onChange={set('organizationName')} autoFocus /></Field>
        <Field label={t('auth.displayName')} htmlFor="name"><Input id="name" required value={form.displayName} onChange={set('displayName')} autoComplete="name" /></Field>
        <Field label={t('auth.email')} htmlFor="email"><Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="username" /></Field>
        <Field label={t('auth.password')} htmlFor="pw" hint={t('auth.passwordHint')}><Input id="pw" type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label={t('auth.confirmPassword')} htmlFor="pw2"><Input id="pw2" type="password" required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" loading={busy} className="mt-1">{t('auth.setupSubmit')}</Button>
      </form>
    </AuthLayout>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const navigate = useNavigate();
  const msg = useErrorMessage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/login', { email, password });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('auth.email')} htmlFor="email"><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label={t('auth.password')} htmlFor="pw"><Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" loading={busy}>{t('auth.loginSubmit')}</Button>
        <p className="text-xs text-muted">{t('auth.forgot')}</p>
      </form>
    </AuthLayout>
  );
}
