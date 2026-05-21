'use client';

import { useActionState } from 'react';
import type { ClientSummary } from '@/lib/api/clients';
import type { HarnessSummary } from '@/lib/api/harnesses';
import type { ProjectSummary } from '@/lib/api/projects';
import { createRunAction } from './actions';
import { INITIAL_CREATE_RUN_STATE } from './state';

export interface RunTriggerFormProps {
  projects: ProjectSummary[];
  harnesses: HarnessSummary[];
  clients: ClientSummary[];
}

export function RunTriggerForm({ projects, harnesses, clients }: RunTriggerFormProps) {
  const [state, action, pending] = useActionState(createRunAction, INITIAL_CREATE_RUN_STATE);

  const disabled = pending || projects.length === 0 || harnesses.length === 0 || clients.length === 0;

  return (
    <form action={action} className="mt-6 max-w-xl space-y-4" data-testid="run-trigger-form">
      <SelectField
        name="projectId"
        label="Project"
        options={projects.map((p) => ({ value: p.id, label: p.repoFullName }))}
        disabled={pending}
      />
      <SelectField
        name="harnessId"
        label="Harness"
        options={harnesses.map((h) => ({ value: h.id, label: `${h.name} (v${h.version})` }))}
        disabled={pending}
      />
      <SelectField
        name="clientId"
        label="Client"
        options={clients.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.status.toLowerCase()})`,
        }))}
        disabled={pending}
      />
      <TextField
        name="branchName"
        label="Branch (optional)"
        placeholder="feat/my-task"
        disabled={pending}
      />
      <TextField
        name="workingDir"
        label="Working dir (optional, defaults to project root)"
        placeholder="/abs/path/to/checkout"
        disabled={pending}
      />
      <label className="block">
        <span className="block text-sm font-medium text-neutral-300">Inputs (optional JSON object)</span>
        <textarea
          name="inputs"
          rows={4}
          placeholder='{ "issue": 42 }'
          disabled={pending}
          className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        />
      </label>

      <button
        type="submit"
        disabled={disabled}
        data-testid="run-trigger-submit"
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? 'Queuing…' : 'Run harness'}
      </button>

      {state.error && (
        <p
          data-testid="run-trigger-error"
          className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}

function SelectField({
  name,
  label,
  options,
  disabled,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-300">{label}</span>
      <select
        name={name}
        required
        disabled={disabled || options.length === 0}
        defaultValue=""
        className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>
          {options.length === 0 ? '(none available)' : '— select —'}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  name,
  label,
  placeholder,
  disabled,
}: {
  name: string;
  label: string;
  placeholder?: string;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-300">{label}</span>
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
