import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'success' | 'danger' | 'warning' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className={cn('tabular mt-1 text-lg font-semibold leading-tight', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning')}>{value}</div>
      {sub && <p className="mt-0.5 text-xs text-subtle">{sub}</p>}
    </Card>
  );
}

const PALETTE = ['var(--accent)', 'oklch(0.65 0.15 160)', 'oklch(0.7 0.15 60)', 'oklch(0.6 0.18 20)', 'oklch(0.6 0.12 230)'];

/**
 * Histogramme mensuel léger (SVG, sans dépendance). Une série par devise, chacune sur sa propre
 * échelle : des devises différentes ne sont jamais comparées ni empilées.
 */
export function MonthlyBars({ rows, fmt, locale }: { rows: { month: string; currency: string; revenue: number }[]; fmt: (m: number, c: string) => string; locale: string }) {
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const months = [...new Set(rows.map((r) => r.month))].sort();
  if (!months.length) return null;
  const label = (m: string) => new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  return (
    <div className="space-y-6">
      {currencies.map((cur, ci) => {
        const data = months.map((m) => ({ m, v: rows.find((r) => r.month === m && r.currency === cur)?.revenue ?? 0 }));
        const max = Math.max(...data.map((d) => d.v), 1);
        return (
          <figure key={cur}>
            <figcaption className="mb-2 text-xs font-medium text-muted">{cur}</figcaption>
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${cur} : ${data.map((d) => `${label(d.m)} ${fmt(d.v, cur)}`).join(', ')}`}>
              {data.map((d) => (
                <div key={d.m} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((d.v / max) * 100, d.v ? 2 : 0)}%`, background: PALETTE[ci % PALETTE.length] }} />
                  <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-fg px-1.5 py-0.5 text-[11px] text-bg group-hover:block">{fmt(d.v, cur)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">{data.map((d) => <span key={d.m} className="flex-1 truncate text-center text-[10px] text-subtle">{label(d.m)}</span>)}</div>
          </figure>
        );
      })}
    </div>
  );
}
