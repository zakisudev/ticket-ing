import { useEffect } from 'react';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Registers `C` to trigger onAddTicket unless the user is typing.
 * Escape is handled natively by inputs/dialogs.
 */
export function useQuickCreateShortcut(enabled: boolean, onAddTicket: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onAddTicket();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onAddTicket]);
}
