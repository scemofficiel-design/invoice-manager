import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/card';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Card>
      <EmptyState icon={<SearchX />} title={t('errors.NOT_FOUND')} action={<Button asChild variant="secondary"><Link to="/">{t('nav.home')}</Link></Button>} />
    </Card>
  );
}
