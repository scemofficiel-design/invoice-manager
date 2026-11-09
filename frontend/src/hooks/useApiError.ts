import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/services/api';

/** Message lisible pour une erreur API (les messages backend sont déjà en français). */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.code === 'NETWORK') return t('errors.network');
      if (err.code === 'RATE_LIMITED') return t('errors.RATE_LIMITED');
      if (err.details?.length) return err.details.map((d) => (d.path ? `${d.path} : ${d.message}` : d.message)).join(' · ');
      return err.message;
    }
    return t('common.error');
  };
}

export function useToastError() {
  const msg = useErrorMessage();
  return (err: unknown) => toast.error(msg(err));
}
