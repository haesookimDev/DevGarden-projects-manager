import { internalFetch } from './internal';

export type TodoStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type TodoSource = 'INTERNAL' | 'GITHUB_ISSUE';

export interface TodoRow {
  id: string;
  projectId: string;
  repoFullName: string;
  title: string;
  body: string | null;
  status: TodoStatus;
  sourceType: TodoSource;
  sourceRef: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function listTodosByOwner(
  ownerId: string,
  opts: { source?: TodoSource; status?: TodoStatus; projectId?: string; limit?: number } = {},
): Promise<TodoRow[]> {
  const params = new URLSearchParams({ ownerId });
  if (opts.source) params.set('source', opts.source);
  if (opts.status) params.set('status', opts.status);
  if (opts.projectId) params.set('projectId', opts.projectId);
  if (opts.limit) params.set('limit', String(opts.limit));
  const res = await internalFetch(`/internal/todos?${params.toString()}`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listTodosByOwner failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TodoRow[];
}

export interface CreateInternalTodoInput {
  projectId: string;
  title: string;
  body?: string;
}

export async function createInternalTodo(input: CreateInternalTodoInput): Promise<TodoRow> {
  const res = await internalFetch('/internal/todos', { method: 'POST', body: input });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createInternalTodo failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TodoRow;
}

export async function setTodoStatus(id: string, status: TodoStatus): Promise<TodoRow> {
  const res = await internalFetch(`/internal/todos/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`setTodoStatus failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TodoRow;
}
