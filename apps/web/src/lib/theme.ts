export type ThemePreference = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'zt-theme';

export function loadThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'light' || value === 'system') return value;
  } catch {
    /* private mode */
  }
  return 'dark';
}

export function applyTheme(pref: ThemePreference): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = pref === 'dark' || (pref === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', dark);
}

export function saveThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}
