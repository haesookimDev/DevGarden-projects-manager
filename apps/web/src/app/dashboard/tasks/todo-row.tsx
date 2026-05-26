'use client';

import { useTransition } from 'react';
import { Button } from '@devgarden/ui';
import { updateTodoStatusAction } from './actions';
import type { TodoRow as TodoData } from '@/lib/api/todos';

export function TodoRow({ todo }: { todo: TodoData }) {
  const [pending, startTransition] = useTransition();

  const advance =
    todo.status === 'OPEN' ? 'IN_PROGRESS' : todo.status === 'IN_PROGRESS' ? 'DONE' : null;

  return (
    <li
      data-testid="todo-row"
      data-source={todo.sourceType}
      data-status={todo.status}
      className="flex items-start justify-between gap-3 px-4 py-3"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SourceBadge source={todo.sourceType} sourceRef={todo.sourceRef} />
          <p className="truncate font-medium">{todo.title}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {todo.repoFullName} · updated {new Date(todo.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={todo.status} />
        {advance && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="todo-advance"
            onClick={() => startTransition(() => updateTodoStatusAction(todo.id, advance))}
          >
            {pending ? '…' : advance === 'IN_PROGRESS' ? 'Start' : 'Done'}
          </Button>
        )}
        {todo.status !== 'OPEN' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => updateTodoStatusAction(todo.id, 'OPEN'))}
          >
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}

function SourceBadge({ source, sourceRef }: { source: string; sourceRef: number | null }) {
  if (source === 'GITHUB_ISSUE') {
    return (
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        gh#{sourceRef ?? '?'}
      </span>
    );
  }
  return (
    <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs text-emerald-500">
      todo
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'IN_PROGRESS'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
      : status === 'DONE'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
        : 'border-border bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{status.toLowerCase()}</span>
  );
}
