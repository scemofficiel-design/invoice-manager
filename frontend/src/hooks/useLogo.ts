import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

/** URL locale (blob:) du logo d'une entreprise, lu dans la base de l'appareil. */
export function useLogoUrl(companyId: string, hasLogo: boolean): string | null {
  const q = useQuery({
    queryKey: ['company', companyId, 'logo', hasLogo],
    queryFn: () => api.file(`/companies/${companyId}/logo`),
    enabled: hasLogo,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return setUrl(null);
    const u = URL.createObjectURL(new Blob([q.data.data as Uint8Array<ArrayBuffer>], { type: q.data.mime }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);
  return hasLogo ? url : null;
}
