'use client';

import { useEffect, useState } from 'react';

interface Toast {
  id: string;
  kind: string;
  title: string;
  body: string | null;
}

const DISMISS_MS = 6_000;

// Subscribes to the notification SSE stream and shows a transient toast for
// each new web-toast notification (run finished / budget alert / test). The
// stream is owner-scoped server-side; pings are ignored here.
export function NotificationsToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const source = new EventSource('/api/notifications/stream');
    source.onmessage = (e: MessageEvent<string>) => {
      let data: Partial<Toast>;
      try {
        data = JSON.parse(e.data) as Partial<Toast>;
      } catch {
        return;
      }
      if (!data.id || !data.title) return; // ping / malformed
      const toast: Toast = {
        id: data.id,
        kind: data.kind ?? '',
        title: data.title,
        body: data.body ?? null,
      };
      setToasts((cur) => (cur.some((t) => t.id === toast.id) ? cur : [...cur, toast]));
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== toast.id)), DISMISS_MS);
    };
    // EventSource reconnects automatically on transient errors.
    return () => source.close();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" data-testid="toaster">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          data-testid="toast"
          className="rounded-md border border-border bg-card px-4 py-3 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{t.title}</p>
            <button
              type="button"
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              aria-label="dismiss notification"
              data-testid="toast-dismiss"
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>
          {t.body && <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>}
        </div>
      ))}
    </div>
  );
}
