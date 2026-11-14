import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DatabaseBackup, FolderOpen, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { zipSync } from 'fflate';
import { auditBackup, documentIds, exportBytes, flush, inspectBackup, readBackupFile, restoreBackup, type BackupCheck, type BackupContent } from '@/local/runtime';
import { fileGet, isPersisted, kvGet, kvSet, requestPersistence } from '@/local/store';
import { saveFile } from '@/lib/files';
import { useSession } from '@/contexts/session';
import { useConfirm } from '@/contexts/confirm';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';

const LAST_EXPORT = 'lastExportAt';
const REMIND_AFTER_DAYS = 7;
const size = (b: number) => (b > 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function useBackupStatus() {
  return useQuery({
    queryKey: ['local', 'backup-status'],
    queryFn: async () => ({
      lastExportAt: (await kvGet<string>(LAST_EXPORT)) ?? null,
      persisted: await isPersisted(),
      hasPreviousState: !!(await kvGet<Uint8Array>('db-before-restore')),
    }),
  });
}

/**
 * Exporte tout dans un seul fichier ZIP : la base (PDF émis compris) et les documents importés.
 * À enregistrer dans Fichiers / iCloud Drive, ou à envoyer par AirDrop.
 */
export async function exportBackup(): Promise<boolean> {
  await flush();
  const db = exportBytes();
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { 'invoice-manager.sqlite': db };
  const ids = documentIds();
  for (const id of ids) {
    const f = await fileGet(id);
    if (!f) throw new Error('Un document importé est introuvable sur l’appareil : sauvegarde interrompue.');
    entries[`fichiers/${id}`] = [f, { level: 0 }]; // PDF et photos sont déjà compressés
  }
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify({ app: 'invoice-manager', createdAt: new Date().toISOString(), documents: ids.length }, null, 2));
  const bytes = zipSync(entries, { level: 6 });
  const name = `invoice-manager-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`;
  const r = await saveFile(bytes, name, 'application/zip', 'Sauvegarde Invoice Manager');
  if (r === 'cancelled') return false;
  await kvSet(LAST_EXPORT, new Date().toISOString());
  auditBackup('backup_export', `Sauvegarde exportée (${size(bytes.length)})`);
  return true;
}

/** Bandeau de rappel quand aucune sauvegarde n'a été exportée récemment. */
export function BackupReminder() {
  const { t } = useTranslation();
  const { me } = useSession();
  const location = useLocation();
  const status = useBackupStatus();
  if (!status.data || !me?.companies.length || location.pathname.endsWith('/backups')) return null;
  const last = status.data.lastExportAt ? Date.parse(status.data.lastExportAt) : 0;
  if (Date.now() - last < REMIND_AFTER_DAYS * 86_400_000) return null;
  return (
    <Link to="/admin/backups" className="mb-5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{last ? t('backup.reminderOld', { days: Math.floor((Date.now() - last) / 86_400_000) }) : t('backup.reminderNever')} <u>{t('backup.exportNow')}</u></span>
    </Link>
  );
}

export function BackupsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useBackupStatus();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ content: BackupContent; name: string; check: BackupCheck } | null>(null);
  const dbSize = (() => {
    try {
      return exportBytes().length;
    } catch {
      return 0;
    }
  })();
  const docCount = (() => {
    try {
      return documentIds().length;
    } catch {
      return 0;
    }
  })();

  const doExport = async () => {
    setBusy('export');
    try {
      if (await exportBackup()) toast.success(t('backup.exported'));
      await qc.invalidateQueries({ queryKey: ['local'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const pick = async (file: File) => {
    try {
      const content = readBackupFile(new Uint8Array(await file.arrayBuffer()));
      setPending({ content, name: file.name, check: await inspectBackup(content) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const doRestore = async () => {
    if (!pending) return;
    setBusy('restore');
    try {
      await restoreBackup(pending.content);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  const undoRestore = async () => {
    if (!(await confirm({ title: t('backup.undoRestore'), message: t('backup.undoRestoreHelp'), confirmLabel: t('backup.undoRestore'), danger: true }))) return;
    const prev = await kvGet<Uint8Array>('db-before-restore');
    if (!prev) return;
    setBusy('undo');
    try {
      await restoreBackup({ db: prev, files: {} }, { filesOnDevice: true });
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  const s = status.data;

  return (
    <>
      <PageHeader title={t('backup.title')} description={t('backup.subtitle')} />
      <div className="grid gap-5">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><DatabaseBackup className="size-5" /></span>
              <div className="text-[13px]">
                <p className="font-medium">{t('backup.lastExport')}</p>
                <p className="text-muted">{s?.lastExportAt ? formatDateTime(s.lastExportAt) : t('backup.never')} · {t('backup.size')} {size(dbSize)}{docCount ? ` · ${t('backup.importedCount', { count: docCount })}` : ''}</p>
              </div>
            </div>
            <Button className="w-full sm:w-auto" loading={busy === 'export'} onClick={() => void doExport()}><DatabaseBackup />{t('backup.export')}</Button>
            <p className="text-xs text-muted">{t('backup.exportHelp')}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('backup.restoreTitle')} description={t('backup.restoreSubtitle')} />
          <CardBody className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept=".zip,.sqlite,.db,application/zip,application/octet-stream,application/x-sqlite3,application/vnd.sqlite3" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
            <Button variant="secondary" onClick={() => input.current?.click()}><FolderOpen />{t('backup.chooseFile')}</Button>
            {s?.hasPreviousState && <Button variant="ghost" loading={busy === 'undo'} onClick={() => void undoRestore()}><Undo2 />{t('backup.undoRestore')}</Button>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('backup.whereTitle')} />
          <CardBody className="space-y-2 text-[13px]">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />{t('backup.whereText')}</p>
            {!isStandalone() && <p className="flex items-start gap-2 text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{t('backup.installHint')}</p>}
            {s && !s.persisted && (
              <p className="flex items-start gap-2 text-muted">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{t('backup.notPersisted')} <button className="underline" onClick={async () => { await requestPersistence(); await qc.invalidateQueries({ queryKey: ['local'] }); }}>{t('backup.askPersist')}</button></span>
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {pending && (
        <Dialog open onOpenChange={(o) => !o && setPending(null)} title={t('backup.confirmTitle')} description={pending.name}
          footer={<><Button variant="secondary" onClick={() => setPending(null)}>{t('common.cancel')}</Button><Button variant="danger" loading={busy === 'restore'} onClick={() => void doRestore()}>{t('backup.restore')}</Button></>}>
          <div className="space-y-2 text-[13px]">
            <p>{t('backup.confirmContents', { companies: pending.check.companies, clients: pending.check.clients, invoices: pending.check.invoices, documents: pending.check.documents })}</p>
            <p className="text-warning">{t('backup.confirmWarning')}</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
