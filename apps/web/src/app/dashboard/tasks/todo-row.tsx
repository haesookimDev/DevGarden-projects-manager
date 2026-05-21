'use client';

import { useTransition } from 'react';
import { updateTodoStatusAction } from './actions';
import type { TodoRow as TodoData } from '@/lib/api/todos';

export function TodoRow({ todo }: { todo: TodoData }) {
  const [pending, startTransition] = useTransition();

  const advance = todo.status === 'OPEN' ? 'IN_PROGRESS' : todo.status === 'IN_PROGRESS' ? 'DONE' : null;

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
        <p className="mt-1 text-xs text-neutral-500">
          {todo.repoFullName} · updated {new Date(todo.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill status={todo.status} />
        {advance && (
          <button
            type="button"
            disabled={pending}
            data-testid="todo-advance"
            onClick={() => startTransition(() => updateTodoStatusAction(todo.id, advance))}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? '…' : advance === 'IN_PROGRESS' ? 'Start' : 'Done'}
          </button>
        )}
        {todo.status !== 'OPEN' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => updateTodoStatusAction(todo.id, 'OPEN'))}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          >
            Reopen
          </button>
        )}
      </div>
    </li>
  );
}

function SourceBadge({ source, sourceRef }: { source: string; sourceRef: number | null }) {
  if (source === 'GITHUB_ISSUE') {
    return (
      <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
        gh#{sourceRef ?? '?'}
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-xs text-emerald-200">
      todo
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: 'bg-neutral-800 text-neutral-300',
    IN_PROGRESS: 'bg-amber-950 text-amber-200',
    DONE: 'bg-emerald-950 text-emerald-300',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${map[status] ?? 'bg-neutral-800'}`}>
      {status.toLowerCase()}
    </span>
  );
}
