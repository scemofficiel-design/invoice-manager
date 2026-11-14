import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, Eye, Share } from 'lucide-react';
import { api } from '@/services/api';
import { canShareFiles, openFile, saveFile } from '@/lib/files';
import { useToastError } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';

/**
 * PDF générés dans l'appareil.
 * - iPhone / iPad : un bouton « PDF » ouvre la feuille de partage d'iOS, qui affiche l'aperçu et
 *   propose Imprimer, Enregistrer dans Fichiers, Mail, AirDrop…
 * - Ordinateur : « Aperçu » (nouvel onglet) et « Télécharger ».
 */
export function PdfButtons({ path }: { path: string }) {
  const { t } = useTranslation();
  const onError = useToastError();
  const [busy, setBusy] = useState<'view' | 'save' | null>(null);
  const share = canShareFiles();
  const run = async (kind: 'view' | 'save') => {
    setBusy(kind);
    try {
      const f = await api.file(path);
      if (kind === 'view') openFile(f.data, f.mime);
      else if ((await saveFile(f.data, f.filename, f.mime)) === 'downloaded') toast.success(t('doc.pdfSaved', { name: f.filename }));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };
  if (share) return <Button variant="secondary" loading={busy === 'save'} onClick={() => void run('save')}><Share />{t('doc.pdfShare')}</Button>;
  return (
    <>
      <Button variant="secondary" loading={busy === 'view'} onClick={() => void run('view')}><Eye />{t('doc.pdfPreview')}</Button>
      <Button variant="secondary" loading={busy === 'save'} onClick={() => void run('save')}><Download />{t('doc.pdfDownload')}</Button>
    </>
  );
}
