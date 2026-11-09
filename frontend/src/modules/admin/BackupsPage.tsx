import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, DatabaseBackup, HardDriveDownload, History, TriangleAlert } from 'lucide-react';
import { api } from '@/services/api';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';

interface Manifest { createdAt: string; reason: 'manual' | 'auto' | 'pre-migration' | 'pre-restore'; size: number; counts: Record<string, number> }
interface BackupsInfo {
  backups: { name: string; manifest: Manifest | null }[];
  dataDir: string; backupsDir: string; documentsDir: string; exportDir: string; freeBytes: number;
  retention: { daily: number; weekly: number; monthly: number };
}

const size = (b: number) => (b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} Go` : b > 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`);

export function BackupsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useToastError();
  const msg = useErrorMessage();
  const info = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => api.get<BackupsInfo>('/admin/backups') });
  const [busy, setBusy] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ exportDir: string; daily: string; weekly: string; monthly: string } | null>(null);
  const d = info.data;
  const s = settings ?? (d ? { exportDir: d.exportDir === `${d.dataDir}/exports` ? '' : d.exportDir, daily: String(d.retention.daily), weekly: String(d.retention.weekly), monthly: String(d.retention.monthly) } : null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin', 'backups'] });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };
  const doRestore = async (e: FormEvent) => {
    e.preventDefault();
    if (!restoring) return;
    setBusy('restore');
    setRestoreError(null);
    try {
      await api.post(`/admin/backups/${encodeURIComponent(restoring)}/restore`, { confirm: confirmText });
      toast.success(t('backup.restored'));
      qc.clear();
      window.location.replace('/login');
    } catch (err) {
      setRestoreError(msg(err));
    } finally {
      setBusy(null);
    }
  };
  const saveSettings = (e: FormEvent) => {
    e.preventDefault();
    if (!s) return;
    void run('settings', async () => {
      await api.patch('/admin/backup-settings', { exportDir: s.exportDir.trim() || null, daily: Number(s.daily), weekly: Number(s.weekly), monthly: Number(s.monthly) });
      setSettings(null);
      toast.success(t('common.saved'));
    });
  };

  return (
    <>
      <PageHeader
        title={t('backup.title')}
        description={t('backup.subtitle')}
        actions={<>
          <Button variant="secondary" loading={busy === 'export'} onClick={() => run('export', async () => { const r = await api.post<{ file: string }>('/admin/backups/export'); toast.success(t('backup.exported', { file: r.file })); })}><HardDriveDownload />{t('backup.export')}</Button>
          <Button loading={busy === 'create'} onClick={() => run('create', async () => { await api.post('/admin/backups'); toast.success(t('backup.created')); })}><DatabaseBackup />{t('backup.create')}</Button>
        </>}
      />
      <p className="mb-5 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{t('backup.sameDisk')}</p>
      {!d ? <Skeleton className="h-60" /> : (
        <>
          <Card>
            {!d.backups.length ? <EmptyState icon={<Archive />} title={t('backup.empty')} /> : (
              <Table>
                <thead><tr><th>{t('common.date')}</th><th>{t('common.status')}</th><th className="hidden sm:table-cell">{t('backup.contents')}</th><th className="hidden text-right sm:table-cell">{t('backup.size')}</th><th /></tr></thead>
                <tbody>{d.backups.map((b) => (
                  <tr key={b.name}>
                    <td><p className="font-medium">{b.manifest ? formatDateTime(b.manifest.createdAt) : b.name}</p><p className="font-mono text-[11px] text-subtle">{b.name}</p></td>
                    <td>{b.manifest ? <Badge tone={b.manifest.reason === 'manual' ? 'accent' : 'neutral'}>{t(`backup.reason.${b.manifest.reason}`)}</Badge> : <Badge tone="danger">?</Badge>}</td>
                    <td className="hidden text-muted sm:table-cell">{b.manifest ? `${b.manifest.counts.companies ?? 0} ${t('dashboard.companies').toLowerCase()} · ${b.manifest.counts.invoices ?? 0} ${t('backup.invoices')}` : '—'}</td>
                    <td className="tabular hidden text-right text-muted sm:table-cell">{b.manifest ? size(b.manifest.size) : '—'}</td>
                    <td className="text-right">{b.manifest && <Button variant="ghost" size="sm" onClick={() => { setRestoring(b.name); setConfirmText(''); setRestoreError(null); }}><History />{t('backup.restore')}</Button>}</td>
                  </tr>
                ))}</tbody>
              </Table>
            )}
          </Card>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('backup.locations')} />
              <CardBody className="space-y-2 text-[13px]">
                {([['dataDir', d.dataDir], ['backupsDir', d.backupsDir], ['documentsDir', d.documentsDir], ['exportDir', d.exportDir]] as const).map(([k, v]) => (
                  <div key={k}><p className="text-xs text-muted">{t(`backup.${k}`)}</p><p className="break-all font-mono text-[12px]">{v}</p></div>
                ))}
                <div><p className="text-xs text-muted">{t('backup.free')}</p><p className="tabular">{size(d.freeBytes)}</p></div>
              </CardBody>
            </Card>
            {s && (
              <Card>
                <CardHeader title={t('backup.retention')} />
                <CardBody>
                  <form onSubmit={saveSettings} className="grid gap-4">
                    <Field label={t('backup.exportDir')} htmlFor="bk-dir" hint={t('backup.exportDirHint')}><Input id="bk-dir" className="font-mono text-[12px]" value={s.exportDir} onChange={(e) => setSettings({ ...s, exportDir: e.target.value })} /></Field>
                    <div className="grid grid-cols-3 gap-3">
                      {(['daily', 'weekly', 'monthly'] as const).map((k) => (
                        <Field key={k} label={t(`backup.${k}`)} htmlFor={`bk-${k}`}><Input id={`bk-${k}`} type="number" min={k === 'daily' ? 1 : 0} value={s[k]} onChange={(e) => setSettings({ ...s, [k]: e.target.value })} /></Field>
                      ))}
                    </div>
                    <Button type="submit" variant="secondary" className="justify-self-start" loading={busy === 'settings'}>{t('common.save')}</Button>
                  </form>
                </CardBody>
              </Card>
            )}
          </div>
        </>
      )}
      {restoring && (
        <Dialog open onOpenChange={(o) => !o && setRestoring(null)} title={t('backup.restoreTitle', { name: restoring })}
          footer={<><Button variant="secondary" onClick={() => setRestoring(null)}>{t('common.cancel')}</Button><Button type="submit" form="restore-form" variant="danger" loading={busy === 'restore'} disabled={confirmText !== restoring}>{t('backup.restore')}</Button></>}>
          <form id="restore-form" onSubmit={doRestore} className="space-y-3 text-[13px]">
            <p>{t('backup.restoreHelp')}</p>
            <p className="select-all rounded bg-surface-2 px-2 py-1 font-mono text-[12px]">{restoring}</p>
            <Input aria-label={t('backup.restore')} autoFocus className="font-mono text-[12px]" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            {restoreError && <p role="alert" className="text-danger">{restoreError}</p>}
          </form>
        </Dialog>
      )}
    </>
  );
}
