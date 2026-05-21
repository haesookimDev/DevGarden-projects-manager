'use client';

import { useState, useTransition } from 'react';
import { createInternalTodoAction } from './actions';

export interface NewTodoFormProps {
  projects: Array<{ id: string; repoFullName: string }>;
}

export function NewTodoForm({ projects }: NewTodoFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noProjects = projects.length === 0;

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createInternalTodoAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form
      action={handleSubmit}
      data-testid="new-todo-form"
      className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-neutral-800 p-3 sm:grid-cols-[180px_1fr_auto]"
    >
      <select
        name="projectId"
        required
        disabled={pending || noProjects}
        defaultValue=""
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
      >
        <option value="" disabled>
          {noProjects ? '(no projects)' : '— project —'}
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.repoFullName}
          </option>
        ))}
      </select>
      <input
        name="title"
        placeholder="What needs doing?"
        required
        disabled={pending}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={pending || noProjects}
        data-testid="new-todo-submit"
        className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add'}
      </button>
      {error && (
        <p
          data-testid="new-todo-error"
          className="sm:col-span-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </p>
      )}
    </form>
  );
}
