import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog as D } from 'radix-ui';
import { FileCheck2, FileText, Package, Search, User, Wallet } from 'lucide-react';
import { api } from '@/services/api';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/utils';

interface Result { type: 'client' | 'catalog' | 'quote' | 'invoice' | 'payment'; id: string; companyName: string; title: string; subtitle: string | null; href: string }
const ICONS = { client: User, invoice: FileCheck2, quote: FileText, catalog: Package, payment: Wallet };

/** Recherche globale (Cmd/Ctrl + K), limitée aux entreprises accessibles (filtrage côté serveur). */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 200);
  const res = useQuery({ queryKey: ['search', dq], queryFn: () => api.get<Result[]>(`/search?q=${encodeURIComponent(dq)}`), enabled: open && dq.length >= 2 });
  const results = dq.length >= 2 ? (res.data ?? []) : [];
  useEffect(() => setActive(0), [dq]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  const go = (r: Result) => {
    onOpenChange(false);
    navigate(r.href);
  };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <D.Title className="sr-only">{t('search.open')}</D.Title>
          <D.Description className="sr-only">{t('search.hint')}</D.Description>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              aria-label={t('search.open')}
              placeholder={t('search.placeholder')}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && results[active]) go(results[active]!);
              }}
            />
            <kbd className="rounded border border-border px-1.5 text-[10px] text-subtle">Esc</kbd>
          </div>
          <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {q.trim().length < 2 && <li className="px-3 py-6 text-center text-[13px] text-muted">{t('search.hint')}</li>}
            {dq.length >= 2 && dq === q.trim() && !res.isLoading && results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">{t('search.empty')}</li>}
            {results.map((r, i) => {
              const Icon = ICONS[r.type];
              return (
                <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left', i === active && 'bg-surface-2')}>
                    <Icon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-subtle">{t(`search.types.${r.type}`)}<br />{r.companyName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
