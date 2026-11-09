import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Layers, Pencil, Percent, Plus, Trash2 } from 'lucide-react';
import { parsePercent, percentToString } from '@im/shared/money';
import type { Activity, NumberingSequence, Tax } from '@im/shared/types';
import { COMPANY_ROLES, type CompanyRole, type DocType } from '@im/shared/constants';
import { api } from '@/services/api';
import { qk, useActivities, useCompany, useMembers, useNumbering, useTaxes, useUsers } from '@/hooks/queries';
import { useErrorMessage, useToastError } from '@/hooks/useApiError';
import { useMe } from '@/contexts/session';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, Table } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { formatRate } from './pages';

const useIsAdmin = (companyId: string) => useCompany(companyId).data?.role === 'admin';

// ── Activités ──────────────────────────────────────────────────────────

function ActivityDialog({ companyId, activity, open, onClose }: { companyId: string; activity: Activity | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const [v, setV] = useState({ name: activity?.name ?? '', code: activity?.code ?? '', description: activity?.description ?? '', color: activity?.color ?? '#6366f1' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (activity) await api.patch(`/companies/${companyId}/activities/${activity.id}`, v);
      else await api.post(`/companies/${companyId}/activities`, v);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'activities'] });
      toast.success(activity ? t('common.saved') : t('common.created'));
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={activity ? activity.name : t('activity.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="activity-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="activity-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label={`${t('common.name')} *`} htmlFor="a-name"><Input id="a-name" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={t('common.code')} htmlFor="a-code"><Input id="a-code" value={v.code} maxLength={20} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label={t('activity.color')} htmlFor="a-color"><Input id="a-color" type="color" className="w-14 p-1" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></Field>
        </div>
        <Field label={t('common.description')} htmlFor="a-desc"><Textarea id="a-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}

export function ActivitiesPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const [archived, setArchived] = useState(false);
  const list = useActivities(companyId, archived);
  const isAdmin = useIsAdmin(companyId);
  const qc = useQueryClient();
  const onError = useToastError();
  const [editing, setEditing] = useState<Activity | null | 'new'>(null);
  const toggle = async (a: Activity) => {
    try {
      await api.post(`/companies/${companyId}/activities/${a.id}/${a.archivedAt ? 'unarchive' : 'archive'}`);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'activities'] });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('activity.title')} description={t('activity.subtitle')} actions={isAdmin && <Button onClick={() => setEditing('new')}><Plus />{t('activity.new')}</Button>} />
      <Card>
        <div className="flex justify-end border-b border-border px-5 py-2.5">
          <Checkbox id="arch" label={t('common.showArchived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        </div>
        {list.isLoading ? <CardBody><Skeleton className="h-20" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<Layers />} title={t('activity.empty')} text={t('activity.emptyText')} action={isAdmin && <Button onClick={() => setEditing('new')}><Plus />{t('activity.new')}</Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('common.name')}</th><th>{t('common.code')}</th><th className="hidden sm:table-cell">{t('common.description')}</th>{isAdmin && <th className="text-right">{t('common.actions')}</th>}</tr></thead>
            <tbody>
              {list.data.map((a) => (
                <tr key={a.id} className={a.archivedAt ? 'opacity-60' : ''}>
                  <td><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: a.color ?? 'var(--border-strong)' }} />{a.name}{a.archivedAt && <Badge>{t('common.archived')}</Badge>}</span></td>
                  <td className="text-muted">{a.code ?? '—'}</td>
                  <td className="hidden max-w-xs truncate text-muted sm:table-cell">{a.description ?? ''}</td>
                  {isAdmin && (
                    <td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(a)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" aria-label={a.archivedAt ? t('common.unarchive') : t('common.archive')} onClick={() => void toggle(a)}>{a.archivedAt ? <ArchiveRestore /> : <Archive />}</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ActivityDialog key={editing === 'new' ? 'new' : editing.id} companyId={companyId} activity={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} />}
    </>
  );
}

// ── Taxes ──────────────────────────────────────────────────────────────

function TaxDialog({ companyId, tax, onClose }: { companyId: string; tax: Tax | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const msg = useErrorMessage();
  const [v, setV] = useState({
    name: tax?.name ?? '', code: tax?.code ?? '', rate: tax ? percentToString(tax.ratePpm).replace('.', ',') : '',
    isCompound: tax?.isCompound ?? false, registrationNumber: tax?.registrationNumber ?? '', jurisdiction: tax?.jurisdiction ?? '', isDefault: tax?.isDefault ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let ratePpm: number;
    try {
      ratePpm = parsePercent(v.rate);
    } catch (err) {
      return setError((err as Error).message);
    }
    setBusy(true);
    const { rate: _r, ...rest } = v;
    try {
      if (tax) await api.patch(`/companies/${companyId}/taxes/${tax.id}`, { ...rest, ratePpm });
      else await api.post(`/companies/${companyId}/taxes`, { ...rest, ratePpm });
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'taxes'] });
      toast.success(tax ? t('common.saved') : t('common.created'));
      onClose();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={tax ? tax.name : t('tax.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="tax-form" loading={busy}>{t('common.save')}</Button></>}>
      <form id="tax-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={`${t('common.name')} *`} htmlFor="t-name"><Input id="t-name" required autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={`${t('tax.rate')} *`} htmlFor="t-rate"><Input id="t-rate" required inputMode="decimal" placeholder="9,975" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} className="tabular" /></Field>
        <Field label={t('common.code')} htmlFor="t-code"><Input id="t-code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
        <Field label={t('tax.jurisdiction')} htmlFor="t-jur"><Input id="t-jur" value={v.jurisdiction} onChange={(e) => setV({ ...v, jurisdiction: e.target.value })} /></Field>
        <Field label={t('tax.registrationNumber')} htmlFor="t-reg" className="sm:col-span-2"><Input id="t-reg" value={v.registrationNumber} onChange={(e) => setV({ ...v, registrationNumber: e.target.value })} /></Field>
        <Checkbox id="t-comp" className="sm:col-span-2" label={t('tax.compound')} hint={t('tax.compoundHint')} checked={v.isCompound} onChange={(e) => setV({ ...v, isCompound: e.target.checked })} />
        <Checkbox id="t-def" className="sm:col-span-2" label={t('tax.isDefault')} checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} />
        {error && <p role="alert" className="text-[13px] text-danger sm:col-span-2">{error}</p>}
      </form>
    </Dialog>
  );
}

export function TaxesPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const [archived, setArchived] = useState(false);
  const list = useTaxes(companyId, archived);
  const isAdmin = useIsAdmin(companyId);
  const qc = useQueryClient();
  const onError = useToastError();
  const [editing, setEditing] = useState<Tax | null | 'new'>(null);
  const toggle = async (x: Tax) => {
    try {
      await api.post(`/companies/${companyId}/taxes/${x.id}/${x.archivedAt ? 'unarchive' : 'archive'}`);
      await qc.invalidateQueries({ queryKey: ['company', companyId, 'taxes'] });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('tax.title')} description={t('tax.subtitle')} actions={isAdmin && <Button onClick={() => setEditing('new')}><Plus />{t('tax.new')}</Button>} />
      <Card>
        <div className="flex justify-end border-b border-border px-5 py-2.5"><Checkbox id="tarch" label={t('common.showArchived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} /></div>
        {list.isLoading ? <CardBody><Skeleton className="h-20" /></CardBody> : !list.data?.length ? (
          <EmptyState icon={<Percent />} title={t('tax.empty')} text={t('tax.emptyText')} action={isAdmin && <Button onClick={() => setEditing('new')}><Plus />{t('tax.new')}</Button>} />
        ) : (
          <Table>
            <thead><tr><th>{t('common.name')}</th><th className="text-right">{t('tax.rate')}</th><th className="hidden sm:table-cell">{t('tax.registrationNumber')}</th><th></th>{isAdmin && <th className="text-right">{t('common.actions')}</th>}</tr></thead>
            <tbody>
              {list.data.map((x) => (
                <tr key={x.id} className={x.archivedAt ? 'opacity-60' : ''}>
                  <td className="font-medium">{x.name}{x.code && <span className="ml-2 text-xs text-muted">{x.code}</span>}</td>
                  <td className="tabular text-right">{formatRate(x.ratePpm)}</td>
                  <td className="hidden text-muted sm:table-cell">{x.registrationNumber ?? '—'}</td>
                  <td className="space-x-1 whitespace-nowrap">{x.isDefault && <Badge tone="accent">{t('tax.isDefault')}</Badge>}{x.isCompound && <Badge tone="warning">{t('tax.compound')}</Badge>}{x.archivedAt && <Badge>{t('common.archived')}</Badge>}</td>
                  {isAdmin && (
                    <td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={t('common.edit')} onClick={() => setEditing(x)}><Pencil /></Button>
                      <Button variant="ghost" size="icon" aria-label={x.archivedAt ? t('common.unarchive') : t('common.archive')} onClick={() => void toggle(x)}>{x.archivedAt ? <ArchiveRestore /> : <Archive />}</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <TaxDialog key={editing === 'new' ? 'new' : editing.id} companyId={companyId} tax={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ── Numérotation ───────────────────────────────────────────────────────

function SequenceRow({ companyId, seq, isAdmin }: { companyId: string; seq: NumberingSequence; isAdmin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useToastError();
  const [v, setV] = useState({ pattern: seq.pattern, reset: seq.reset, nextValue: String(seq.nextValue) });
  const [busy, setBusy] = useState(false);
  const dirty = v.pattern !== seq.pattern || v.reset !== seq.reset || Number(v.nextValue) !== seq.nextValue;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.put<NumberingSequence[]>(`/companies/${companyId}/numbering/${seq.docType}`, { pattern: v.pattern, reset: v.reset, nextValue: Number(v.nextValue) });
      qc.setQueryData(qk.numbering(companyId), data);
      toast.success(t('common.saved'));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="grid items-end gap-3 border-b border-border px-5 py-4 last:border-0 sm:grid-cols-[8rem_1fr_9rem_7rem_auto]">
      <div><p className="font-medium">{t(`numbering.${seq.docType as DocType}`)}</p><p className="tabular text-xs text-muted">{seq.preview}</p></div>
      <Field label={t('numbering.pattern')} htmlFor={`p-${seq.docType}`}><Input id={`p-${seq.docType}`} className="font-mono text-[13px]" disabled={!isAdmin} value={v.pattern} onChange={(e) => setV({ ...v, pattern: e.target.value })} /></Field>
      <Field label={t('numbering.reset')} htmlFor={`r-${seq.docType}`}><Select id={`r-${seq.docType}`} disabled={!isAdmin} value={v.reset} onChange={(e) => setV({ ...v, reset: e.target.value as 'yearly' | 'never' })}><option value="yearly">{t('numbering.yearly')}</option><option value="never">{t('numbering.never')}</option></Select></Field>
      <Field label={t('numbering.nextValue')} htmlFor={`n-${seq.docType}`}><Input id={`n-${seq.docType}`} type="number" min={seq.nextValue} disabled={!isAdmin} value={v.nextValue} onChange={(e) => setV({ ...v, nextValue: e.target.value })} /></Field>
      {isAdmin && <Button type="submit" variant="secondary" disabled={!dirty} loading={busy}>{t('common.save')}</Button>}
    </form>
  );
}

export function NumberingPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const list = useNumbering(companyId);
  const isAdmin = useIsAdmin(companyId);
  return (
    <>
      <PageHeader title={t('numbering.title')} description={t('numbering.subtitle')} />
      <Card>{list.isLoading ? <CardBody><Skeleton className="h-40" /></CardBody> : list.data?.map((s) => <SequenceRow key={`${s.docType}-${s.pattern}-${s.nextValue}`} companyId={companyId} seq={s} isAdmin={isAdmin} />)}</Card>
    </>
  );
}

// ── Accès ──────────────────────────────────────────────────────────────

export function MembersPage() {
  const { t } = useTranslation();
  const { companyId = '' } = useParams();
  const me = useMe();
  const members = useMembers(companyId);
  const users = useUsers(me.user.role === 'owner');
  const qc = useQueryClient();
  const onError = useToastError();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<CompanyRole>('editor');
  const candidates = users.data?.filter((u) => u.isActive && !members.data?.some((m) => m.userId === u.id)) ?? [];
  const setMember = async (uid: string, r: CompanyRole) => {
    try {
      const data = await api.put(`/companies/${companyId}/members`, { userId: uid, role: r });
      qc.setQueryData(qk.members(companyId), data);
      setUserId('');
    } catch (e) {
      onError(e);
    }
  };
  const remove = async (uid: string) => {
    try {
      await api.del(`/companies/${companyId}/members/${uid}`);
      await qc.invalidateQueries({ queryKey: qk.members(companyId) });
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <PageHeader title={t('members.title')} description={t('members.subtitle')} />
      <Card>
        <CardHeader title={t('members.title')} description={t('members.ownerNote')} />
        {members.isLoading ? <CardBody><Skeleton className="h-20" /></CardBody> : (
          <Table>
            <thead><tr><th>{t('members.user')}</th><th>{t('members.role')}</th><th className="text-right">{t('common.actions')}</th></tr></thead>
            <tbody>
              {members.data?.map((m) => (
                <tr key={m.userId}>
                  <td><p className="font-medium">{m.displayName}</p><p className="text-xs text-muted">{m.email}</p></td>
                  <td><Select aria-label={t('members.role')} className="h-8 w-40" value={m.role} disabled={m.userId === me.user.id} onChange={(e) => void setMember(m.userId, e.target.value as CompanyRole)}>{COMPANY_ROLES.map((r) => <option key={r} value={r}>{t(`members.${r}`)}</option>)}</Select></td>
                  <td className="text-right">{m.userId !== me.user.id && <Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => void remove(m.userId)}><Trash2 /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {me.user.role === 'owner' && candidates.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-4">
            <Field label={t('members.user')} htmlFor="m-user" className="min-w-48 flex-1"><Select id="m-user" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">—</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>)}</Select></Field>
            <Field label={t('members.role')} htmlFor="m-role"><Select id="m-role" value={role} onChange={(e) => setRole(e.target.value as CompanyRole)}>{COMPANY_ROLES.map((r) => <option key={r} value={r}>{t(`members.${r}`)}</option>)}</Select></Field>
            <Button disabled={!userId} onClick={() => void setMember(userId, role)}><Plus />{t('members.grant')}</Button>
          </div>
        )}
      </Card>
    </>
  );
}
