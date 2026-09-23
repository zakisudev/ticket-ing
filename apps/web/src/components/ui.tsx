import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import type { TicketPriority, TicketStatus, TicketType } from '@zakisu-tickets/shared';

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        {
          'bg-accent text-white hover:opacity-90': variant === 'primary',
          'border border-border bg-surface text-text hover:bg-surface-2': variant === 'secondary',
          'text-text-muted hover:bg-surface-2 hover:text-text': variant === 'ghost',
          'bg-danger text-white hover:opacity-90': variant === 'danger',
        },
        { 'h-7 px-2.5 text-xs': size === 'sm', 'h-8 px-3 text-sm': size === 'md' },
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text placeholder:text-text-muted/60 focus:border-accent',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted/60 focus:border-accent',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'h-8 rounded-md border border-border bg-surface px-2 text-sm text-text focus:border-accent',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  P0: 'bg-danger/15 text-danger',
  P1: 'bg-warning/15 text-warning',
  P2: 'bg-accent-soft text-text-muted',
  P3: 'bg-surface-2 text-text-muted',
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide', PRIORITY_STYLE[priority])}>
      {priority}
    </span>
  );
}

const TYPE_LABEL: Partial<Record<TicketType, string>> = {
  FEATURE: 'FEAT',
  BUG: 'BUG',
  SECURITY: 'SEC',
  OPS: 'OPS',
  UX: 'UX',
  REFACTOR: 'REF',
  RESEARCH: 'RSRCH',
  DOCUMENTATION: 'DOC',
};

export function TypeBadge({ type }: { type: TicketType }) {
  return (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
      BLOCKED
    </span>
  );
}

export function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">{status.replace('_', ' ')}</span>
  );
}

export function Dialog({ open, onClose, title, children, width = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          'w-full rounded-lg border border-border bg-surface shadow-xl',
          { 'max-w-sm': width === 'sm', 'max-w-lg': width === 'md', 'max-w-3xl': width === 'lg' }
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <div className="text-text-muted">{icon}</div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted" role="status">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label ?? 'Loading…'}
    </div>
  );
}
