import { useTranslation } from 'react-i18next';
import type { InvoiceDisplayStatus, QuoteStatus } from '@im/shared/constants';
import { Badge } from '@/components/ui/card';

const QUOTE_TONES: Record<QuoteStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', sent: 'accent', accepted: 'success', refused: 'danger', expired: 'warning', cancelled: 'neutral',
};
const INVOICE_TONES: Record<InvoiceDisplayStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral', issued: 'accent', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { t } = useTranslation();
  return <Badge tone={QUOTE_TONES[status]}>{t(`quote.status.${status}`)}</Badge>;
}
export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const { t } = useTranslation();
  return <Badge tone={INVOICE_TONES[status]} className={status === 'cancelled' ? 'line-through' : ''}>{t(`invoice.status.${status}`)}</Badge>;
}
