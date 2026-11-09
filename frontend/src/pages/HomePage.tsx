import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { GeneralDashboard } from '@/modules/dashboard/pages';
import { useMe } from '@/contexts/session';
import { CompanyLogo } from '@/layouts/AppShell';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/card';

export function HomePage() {
  const { t } = useTranslation();
  const me = useMe();
  const isOwner = me.user.role === 'owner';
  const active = me.companies.filter((c) => !c.archivedAt);
  const archived = me.companies.filter((c) => c.archivedAt);

  return (
    <>
      <PageHeader
        title={t('home.title')}
        description={t('home.subtitle')}
        actions={isOwner && active.length > 0 && <Button asChild><Link to="/companies/new"><Plus />{t('nav.newCompany')}</Link></Button>}
      />
      {active.length > 0 && <GeneralDashboard />}
      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title={t('home.emptyTitle')}
            text={t('home.emptyText')}
            action={isOwner && <Button asChild><Link to="/companies/new"><Plus />{t('nav.newCompany')}</Link></Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((c) => (
            <Link key={c.id} to={`/c/${c.id}`} className="group">
              <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-border-strong">
                <CompanyLogo id={c.id} name={c.legalName} hasLogo={c.hasLogo} size="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.tradeName || c.legalName}</p>
                  {c.tradeName && <p className="truncate text-xs text-muted">{c.legalName}</p>}
                </div>
                <Badge>{c.defaultCurrency}</Badge>
                <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t('common.archived')}</p>
          <div className="flex flex-wrap gap-2">
            {archived.map((c) => (
              <Link key={c.id} to={`/c/${c.id}`} className="rounded-md border border-border px-3 py-1.5 text-[13px] text-muted hover:text-fg">{c.legalName}</Link>
            ))}
          </div>
        </div>
      )}

    </>
  );
}
