'use client';

import { useActionState, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@devgarden/ui';
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
  const [projectId, setProjectId] = useState('');
  const [harnessId, setHarnessId] = useState('');
  const [clientId, setClientId] = useState('');

  const disabled =
    pending || projects.length === 0 || harnesses.length === 0 || clients.length === 0;

  return (
    <form action={action} className="mt-6 max-w-xl space-y-4" data-testid="run-trigger-form">
      <SelectField
        name="projectId"
        label="Project"
        value={projectId}
        onValueChange={setProjectId}
        options={projects.map((p) => ({ value: p.id, label: p.repoFullName }))}
        disabled={pending}
        testIdPrefix="run-trigger-project"
      />
      <SelectField
        name="harnessId"
        label="Harness"
        value={harnessId}
        onValueChange={setHarnessId}
        options={harnesses.map((h) => ({ value: h.id, label: `${h.name} (v${h.version})` }))}
        disabled={pending}
        testIdPrefix="run-trigger-harness"
      />
      <SelectField
        name="clientId"
        label="Client"
        value={clientId}
        onValueChange={setClientId}
        options={clients.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.status.toLowerCase()})`,
        }))}
        disabled={pending}
        testIdPrefix="run-trigger-client"
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
      <div className="space-y-1.5">
        <Label htmlFor="run-trigger-inputs">Inputs (optional JSON object)</Label>
        <Textarea
          id="run-trigger-inputs"
          name="inputs"
          rows={4}
          placeholder='{ "issue": 42 }'
          disabled={pending}
          className="font-mono text-xs"
        />
      </div>

      <Button type="submit" disabled={disabled} data-testid="run-trigger-submit">
        {pending ? 'Queuing…' : 'Run harness'}
      </Button>

      {state.error && (
        <p
          data-testid="run-trigger-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
  value,
  onValueChange,
  options,
  disabled,
  testIdPrefix,
}: {
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  testIdPrefix: string;
}) {
  const id = `${testIdPrefix}-select`;
  const empty = options.length === 0;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {/* Radix Select is controlled, so back it with a hidden input for native
          form-action submission (no client JSON fetch). */}
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={onValueChange} disabled={disabled || empty}>
        <SelectTrigger id={id} data-testid={`${testIdPrefix}-trigger`}>
          <SelectValue placeholder={empty ? '(none available)' : '— select —'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
  const id = `run-trigger-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="text" placeholder={placeholder} disabled={disabled} />
    </div>
  );
}
