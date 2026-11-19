import { useEffect, type ReactElement } from 'react';
import { Alert } from '@hexadata/brand/react';
import { useUi, type Toast } from '../store/ui.ts';
import { IconX } from './icons.tsx';

const TONE = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

function ToastItem({ toast }: { toast: Toast }): ReactElement {
  const dismiss = useUi((state) => state.dismissToast);
  useEffect(() => {
    if (toast.timeout <= 0) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.timeout);
    return () => clearTimeout(timer);
  }, [toast.id, toast.timeout, dismiss]);

  return (
    <Alert
      tone={TONE[toast.tone]}
      className="toast"
      role={toast.tone === 'danger' ? 'alert' : 'status'}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          className="hd-btn hd-btn--ghost hd-btn--sm"
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        className="icon-btn"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
      >
        <IconX />
      </button>
    </Alert>
  );
}

/** Notification stack (bottom of the screen). Success/neutral are polite, errors are assertive. */
export function Toasts(): ReactElement {
  const toasts = useUi((state) => state.toasts);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
