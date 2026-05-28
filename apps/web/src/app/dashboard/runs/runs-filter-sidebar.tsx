'use client';

// Filter sidebar for /dashboard/runs. Every control writes its value into the
// URL search params (router.push), so the page (a server component) re-renders
// with the new filter and the URL stays shareable / bookmarkable. Resetting a
// field removes its param; changing any filter resets page to 1.

import { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';

interface ProjectOption {
  id: string;
  repoFullName: string;
}

const ANY = '__any__';
const STATUSES = ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;

export function RunsFilterSidebar({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = {
    status: params.get('status') ?? ANY,
    projectId: params.get('projectId') ?? ANY,
    q: params.get('q') ?? '',
    since: params.get('since') ?? '',
    until: params.get('until') ?? '',
  };

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === '' || value === ANY) next.delete(key);
      else next.set(key, value);
      // Any filter change resets pagination.
      next.delete('page');
      startTransition(() => {
        router.push(`/dashboard/runs?${next.toString()}`);
      });
    },
    [params, router],
  );

  const clearAll = useCallback(() => {
    startTransition(() => router.push('/dashboard/runs'));
  }, [router]);

  const hasFilters =
    current.status !== ANY ||
    current.projectId !== ANY ||
    current.q !== '' ||
    current.since !== '' ||
    current.until !== '';

  return (
    <aside
      className="space-y-4 rounded-md border border-border p-4"
      data-testid="runs-filter-sidebar"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {hasFilters && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={clearAll}
            data-testid="runs-filter-clear"
          >
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="runs-filter-status">Status</Label>
        <Select value={current.status} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger id="runs-filter-status" data-testid="runs-filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="runs-filter-project">Project</Label>
        <Select value={current.projectId} onValueChange={(v) => setParam('projectId', v)}>
          <SelectTrigger id="runs-filter-project" data-testid="runs-filter-project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.repoFullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="runs-filter-q">Search</Label>
        <Input
          id="runs-filter-q"
          defaultValue={current.q}
          placeholder="run id or branch"
          data-testid="runs-filter-q"
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => setParam('q', e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">Enter 또는 포커스 해제 시 적용</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="runs-filter-since">Since</Label>
          <Input
            id="runs-filter-since"
            type="date"
            defaultValue={current.since.slice(0, 10)}
            data-testid="runs-filter-since"
            onChange={(e) =>
              setParam('since', e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="runs-filter-until">Until</Label>
          <Input
            id="runs-filter-until"
            type="date"
            defaultValue={current.until.slice(0, 10)}
            data-testid="runs-filter-until"
            onChange={(e) =>
              setParam('until', e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </div>
      </div>

      {pending && <p className="text-[11px] text-muted-foreground">Updating…</p>}
    </aside>
  );
}
