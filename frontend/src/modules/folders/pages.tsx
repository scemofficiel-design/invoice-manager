import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderOpen, Search } from 'lucide-react';
import type { ClientDocument } from '@im/shared/types';
import { useClients, useCompany } from '@/hooks/queries';
import { useDebounced } from '@/hooks/useDebounced';
import { useMoney } from '@/lib/money';
import { canEdit } from '@/modules/clients/pages';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { DocumentsTable, ExportFolderButton, ImportButton, unpaidByCurrency, useDocuments } from './components';

/** Dossier d'un client : affiché dans sa fiche. */
export function ClientFolderCard({ companyId, clientId, clientName }: { companyId: string; clientId: string; clientName: string }) {
  const { t } = useTranslation();
  const { fmt } = useMoney();
  const company = useCompany(companyId);
  const docs = useDocuments(companyId, clientId);
  const [sp] = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sp.get('documents')) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sp, docs.data]);
  const editable = canEdit(company.data?.role);
  const unpaid = unpaidByCurrency(docs.data ?? []);
  return (
    <div ref={ref} id="documents" className="scroll-mt-4">
      <Card className="mt-5">
        <CardHeader
          title={<span className="flex items-center gap-2"><FolderOpen className="size-4 text-muted" />{t('folder.cardTitle')}</span>}
          description={t('folder.cardSubtitle')}
          actions={<div className="flex flex-wrap gap-2">{editable && <ImportButton companyId={companyId} clientId={clientId} variant="secondary" />}<ExportFolderButton companyId={companyId} clientId={clientId} clientName={clientName} /></div>}
        />
        {docs.isLoading ? <CardBody><Skeleton className="h-16" /></CardBody> : !docs.data?.length ? (
          <CardBody className="text-[13px] text-muted">{t('folder.emptyText')} <span className="block pt-1 text-xs text-subtle">{t('folder.formats')}</span></CardBody>
        ) : (
          <>
            {unpaid.length > 0 && <p className="border-b border-border px-5 py-2.5 text-[13px]"><span className="text-muted">{t('folder.unpaid')} : </span>{unpaid.map(([c, v]) => <span key={c} className="tabular ml-2 font-semibold text-warning">{fmt(v, c)}</span>)}</p>}
            <DocumentsTable companyId={companyId} docs={docs.data} editable={editable} />
          </>
        )}
      </Card>
    </div>
  );
}

/** Vue d'ensemble : un dossier par client, import rapide, recherche. */
export function FoldersPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const { fmt } = useMoney();
  const company = useCompany(companyId);
  const clients = useClients(companyId);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const docs = useDocuments(companyId, undefined, dq);
  const [target, setTarget] = useState('');
  const editable = canEdit(company.data?.role);
  const byClient = useMemo(() => {
    const m = new Map<string, { name: string; docs: ClientDocument[] }>();
    for (const d of docs.data ?? []) m.set(d.clientId, { name: d.clientName, docs: [...(m.get(d.clientId)?.docs ?? []), d] });
    return [...m.entries()];
  }, [docs.data]);

  return (
    <>
      <PageHeader title={t('folder.title')} description={t('folder.subtitle')} />
      {editable && (
        <Card className="mb-5">
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label={t('folder.importFor')} htmlFor="fd-client" className="min-w-56 flex-1">
              <Select id="fd-client" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t('folder.chooseClient')}</option>
                {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <ImportButton companyId={companyId} clientId={target || null} />
            <p className="w-full text-xs text-subtle">{t('folder.formats')}</p>
          </CardBody>
        </Card>
      )}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input aria-label={t('folder.search')} placeholder={t('folder.search')} className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {docs.isLoading ? <Skeleton className="h-32" /> : !byClient.length ? (
        <Card><EmptyState icon={<FolderOpen />} title={q ? t('search.empty') : t('folder.noFolders')} text={q ? undefined : t('folder.emptyText')} /></Card>
      ) : (
        <div className="grid gap-4">
          {byClient.map(([clientId, f]) => {
            const unpaid = unpaidByCurrency(f.docs);
            return (
              <Card key={clientId}>
                <Link to={`/c/${companyId}/clients/${clientId}?documents=1`} className="flex items-center gap-3 border-b border-border px-5 py-3 hover:bg-surface-2/60">
                  <FolderOpen className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="block text-xs text-muted">
                      {t('folder.documents', { count: f.docs.length })}
                      {unpaid.map(([c, v]) => <span key={c} className="ml-2 text-warning">· {t('folder.unpaid')} {fmt(v, c)}</span>)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-subtle" />
                </Link>
                <DocumentsTable companyId={companyId} docs={f.docs} editable={editable} />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
