import { useTranslation } from 'react-i18next';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Aperçu (visionneuse PDF du navigateur, qui permet aussi l'impression) et téléchargement. */
export function PdfButtons({ href }: { href: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="secondary" asChild>
        <a href={href} target="_blank" rel="noopener"><FileText />{t('doc.pdfPreview')}</a>
      </Button>
      <Button variant="secondary" size="icon" asChild>
        <a href={`${href}?download=1`} download aria-label={t('doc.pdfDownload')} title={t('doc.pdfDownload')}><Download /></a>
      </Button>
    </>
  );
}
