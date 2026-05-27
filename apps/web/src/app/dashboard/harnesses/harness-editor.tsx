'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

// Monaco is a ~2 MB editor chunk — dynamic-import keeps it out of the
// initial JS bundle. ssr:false because Monaco touches `window` at module
// load.
const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading editor…
    </div>
  ),
});

export type ValidationResult =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok'; harnessName: string; stepCount: number }
  | { kind: 'error'; message: string; issues: Array<{ path: string; message: string }> };

const DEBOUNCE_MS = 200;

interface ValidatorWorker {
  parse(yaml: string): Promise<ValidationResult>;
}

// We run zod validation through a thin dynamic-imported wrapper so the
// harness-core bundle is also off the initial page. Keeping a memoized
// instance per mount avoids re-importing on every keystroke.
async function loadValidator(): Promise<ValidatorWorker> {
  const { parseHarness, HarnessParseError } = await import('@devgarden/harness-core');
  return {
    async parse(yaml: string) {
      if (!yaml.trim()) {
        return {
          kind: 'error',
          message: 'YAML is empty',
          issues: [{ path: '', message: 'YAML is empty' }],
        };
      }
      try {
        const harness = parseHarness(yaml);
        return {
          kind: 'ok',
          harnessName: harness.name,
          stepCount: harness.steps.length,
        };
      } catch (err) {
        if (err instanceof HarnessParseError) {
          const issues = Array.isArray(err.issues)
            ? (err.issues as Array<{ path?: unknown; message?: unknown }>).map((i) => ({
                path: Array.isArray(i.path) ? i.path.join('.') : '',
                message: typeof i.message === 'string' ? i.message : 'invalid',
              }))
            : [];
          return { kind: 'error', message: err.message, issues };
        }
        return {
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
          issues: [],
        };
      }
    },
  };
}

export interface HarnessEditorProps {
  initialYaml: string;
  onYamlChange?(yaml: string): void;
  onValidationChange?(result: ValidationResult): void;
  /** Read-only mode for older version rows. */
  readOnly?: boolean;
}

export function HarnessEditor({
  initialYaml,
  onYamlChange,
  onValidationChange,
  readOnly = false,
}: HarnessEditorProps) {
  const [yaml, setYaml] = useState(initialYaml);
  const [result, setResult] = useState<ValidationResult>({ kind: 'pending' });
  const [validator, setValidator] = useState<ValidatorWorker | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadValidator().then((v) => {
      if (cancelled) return;
      setValidator(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!validator) return;
    setResult((prev) => (prev.kind === 'pending' ? prev : { kind: 'pending' }));
    const handle = setTimeout(() => {
      void validator.parse(yaml).then((r) => {
        setResult(r);
        onValidationChange?.(r);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [yaml, validator, onValidationChange]);

  const handleChange = (value: string | undefined) => {
    const next = value ?? '';
    setYaml(next);
    onYamlChange?.(next);
  };

  return (
    <div
      className="grid h-[70vh] grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]"
      data-testid="harness-editor"
    >
      <div
        className="overflow-hidden rounded-md border border-border"
        data-testid="harness-editor-monaco"
      >
        <MonacoEditor
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          value={yaml}
          onChange={handleChange}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
      <ValidationPanel result={result} />
    </div>
  );
}

function ValidationPanel({ result }: { result: ValidationResult }) {
  if (result.kind === 'idle' || result.kind === 'pending') {
    return (
      <div
        className="rounded-md border border-border p-3 text-sm text-muted-foreground"
        data-testid="harness-editor-validation"
      >
        <p className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Validating…
        </p>
      </div>
    );
  }

  if (result.kind === 'ok') {
    return (
      <div
        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-500"
        data-testid="harness-editor-validation"
        data-validation-status="ok"
      >
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Valid harness
        </p>
        <ul className="mt-2 text-xs text-emerald-500/90">
          <li>
            name: <code className="font-mono">{result.harnessName}</code>
          </li>
          <li>steps: {result.stepCount}</li>
        </ul>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
      data-testid="harness-editor-validation"
      data-validation-status="error"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        Invalid YAML
      </p>
      <p className="mt-1 text-xs text-destructive/90">{result.message}</p>
      {result.issues.length > 0 && (
        <ul
          className="mt-2 list-inside list-disc space-y-1 text-[11px]"
          data-testid="harness-editor-issues"
        >
          {result.issues.slice(0, 8).map((issue, i) => (
            <li key={i}>
              {issue.path && <code className="mr-1 font-mono">{issue.path}</code>}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lifted into a hook so the page can mirror the editor's live validation
// state into a save button's `disabled`. The editor takes ownership of the
// yaml + validator; the page only needs the latest result to decide.
export function useHarnessValidation(initialYaml: string) {
  const [yaml, setYaml] = useState(initialYaml);
  const [result, setResult] = useState<ValidationResult>({ kind: 'pending' });
  const editor = useMemo(
    () => ({
      yaml,
      result,
      onYamlChange: setYaml,
      onValidationChange: setResult,
    }),
    [yaml, result],
  );
  return editor;
}
