import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { zipSync } from 'fflate';
import { Archive, FileImage, FileText, FolderDown, Pencil, Trash2, Upload } from 'lucide-react';
import type { ClientDocument, InvoiceSummary } from '@im/shared/types';
import { api } from '@/services/api';
import { useClients, useCurrencies } from '@/hooks/queries';
import { useConfirm } from '@/contexts/confirm';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { formatDate, minorToInput, tryParseMoney, useMoney } from '@/lib/money';
import { saveFile } from '@/lib/files';
import { openOrShare } from '@/lib/openOrShare';
import { Button } from '@/components/ui/button';
import { Badge, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';

export const docsKey = (companyId: string, clientId?: string) => ['company', companyId, 'documents', clientId ?? 'all'] as const;

export function useDocuments(companyId: string, clientId?: string, q = '') {
  return useQuery({
    queryKey: [...docsKey(companyId, clientId), q],
    queryFn: () => api.get<ClientDocument[]>(`/companies/${companyId}/documents?${new URLSearchParams({ ...(clientId ? { clientId } : {}), ...(q ? { q } : {}) })}`),
  });
}

/** Somme déclarée « non payée » par devise (jamais d'addition entre devises). */
export function unpaidByCurrency(docs: ClientDocument[]): [string, number][] {
  const m = new Map<string, number>();
  for (const d of docs) if (d.paid === false && d.amountMinor !== null && d.currency) m.set(d.currency, (m.get(d.currency) ?? 0) + d.amountMinor);
  return [...m.entries()];
}

/** Import de plusieurs fichiers d'un coup dans le dossier d'un client. */
export function ImportButton({ companyId, clientId, onDone, variant = 'primary' }: { companyId: string; clientId: string | null; onDone?: () => void; variant?: 'primary' | 'secondary' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const run = async (files: File[]) => {
    if (!clientId || !files.length) return;
    let ok = 0;
    setProgress({ done: 0, total: files.length });
    for (const [i, f] of files.entries()) {
      try {
        await api.upload(`/companies/${companyId}/clients/${clientId}/documents`, { fileName: f.name, data: new Uint8Array(await f.arrayBuffer()) });
        ok++;
      } catch (e) {
        toast.error(t('folder.failed', { name: f.name, error: msg(e) }));
      }
      setProgress({ done: i + 1, total: files.length });
    }
    setProgress(null);
    await qc.invalidateQueries({ queryKey: ['company', companyId, 'documents'] });
    if (ok) toast.success(t('folder.imported', { count: ok }));
    onDone?.();
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void run(files);
        }}
      />
      <Button variant={variant} disabled={!clientId} loading={!!progress} onClick={() => input.current?.click()}>
        <Upload />
        {progress ? t('folder.importing', progress) : t('folder.import')}
      </Button>
    </>
  );
}

