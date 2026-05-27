'use client';

// Client component that pairs the HarnessEditor with the save form. The
// parent server component fetches the initial yaml + history; this one owns
// the live yaml + validation state and decides whether the Save button can
// fire.

import { useState, useTransition } from 'react';
import { Button, Input, Label } from '@devgarden/ui';
import { Save } from 'lucide-react';
import { HarnessEditor, type ValidationResult } from './harness-editor';

export interface EditorPageClientProps {
  initialYaml: string;
  initialName: string;
  /** When set, the Name input is locked — saving a known harness should
   *  keep the same name and just bump the version. */
  lockName?: boolean;
  /** Server action wired by the parent. Receives the form payload. */
  saveAction(formData: FormData): Promise<void> | void;
}

export function EditorPageClient({
  initialYaml,
  initialName,
  lockName = false,
  saveAction,
}: EditorPageClientProps) {
  const [yaml, setYaml] = useState(initialYaml);
  const [name, setName] = useState(initialName);
  const [result, setResult] = useState<ValidationResult>({ kind: 'pending' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSave =
    result.kind === 'ok' && name.trim().length > 0 && yaml.trim().length > 0 && !pending;

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await saveAction(formData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown');
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-4" data-testid="harness-editor-form">
      <input type="hidden" name="yaml" value={yaml} />
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="harness-editor-name">Name</Label>
          <Input
            id="harness-editor-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            readOnly={lockName}
            data-testid="harness-editor-name"
          />
        </div>
        <Button type="submit" disabled={!canSave} size="sm" data-testid="harness-editor-save">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {pending ? 'Saving…' : 'Save (new version)'}
        </Button>
      </div>

      {error && (
        <p
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="harness-editor-save-error"
        >
          {error}
        </p>
      )}

      <HarnessEditor
        initialYaml={initialYaml}
        onYamlChange={setYaml}
        onValidationChange={setResult}
      />
    </form>
  );
}
