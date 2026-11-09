export type Theme = 'light' | 'dark' | 'system';

let mql: MediaQueryList | null = null;
let listener: (() => void) | null = null;

export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem('im-theme', theme);
  } catch {
    /* préférence non mémorisée localement */
  }
  mql ??= window.matchMedia('(prefers-color-scheme: dark)');
  if (listener) mql.removeEventListener('change', listener);
  const update = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mql!.matches));
  listener = theme === 'system' ? update : null;
  if (listener) mql.addEventListener('change', listener);
  update();
}

export function currentTheme(): Theme {
  try {
    return (localStorage.getItem('im-theme') as Theme) ?? 'system';
  } catch {
    return 'system';
  }
}