function InfoDialog({ companyId, doc, onClose }: { companyId: string; doc: ClientDocument; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const { minorUnits } = useMoney();
  const clients = useClients(companyId, true);
  const currencies = useCurrencies();
  const company = useQuery({ queryKey: ['company', companyId], queryFn: () => api.get<{ defaultCurrency: string }>(`/companies/${companyId}`) });
  const cur0 = doc.currency ?? company.data?.defaultCurrency ?? 'CAD';
  const [v, setV] = useState({
    clientId: doc.clientId,
    number: doc.number ?? '',
    docDate: doc.docDate ?? '',
    amount: doc.amountMinor !== null && doc.currency ? minorToInput(doc.amountMinor, minorUnits(doc.currency)) : '',
    currency: cur0,
    paid: doc.paid === null ? '' : doc.paid ? 'yes' : 'no',
    notes: doc.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountMinor = v.amount.trim() ? tryParseMoney(v.amount, minorUnits(v.currency)) : null;
    if (v.amount.trim() && amountMinor === null) return setError(t('folder.amount'));
    setBusy(true);
    try {
      await api.patch(`/companies/${companyId}/documents/${doc.id}`, {
        clientId: v.clientId,
        number: v.number,
        docDate: v.docDate || null,
        amountMinor,
        currency: amountMinor !== null ? v.currency : null,
        paid: v.paid === '' ? null : v.paid === 'yes',
        notes: v.notes,
      });
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'documents'] });
      toast.success(t('common.saved'));
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('folder.infoTitle')} description={doc.fileName}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="doc-info" loading={busy}>{t('common.save')}</Button></>}>
      <form id="doc-info" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <p className="text-xs text-muted sm:col-span-2">{t('folder.infoHelp')}</p>
        <Field label={t('folder.client')} htmlFor="di-client" className="sm:col-span-2">
          <Select id="di-client" value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })}>
            {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={t('folder.number')} htmlFor="di-number"><Input id="di-number" value={v.number} onChange={(e) => setV({ ...v, number: e.target.value })} /></Field>
        <Field label={t('folder.date')} htmlFor="di-date"><Input id="di-date" type="date" value={v.docDate} onChange={(e) => setV({ ...v, docDate: e.target.value })} /></Field>
        <Field label={t('folder.amount')} htmlFor="di-amount">
          <div className="flex gap-2">
            <Input id="di-amount" inputMode="decimal" className="tabular text-right" placeholder="0,00" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
            <Select aria-label={t('doc.currency')} className="w-24" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
              {currencies.data?.map((c) => <option key={c.code}>{c.code}</option>)}
            </Select>
          </div>
        </Field>
        <Field label={t('folder.status')} htmlFor="di-paid">
          <Select id="di-paid" value={v.paid} onChange={(e) => setV({ ...v, paid: e.target.value })}>
            <option value="">{t('folder.unknown')}</option>
            <option value="yes">{t('folder.paid')}</option>
            <option value="no">{t('folder.unpaidStatus')}</option>
          </Select>
        </Field>
        <Field label={t('folder.notes')} htmlFor="di-notes" className="sm:col-span-2"><Textarea id="di-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function DocumentsTable({ companyId, docs, showClient, editable }: { companyId: string; docs: ClientDocument[]; showClient?: boolean; editable: boolean }) {
  const { t } = useTranslation();
  const { fmt } = useMoney();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const onError = useToastError();
  const [editing, setEditing] = useState<ClientDocument | null>(null);
  const open = async (d: ClientDocument) => {
    try {
      await openOrShare(`/companies/${companyId}/documents/${d.id}/file`);
    } catch (e) {
      onError(e);
    }
  };
  const remove = async (d: ClientDocument) => {
    if (!(await confirm({ title: t('folder.delete'), message: t('folder.deleteConfirm', { name: d.fileName }), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await api.del(`/companies/${companyId}/documents/${d.id}`);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'documents'] });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <Table>
        <thead>
          <tr><th>{t('folder.file')}</th>{showClient && <th className="hidden sm:table-cell">{t('folder.client')}</th>}<th className="hidden md:table-cell">{t('folder.date')}</th><th className="text-right">{t('folder.amount')}</th><th className="hidden sm:table-cell">{t('folder.status')}</th>{editable && <th />}</tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button type="button" className="flex items-start gap-2 text-left hover:underline" onClick={() => void open(d)} title={t('folder.open')}>
                  {d.mime === 'application/pdf' ? <FileText className="mt-0.5 size-4 shrink-0 text-muted" /> : <FileImage className="mt-0.5 size-4 shrink-0 text-muted" />}
                  <span className="min-w-0">
                    <span className="block font-medium break-all">{d.number ?? d.fileName}</span>
                    <span className="block text-xs text-muted break-all">{d.number ? d.fileName : t('folder.importedOn', { date: formatDate(d.createdAt.slice(0, 10)) })}</span>
                  </span>
                </button>
              </td>
              {showClient && <td className="hidden text-muted sm:table-cell">{d.clientName}</td>}
              <td className="hidden whitespace-nowrap text-muted md:table-cell">{d.docDate ? formatDate(d.docDate) : '—'}</td>
              <td className="tabular whitespace-nowrap text-right">{d.amountMinor !== null && d.currency ? fmt(d.amountMinor, d.currency) : '—'}</td>
              <td className="hidden sm:table-cell">{d.paid === true ? <Badge tone="success">{t('folder.paid')}</Badge> : d.paid === false ? <Badge tone="warning">{t('folder.unpaidStatus')}</Badge> : <span className="text-xs text-subtle">—</span>}</td>
              {editable && (
                <td className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon" aria-label={t('folder.edit')} onClick={() => setEditing(d)}><Pencil /></Button>
                  <Button variant="ghost" size="icon" aria-label={t('folder.delete')} onClick={() => void remove(d)}><Trash2 /></Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <InfoDialog key={editing.id} companyId={companyId} doc={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const ext = (mime: string, name: string) => (/\.[a-z0-9]{2,5}$/i.exec(name)?.[0] ?? (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/heic' ? '.heic' : '.jpg'));
const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 120);

/** Exporte le dossier d'un client (documents importés + factures émises) en un fichier ZIP. */
export function ExportFolderButton({ companyId, clientId, clientName }: { companyId: string; clientId: string; clientName: string }) {
  const { t } = useTranslation();
  const onError = useToastError();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      const used = new Set<string>();
      const add = (dir: string, base: string, data: Uint8Array) => {
        let name = `${dir}/${clean(base)}`;
        for (let i = 2; used.has(name); i++) name = `${dir}/${clean(base).replace(/(\.[^.]+)?$/, ` (${i})$1`)}`;
        used.add(name);
        entries[name] = [data, { level: 0 }];
      };
      const docs = await api.get<ClientDocument[]>(`/companies/${companyId}/documents?clientId=${clientId}`);
      for (const d of docs) {
        const f = await api.file(`/companies/${companyId}/documents/${d.id}/file`);
        const label = [d.docDate, d.number].filter(Boolean).join(' ') || d.fileName.replace(/\.[^.]+$/, '');
        add(t('folder.zipImported'), `${label}${ext(d.mime, d.fileName)}`, f.data);
      }
      const invoices = await api.get<InvoiceSummary[]>(`/companies/${companyId}/invoices?clientId=${clientId}&limit=500`);
      for (const inv of invoices.filter((i) => i.status !== 'draft')) {
        const f = await api.file(`/companies/${companyId}/invoices/${inv.id}/pdf`);
        add(t('folder.zipIssued'), f.filename, f.data);
      }
      if (!used.size) return void toast.info(t('folder.zipEmpty'));
      await saveFile(zipSync(entries), `${clean(clientName)}.zip`, 'application/zip', clientName);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return <Button variant="secondary" loading={busy} onClick={() => void run()}><FolderDown />{t('folder.exportZip')}</Button>;
}

export const FolderIcon = Archive;
