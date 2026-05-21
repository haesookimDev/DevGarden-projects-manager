import Link from 'next/link';
import { auth } from '@/auth';
import { listProjectsByOwner, type ProjectSummary } from '@/lib/api/projects';
import { listTodosByOwner, type TodoRow as TodoData, type TodoSource } from '@/lib/api/todos';
import { NewTodoForm } from './new-todo-form';
import { TodoRow } from './todo-row';

interface PageProps {
  searchParams: Promise<{ source?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await auth();
  const ownerId = session?.user?.id;
  const { source } = await searchParams;
  const filterSource = parseSource(source);

  let projects: ProjectSummary[] = [];
  let todos: TodoData[] = [];
  let error: string | null = null;
  if (ownerId) {
    try {
      [projects, todos] = await Promise.all([
        listProjectsByOwner(ownerId),
        listTodosByOwner(ownerId, { source: filterSource, limit: 100 }),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : 'failed to load tasks';
    }
  }

  const counts = {
    all: todos.length,
    open: todos.filter((t) => t.status === 'OPEN').length,
    inProgress: todos.filter((t) => t.status === 'IN_PROGRESS').length,
    done: todos.filter((t) => t.status === 'DONE').length,
  };

  return (
    <main className="p-8">
      <header className="border-b border-neutral-800 pb-4">
        <p className="text-sm text-neutral-400">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-neutral-500">
          GitHub issues 미러 + 내부 todo 를 한 화면에서. issues 는 webhook 으로 자동 동기화.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <section className="mt-6 flex flex-wrap items-center gap-2">
        <FilterTab href="/dashboard/tasks" active={filterSource === undefined} label="All" testId="tasks-filter-all" />
        <FilterTab
          href="/dashboard/tasks?source=GITHUB_ISSUE"
          active={filterSource === 'GITHUB_ISSUE'}
          label="GitHub issues"
          testId="tasks-filter-issues"
        />
        <FilterTab
          href="/dashboard/tasks?source=INTERNAL"
          active={filterSource === 'INTERNAL'}
          label="Internal"
          testId="tasks-filter-internal"
        />
        <span className="ml-auto text-xs text-neutral-500" data-testid="tasks-counts">
          {counts.all} total · {counts.open} open · {counts.inProgress} in progress · {counts.done} done
        </span>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Add an internal todo</h2>
        <NewTodoForm projects={projects.map((p) => ({ id: p.id, repoFullName: p.repoFullName }))} />
      </section>

      <section className="mt-6">
        {todos.length === 0 && (
          <p className="text-sm text-neutral-500">
            {filterSource ? '필터에 맞는 task 가 없습니다.' : '아직 task 가 없습니다.'}
          </p>
        )}
        {todos.length > 0 && (
          <ul
            data-testid="tasks-list"
            className="divide-y divide-neutral-800 rounded-md border border-neutral-800"
          >
            {todos.map((t) => (
              <TodoRow key={t.id} todo={t} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FilterTab({
  href,
  active,
  label,
  testId,
}: {
  href: string;
  active: boolean;
  label: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      className={`rounded-md px-3 py-1 text-sm ${
        active
          ? 'bg-white text-neutral-900'
          : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {label}
    </Link>
  );
}

function parseSource(s: string | undefined): TodoSource | undefined {
  if (s === 'GITHUB_ISSUE' || s === 'INTERNAL') return s;
  return undefined;
}
