import { canShareFiles, openFile, saveFile } from '@/lib/files';
import { api } from '@/services/api';

/** Ouvre un fichier de l'app : feuille de partage iOS (aperçu inclus) sur iPhone, nouvel onglet ailleurs. */
export async function openOrShare(path: string): Promise<void> {
  const f = await api.file(path);
  if (canShareFiles()) await saveFile(f.data, f.filename, f.mime);
  else openFile(f.data, f.mime);
}
