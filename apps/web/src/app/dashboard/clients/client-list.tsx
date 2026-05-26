'use client';

import { useEffect, useState } from 'react';
import { Laptop } from 'lucide-react';
import { Card, CardContent } from '@devgarden/ui';
import { EmptyState } from '@/components/empty-state';
import type { ClientSummary } from '@/lib/api/clients';

const POLL_INTERVAL_MS = 5_000;

export function ClientList({ initial }: { initial: ClientSummary[] }) {
  const [clients, setClients] = useState<ClientSummary[]>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/clients', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError(`refresh failed: ${res.status}`);
          return;
        }
        const next = (await res.json()) as ClientSummary[];
        if (!cancelled) {
          setClients(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'refresh error');
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (clients.length === 0) {
    return (
      <EmptyState
        className="mt-3"
        icon={Laptop}
        title="등록된 클라이언트가 없습니다"
        description="우상단의 “Add client” 를 눌러 페어링 토큰을 발급하세요. 토큰은 10분간 유효합니다."
        testId="dashboard-clients-empty"
      />
    );
  }

  return (
    <>
      {error && (
        <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <Card className="mt-3 overflow-hidden p-0">
        <CardContent className="p-0">
          <ul data-testid="client-list" className="divide-y divide-border">
            {clients.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.name}</p>
                  <StatusPill status={c.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.hostname ?? '?'} · {c.os ?? '?'}
                  {c.lastSeenAt && ` · last seen ${new Date(c.lastSeenAt).toLocaleString()}`}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

function StatusPill({ status }: { status: 'ONLINE' | 'OFFLINE' }) {
  const isOnline = status === 'ONLINE';
  return (
    <span
      data-testid={`status-${status.toLowerCase()}`}
      className={
        isOnline
          ? 'rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-500'
          : 'rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      ● {isOnline ? 'online' : 'offline'}
    </span>
  );
}
