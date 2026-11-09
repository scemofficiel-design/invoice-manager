import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowRight, Hash, ImageUp, Layers, Percent, Trash2 } from 'lucide-react';
import { percentToString } from '@im/shared/money';
import type { Company } from '@im/shared/types';
import { api } from '@/services/api';
import { useSession } from '@/contexts/session';
import { qk, useActivities, useCompany, useNumbering, useTaxes } from '@/hooks/queries';
import { useToastError } from '@/hooks/useApiError';
import { useConfirm } from '@/contexts/confirm';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, PageHeader, Skeleton } from '@/components/ui/card';
import { CompanyForm } from './CompanyForm';
import { CompanyDashboard } from '@/modules/dashboard/pages';

export function NewCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useSession();
  return (
    <>
      <PageHeader title={t('company.newTitle')} />
      <CompanyForm
        submitLabel={t('common.create')}
        onSubmit={async (payload) => {
          const c = await api.post<Company>('/companies', payload);
          await refresh();
          toast.success(t('common.created'));
          navigate(`/c/${c.id}`);
        }}
      />
    </>
  );
}

export function CompanyOverviewPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const company = useCompany(companyId);
  const activities = useActivities(companyId);
  const taxes = useTaxes(companyId);
  const numbering = useNumbering(companyId);
  if (company.isLoading) return <Skeleton className="h-40" />;
  if (!company.data) return null;
  const c = company.data;
  const addr = [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(' '), c.region, c.country].filter(Boolean);
  const stat = (icon: React.ReactNode, label: string, value: React.ReactNode, to: string) => (
    <Link to={to} className="group">
      <Card className="flex items-center gap-3 p-4 group-hover:border-border-strong">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">{icon}</span>
        <div className="flex-1"><p className="text-xs text-muted">{label}</p><p className="text-[15px] font-semibold">{value}</p></div>
        <ArrowRight className="size-4 text-subtle" />
      </Card>
    </Link>
  );
  return (
    <>
      <PageHeader title={c.tradeName || c.legalName} description={c.tradeName ? c.legalName : undefined} actions={<Badge tone="accent">{c.defaultCurrency}</Badge>} />
      {c.archivedAt && <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">{t('company.archivedNotice')}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {stat(<Layers />, t('nav.activities'), activities.data?.length ?? '—', `/c/${c.id}/settings/activities`)}
        {stat(<Percent />, t('nav.taxes'), taxes.data?.map((x) => x.name).join(', ') || t('common.none'), `/c/${c.id}/settings/taxes`)}
        {stat(<Hash />, t('numbering.invoice'), numbering.data?.find((s) => s.docType === 'invoice')?.preview ?? '—', `/c/${c.id}/settings/numbering`)}
      </div>
      <div className="mt-5 grid gap-5">
        <Card>
          <CardHeader title={t('company.contact')} actions={c.role === 'admin' && <Button asChild variant="secondary" size="sm"><Link to={`/c/${c.id}/settings/general`}>{t('common.edit')}</Link></Button>} />
          <CardBody className="space-y-1 text-[13px]">
            {addr.length ? addr.map((l) => <p key={l}>{l}</p>) : <p className="text-muted">{t('company.notConfigured')}</p>}
            {(c.phone || c.email) && <p className="pt-2 text-muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>}
            {c.legalIds.length > 0 && <p className="pt-2 text-muted">{c.legalIds.map((l) => `${l.label} ${l.value}`).join(' · ')}</p>}
          </CardBody>
        </Card>
      </div>
      <CompanyDashboard companyId={c.id} />
    </>
  );
}

function LogoCard({ company }: { company: Company }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { refresh } = useSession();
  const onError = useToastError();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const after = async () => {
    await qc.invalidateQueries({ queryKey: qk.company(company.id) });
    await refresh();
    setVersion((v) => v + 1);
  };
  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error(t('company.logoHint'));
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setBusy(true);
    try {
      await api.put(`/companies/${company.id}/logo`, { dataUrl });
      await after();
      toast.success(t('common.saved'));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title={t('company.logo')} description={t('company.logoHint')} />
      <CardBody className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
          {company.hasLogo ? <img src={`/api/v1/companies/${company.id}/logo?v=${version}`} alt={t('company.logo')} className="max-h-full max-w-full object-contain" /> : <ImageUp className="size-6 text-subtle" />}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
        <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}><ImageUp />{t('company.uploadLogo')}</Button>
        {company.hasLogo && (
          <Button variant="ghost" onClick={async () => { try { await api.del(`/companies/${company.id}/logo`); await after(); } catch (e) { onError(e); } }}>
            <Trash2 />{t('company.removeLogo')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

export function GeneralSettingsPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const company = useCompany(companyId);
  const qc = useQueryClient();
  const { refresh, me } = useSession();
  const onError = useToastError();
  const confirm = useConfirm();
  if (company.isLoading) return <Skeleton className="h-60" />;
  if (!company.data) return null;
  const c = company.data;
  const isAdmin = c.role === 'admin';
  const toggleArchive = async () => {
    if (!c.archivedAt && !(await confirm({ title: t('common.archive'), message: t('company.archiveConfirm'), confirmLabel: t('common.archive'), danger: true }))) return;
    try {
      await api.post(`/companies/${c.id}/${c.archivedAt ? 'unarchive' : 'archive'}`);
      await qc.invalidateQueries({ queryKey: qk.company(c.id) });
      await refresh();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader
        title={t('nav.general')}
        description={c.legalName}
        actions={me?.user.role === 'owner' && (
          <Button variant="secondary" onClick={toggleArchive}>{c.archivedAt ? <><ArchiveRestore />{t('common.unarchive')}</> : <><Archive />{t('common.archive')}</>}</Button>
        )}
      />
      <div className="flex flex-col gap-5">
        {isAdmin && <LogoCard company={c} />}
        <CompanyForm
          key={c.updatedAt}
          company={c}
          readOnly={!isAdmin}
          submitLabel={t('common.save')}
          onSubmit={async (payload) => {
            await api.patch(`/companies/${c.id}`, payload);
            await qc.invalidateQueries({ queryKey: qk.company(c.id) });
            await refresh();
            toast.success(t('common.saved'));
          }}
        />
      </div>
    </>
  );
}

export const formatRate = (ppm: number) => `${percentToString(ppm).replace('.', ',')} %`;
