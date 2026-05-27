'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@devgarden/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { CloneStatus } from '@/lib/api/projects';

interface Snapshot {
  cloneStatus: CloneStatus;
  cloneError: string | null;
  cloneCompletedAt: string | null;
}

interface ProjectCloneResponse {
  cloneStatus: CloneStatus;
  cloneError: string | null;
  cloneCompletedAt: string | null;
}

const POLL_INTERVAL_MS = 2_000;

export function CloneStatusPoller({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Snapshot;
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [transportError, setTransportError] = useState<string | null>(null);

  useEffect(() => {
    if (snap.cloneStatus !== 'CLONING') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/clone-status`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ProjectCloneResponse;
        if (cancelled) return;
        setSnap(body);
        setTransportError(null);
        if (body.cloneStatus === 'READY') {
          // Give the user a moment to see "ready", then bounce to detail.
          setTimeout(() => router.push(`/dashboard/projects/${projectId}`), 800);
        }
      } catch (err) {
        if (cancelled) return;
        setTransportError(err instanceof Error ? err.message : 'unknown');
      }
    };
    const handle = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [projectId, router, snap.cloneStatus]);

  return (
    <div className="space-y-3" data-testid="clone-status-poller">
      <StatusBadge status={snap.cloneStatus} />
      {snap.cloneError && (
        <p
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-testid="clone-status-error"
        >
          {snap.cloneError}
        </p>
      )}
      {snap.cloneCompletedAt && (
        <p className="text-xs text-muted-foreground" data-testid="clone-status-completed">
          완료: {new Date(snap.cloneCompletedAt).toLocaleString()}
        </p>
      )}
      {transportError && (
        <p className="text-xs text-amber-500" data-testid="clone-status-transport-error">
          상태 조회 실패: {transportError} (자동 재시도 중)
        </p>
      )}
      {snap.cloneStatus === 'READY' && (
        <Button asChild size="sm" variant="outline" data-testid="clone-status-detail-link">
          <a href={`/dashboard/projects/${projectId}`}>Open project →</a>
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CloneStatus }) {
  switch (status) {
    case 'NOT_CLONED':
      return (
        <p className="text-sm text-muted-foreground" data-testid="clone-status-badge-not-cloned">
          아직 시작되지 않음
        </p>
      );
    case 'CLONING':
      return (
        <p
          className="flex items-center gap-1.5 text-sm font-medium"
          data-testid="clone-status-badge-cloning"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Cloning...
        </p>
      );
    case 'READY':
      return (
        <p
          className="flex items-center gap-1.5 text-sm font-medium text-emerald-500"
          data-testid="clone-status-badge-ready"
        >
          <CheckCircle2 className="h-4 w-4" />
          Ready
        </p>
      );
    case 'FAILED':
      return (
        <p
          className="flex items-center gap-1.5 text-sm font-medium text-destructive"
          data-testid="clone-status-badge-failed"
        >
          <AlertTriangle className="h-4 w-4" />
          Failed
        </p>
      );
  }
}
