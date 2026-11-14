/**
 * Fichiers créés sur l'appareil : menu « Partager » d'iOS (Enregistrer dans Fichiers, iCloud Drive,
 * Mail, AirDrop, Imprimer…) quand il est disponible, sinon téléchargement classique.
 */
export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Le système sait-il partager des fichiers (iPhone, iPad, certains Android) ? */
export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array([37])], 'test.pdf', { type: 'application/pdf' });
    return !!navigator.canShare?.({ files: [probe] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent + (navigator.maxTouchPoints > 1 ? ' iPad' : ''));
  } catch {
    return false;
  }
}

export async function saveFile(data: Uint8Array, filename: string, mime: string, title?: string): Promise<SaveResult> {
  const file = new File([data as Uint8Array<ArrayBuffer>], filename, { type: mime });
  // Partage réservé aux téléphones/tablettes : sur ordinateur, un téléchargement direct est attendu.
  if (canShareFiles() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // Partage indisponible (ex. ordinateur) : repli sur le téléchargement.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Ouvre un PDF dans la visionneuse du système (aperçu, impression). */
export function openFile(data: Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }));
  const w = window.open(url, '_blank');
  if (!w) window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}
