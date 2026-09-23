import { clsx } from 'clsx';
import { useEffect, useId, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
import type { TagDto, TicketPriority, TicketStatus, TicketType } from '@zakisu-tickets/shared';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
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
        className,
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
        className,
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
        className,
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
        className,
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
    <span
      className={clsx(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
        PRIORITY_STYLE[priority],
      )}
    >
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

export function BlockedBadge({ reason }: { reason?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger"
      title={reason ?? undefined}
      data-testid={reason !== undefined ? 'blocked-badge' : undefined}
    >
      BLOCKED
    </span>
  );
}

/** Subtle shipped-with-caveats indicator — noticeable, not alarming like BLOCKED. */
export function LimitationsBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
      title="This ticket has recorded limitations"
      data-testid="limitations-badge"
    >
      LIMITATIONS
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: TagDto; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: tag.color ? `${tag.color}22` : undefined,
        color: tag.color ?? 'var(--color-text-muted)',
        border: tag.color ? `1px solid ${tag.color}55` : '1px solid var(--color-border)',
      }}
      data-testid={`tag-${tag.slug}`}
    >
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X size={9} />
        </button>
      ) : null}
    </span>
  );
}

export function StatusPill({ status }: { status: TicketStatus }) {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
      {status.replace('_', ' ')}
    </span>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  width = 'md',
  role = 'dialog',
  descriptionId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  role?: 'dialog' | 'alertdialog';
  descriptionId?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx('w-full rounded-lg border border-border bg-surface shadow-xl', {
          'max-w-sm': width === 'sm',
          'max-w-lg': width === 'md',
          'max-w-3xl': width === 'lg',
        })}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
}) {
  const descriptionId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      setError(null);
    }
  }, [open]);

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const confirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The action could not be completed. Please try again.',
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      width="sm"
      role="alertdialog"
      descriptionId={descriptionId}
    >
      <p id={descriptionId} className="text-sm leading-6 text-text-muted">
        {description}
      </p>
      {error ? (
        <p className="mt-3 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting} autoFocus>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => void confirm()}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
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
    <div
      className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted"
      role="status"
    >
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label ?? 'Loading…'}
    </div>
  );
}
