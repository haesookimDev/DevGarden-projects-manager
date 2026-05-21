'use client';

import { useEffect, useState } from 'react';
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
      <p className="mt-3 text-sm text-neutral-500">
        등록된 클라이언트가 없습니다. &ldquo;Add client&rdquo; 를 눌러 페어링 토큰을 발급하세요.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="mt-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
      <ul
        data-testid="client-list"
        className="mt-3 divide-y divide-neutral-800 rounded-md border border-neutral-800"
      >
        {clients.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{c.name}</p>
              <StatusPill status={c.status} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {c.hostname ?? '?'} · {c.os ?? '?'}
              {c.lastSeenAt && ` · last seen ${new Date(c.lastSeenAt).toLocaleString()}`}
            </p>
          </li>
        ))}
      </ul>
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
          ? 'rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300'
          : 'rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400'
      }
    >
      ● {isOnline ? 'online' : 'offline'}
    </span>
  );
}
