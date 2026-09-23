import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, loadThemePreference, saveThemePreference } from '@/lib/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('theme', () => {
  it('defaults to dark when no preference is stored', () => {
    expect(loadThemePreference()).toBe('dark');
  });

  it('applies the dark class for the dark preference', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class for light preference', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists a preference and loads it back', () => {
    saveThemePreference('light');
    expect(localStorage.getItem('zt-theme')).toBe('light');
    expect(loadThemePreference()).toBe('light');
  });

  it('falls back to dark on corrupted storage values', () => {
    localStorage.setItem('zt-theme', 'sepia');
    expect(loadThemePreference()).toBe('dark');
  });
});
