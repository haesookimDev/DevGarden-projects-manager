'use client';

// One webhook delivery row. Click to lazy-load + toggle the payload JSON;
// Redeliver posts to the BFF and shows the typed result inline. A 30s
// cooldown after a redeliver throttles repeated clicks (roadmap §6).

import { useCallback, useRef, useState } from 'react';
import { Badge, Button } from '@devgarden/ui';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { RedeliverResult, WebhookEventDetail, WebhookEventRow } from '@/lib/api/webhooks';

const REDELIVER_COOLDOWN_MS = 30_000;

export function WebhookRow({ event }: { event: WebhookEventRow }) {
  const [expanded, setExpanded] = useState(false);
  const [payload, setPayload] = useState<unknown>(undefined);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [redeliver, setRedeliver] = useState<
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'done'; result: RedeliverResult }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const cooldownUntil = useRef(0);

  const toggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && payload === undefined && payloadError === null) {
      try {
        const res = await fetch(`/api/webhooks/${encodeURIComponent(event.id)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const detail = (await res.json()) as WebhookEventDetail;
        setPayload(detail.payload);
      } catch (e) {
        setPayloadError(e instanceof Error ? e.message : 'unknown');
      }
    }
  }, [expanded, payload, payloadError, event.id]);

  const doRedeliver = useCallback(async () => {
    if (Date.now() < cooldownUntil.current) return;
    setRedeliver({ kind: 'pending' });
    try {
      const res = await fetch(`/api/webhooks/${encodeURIComponent(event.id)}/redeliver`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json()) as RedeliverResult;
      setRedeliver({ kind: 'done', result });
      cooldownUntil.current = Date.now() + REDELIVER_COOLDOWN_MS;
    } catch (e) {
      setRedeliver({ kind: 'error', message: e instanceof Error ? e.message : 'unknown' });
    }
  }, [event.id]);

  return (
    <li className="px-4 py-3" data-testid="webhooks-row" data-event-id={event.id}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          className="flex flex-1 items-center gap-2 text-left"
          data-testid="webhooks-row-toggle"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )}
          <Badge variant="outline" className="text-[10px]">
            {event.eventType}
            {event.action ? `:${event.action}` : ''}
          </Badge>
          <span className="truncate text-sm">{event.repoFullName ?? '(unmatched repo)'}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {new Date(event.receivedAt).toLocaleString()}
          </span>
        </button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void doRedeliver()}
          disabled={redeliver.kind === 'pending'}
          data-testid="webhooks-row-redeliver"
        >
          <RefreshCw
            className={'mr-1 h-3.5 w-3.5 ' + (redeliver.kind === 'pending' ? 'animate-spin' : '')}
          />
          Redeliver
        </Button>
      </div>

      {redeliver.kind === 'done' && (
        <p
          className={
            'mt-2 text-xs ' + (redeliver.result.ok ? 'text-emerald-500' : 'text-amber-500')
          }
          data-testid="webhooks-row-redeliver-result"
        >
          {redeliver.result.ok
            ? `재전송 요청됨 (delivery #${redeliver.result.deliveryId})`
            : `재전송 실패: ${redeliver.result.message}`}
        </p>
      )}
      {redeliver.kind === 'error' && (
        <p className="mt-2 text-xs text-destructive" data-testid="webhooks-row-redeliver-error">
          {redeliver.message}
        </p>
      )}

      {expanded && (
        <div className="mt-2" data-testid="webhooks-row-payload">
          {payloadError ? (
            <p className="text-xs text-destructive">payload 로드 실패: {payloadError}</p>
          ) : payload === undefined ? (
            <p className="text-xs text-muted-foreground">로딩 중…</p>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3 text-[11px]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
