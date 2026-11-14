import { useEffect, useState, type ReactNode } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { useLogoUrl } from '@/hooks/useLogo';
import { BackupReminder } from '@/modules/admin/BackupsPage';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Building2, ChevronsUpDown, FolderOpen, DatabaseBackup, FileCheck2, Package, Wallet, Coins, FileText, Hash, History, Home, Layers, LayoutDashboard, Menu as MenuIcon,
  Monitor, Moon, Percent, Plus, Search, Settings, Sun, Users, X,
} from 'lucide-react';
import { useMe } from '@/contexts/session';
import { applyTheme, currentTheme, type Theme } from '@/contexts/theme';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';

function NavItem({ to, icon, children, end, onClick }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors [&_svg]:size-4',
          isActive ? 'bg-surface-2 text-fg [&_svg]:text-accent' : 'text-muted hover:bg-surface-2/70 hover:text-fg',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="mt-5">
    <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
    <div className="flex flex-col gap-0.5">{children}</div>
  </div>
);

function CompanyLogo({ id, name, hasLogo, size = 'size-6' }: { id: string; name: string; hasLogo: boolean; size?: string }) {
  const url = useLogoUrl(id, hasLogo);
  return url ? (
    <img src={url} alt="" className={cn(size, 'rounded-md border border-border bg-white object-contain')} />
  ) : (
    <span className={cn(size, 'flex items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent')}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const me = useMe();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(currentTheme());
  const current = me.companies.find((c) => c.id === companyId);
  const isOwner = me.user.role === 'owner';
  const close = () => setMobileOpen(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeTheme = (th: Theme) => {
    setTheme(th);
    applyTheme(th);
    void api.patch('/auth/preferences', { theme: th });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{t('app.name')}</p>
          <p className="truncate text-xs text-muted">{me.organization.name}</p>
        </div>
      </div>

      <div className="px-3">
        <Menu>
          <MenuTrigger className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-[13px] shadow-card hover:bg-surface-2">
            {current ? <CompanyLogo id={current.id} name={current.legalName} hasLogo={current.hasLogo} /> : <span className="flex size-6 items-center justify-center rounded-md bg-surface-2 text-muted"><Building2 className="size-3.5" /></span>}
            <span className="min-w-0 flex-1 truncate font-medium">{current ? current.tradeName || current.legalName : t('nav.allCompanies')}</span>
            <ChevronsUpDown className="size-3.5 text-muted" />
          </MenuTrigger>
          <MenuContent className="w-60">
            <MenuLabel>{t('nav.switchCompany')}</MenuLabel>
            <MenuItem onSelect={() => { navigate('/'); close(); }}><Home />{t('nav.allCompanies')}</MenuItem>
            {me.companies.filter((c) => !c.archivedAt).map((c) => (
              <MenuItem key={c.id} onSelect={() => { navigate(`/c/${c.id}`); close(); }}>
                <CompanyLogo id={c.id} name={c.legalName} hasLogo={c.hasLogo} size="size-5" />
                <span className="truncate">{c.tradeName || c.legalName}</span>
                <span className="ml-auto text-xs text-subtle">{c.defaultCurrency}</span>
              </MenuItem>
            ))}
            {isOwner && (<><MenuSeparator /><MenuItem onSelect={() => { navigate('/companies/new'); close(); }}><Plus />{t('nav.newCompany')}</MenuItem></>)}
          </MenuContent>
        </Menu>
      </div>

      <div className="px-3 pt-3">
        <button type="button" onClick={() => { setSearchOpen(true); close(); }} className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-[13px] text-muted hover:bg-surface-2">
          <Search className="size-3.5" />
          <span className="flex-1">{t('search.open')}</span>
          <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="mt-4 flex flex-col gap-0.5">
          <NavItem to="/" end icon={<Home />} onClick={close}>{t('nav.home')}</NavItem>
        </div>
        {current && (
          <>
            <Section label={current.tradeName || current.legalName}>
              <NavItem to={`/c/${current.id}`} end icon={<LayoutDashboard />} onClick={close}>{t('nav.overview')}</NavItem>
              <NavItem to={`/c/${current.id}/clients`} icon={<Users />} onClick={close}>{t('nav.clients')}</NavItem>
              <NavItem to={`/c/${current.id}/catalog`} icon={<Package />} onClick={close}>{t('nav.catalog')}</NavItem>
              <NavItem to={`/c/${current.id}/quotes`} icon={<FileText />} onClick={close}>{t('nav.quotes')}</NavItem>
              <NavItem to={`/c/${current.id}/invoices`} icon={<FileCheck2 />} onClick={close}>{t('nav.invoices')}</NavItem>
              <NavItem to={`/c/${current.id}/payments`} icon={<Wallet />} onClick={close}>{t('nav.payments')}</NavItem>
              <NavItem to={`/c/${current.id}/folders`} icon={<FolderOpen />} onClick={close}>{t('nav.folders')}</NavItem>
            </Section>
            <Section label={t('nav.settings')}>
              <NavItem to={`/c/${current.id}/settings/general`} icon={<Settings />} onClick={close}>{t('nav.general')}</NavItem>
              <NavItem to={`/c/${current.id}/settings/activities`} icon={<Layers />} onClick={close}>{t('nav.activities')}</NavItem>
              <NavItem to={`/c/${current.id}/settings/taxes`} icon={<Percent />} onClick={close}>{t('nav.taxes')}</NavItem>
              <NavItem to={`/c/${current.id}/settings/numbering`} icon={<Hash />} onClick={close}>{t('nav.numbering')}</NavItem>
            </Section>
          </>
        )}
        {isOwner && (
          <Section label={t('nav.admin')}>
            <NavItem to="/admin/currencies" icon={<Coins />} onClick={close}>{t('nav.currencies')}</NavItem>
            <NavItem to="/admin/backups" icon={<DatabaseBackup />} onClick={close}>{t('nav.backups')}</NavItem>
            <NavItem to="/admin/audit" icon={<History />} onClick={close}>{t('nav.audit')}</NavItem>
          </Section>
        )}
      </nav>

      <div className="border-t border-border p-3">
        <Menu>
          <MenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">{me.user.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{me.user.displayName}</span>
              <span className="block truncate text-xs text-muted">{me.user.email}</span>
            </span>
          </MenuTrigger>
          <MenuContent align="start" className="w-56">
            <MenuItem onSelect={() => { navigate('/account'); close(); }}><FileText />{t('nav.account')}</MenuItem>
            <MenuSeparator />
            <MenuLabel>{t('nav.theme')}</MenuLabel>
            {([['light', Sun], ['dark', Moon], ['system', Monitor]] as const).map(([th, Icon]) => (
              <MenuItem key={th} onSelect={() => changeTheme(th)} className={theme === th ? 'text-accent' : ''}><Icon />{t(`nav.${th}`)}</MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {me.profile === 'demo' && <div className="bg-warning px-4 py-1.5 text-center text-xs font-semibold text-black">{t('app.demoBanner')}</div>}
      {me.profile === 'dev' && <div className="bg-accent-soft px-4 py-1 text-center text-[11px] font-medium text-accent">{t('app.devBanner')}</div>}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-bg lg:block print:hidden">{sidebar}</aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={close} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-bg shadow-xl">
              <button className="absolute right-2 top-3 rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={close} aria-label="Fermer le menu"><X className="size-4" /></button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center gap-2 border-b border-border px-4 lg:hidden print:hidden">
            <button className="rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><MenuIcon className="size-5" /></button>
            <Link to="/" className="text-sm font-semibold">{t('app.name')}</Link>
            <button className="ml-auto rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={() => setSearchOpen(true)} aria-label={t('search.open')}><Search className="size-5" /></button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
              <BackupReminder />
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export { CompanyLogo };
