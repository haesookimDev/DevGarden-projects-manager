'use client';

import { useState, useTransition } from 'react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';
import { createInternalTodoAction } from './actions';

export interface NewTodoFormProps {
  projects: Array<{ id: string; repoFullName: string }>;
}

export function NewTodoForm({ projects }: NewTodoFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState('');
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
      className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-[180px_1fr_auto]"
    >
      {/* Hidden input mirrors Radix Select's controlled value for form action. */}
      <input type="hidden" name="projectId" value={projectId} />
      <Select value={projectId} onValueChange={setProjectId} disabled={pending || noProjects}>
        <SelectTrigger data-testid="new-todo-project-trigger" className="h-9">
          <SelectValue placeholder={noProjects ? '(no projects)' : '— project —'} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.repoFullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        name="title"
        placeholder="What needs doing?"
        required
        disabled={pending}
        className="h-9"
      />
      <Button
        type="submit"
        disabled={pending || noProjects}
        data-testid="new-todo-submit"
        size="sm"
      >
        {pending ? 'Adding…' : 'Add'}
      </Button>
      {error && (
        <p
          data-testid="new-todo-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:col-span-3"
        >
          {error}
        </p>
      )}
    </form>
  );
}
