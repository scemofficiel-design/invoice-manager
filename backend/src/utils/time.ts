import { uuidv7 } from 'uuidv7';

export const newId = (): string => uuidv7();
export const nowIso = (): string => new Date().toISOString();

/** Date locale du jour (YYYY-MM-DD), sans conversion UTC. */
export function todayLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ajoute des jours à une date 'YYYY-MM-DD' (calcul en UTC pour éviter les changements d'heure). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
