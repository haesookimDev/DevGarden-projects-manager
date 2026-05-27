'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';
import { Save } from 'lucide-react';

interface HarnessOption {
  id: string;
  name: string;
  version: number;
}

interface ClientOption {
  id: string;
  name: string;
  status: string;
}

// Sentinel values for "clear this field" / "follow latest". The server
// action reads the sentinel and maps to `null` in the PATCH payload.
const UNSET = '__unset__';
const LATEST = '__latest__';

export function DefaultsForm({
  projectId,
  harnesses,
  clients,
  currentHarnessId,
  currentHarnessVersion,
  currentClientId,
  harnessVersionsByCurrentName,
  saveAction,
}: {
  projectId: string;
  harnesses: HarnessOption[];
  clients: ClientOption[];
  currentHarnessId: string | null;
  currentHarnessVersion: number | null;
  currentClientId: string | null;
  harnessVersionsByCurrentName: number[];
  saveAction(formData: FormData): Promise<void> | void;
}) {
  const [harnessId, setHarnessId] = useState<string>(currentHarnessId ?? UNSET);
  const [harnessVersion, setHarnessVersion] = useState<string>(
    currentHarnessVersion === null ? LATEST : String(currentHarnessVersion),
  );
  const [clientId, setClientId] = useState<string>(currentClientId ?? UNSET);

  // If the operator picks a different harness id, the version list changes —
  // but listing all versions per harness would mean prefetching everything.
  // For the simple case (the original harness or "unset"), we keep the
  // server-fetched version list. Switching to a different harness resets to
  // "latest" and disables version selection until save.
  const isOriginalHarness = harnessId === currentHarnessId || harnessId === UNSET;
  const availableVersions = useMemo(
    () => (isOriginalHarness ? harnessVersionsByCurrentName : []),
    [isOriginalHarness, harnessVersionsByCurrentName],
  );

  return (
    <form action={saveAction} className="space-y-4" data-testid="project-defaults-form">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="space-y-1.5">
        <Label htmlFor="defaults-harness">Default harness</Label>
        <Select
          value={harnessId}
          onValueChange={(v) => {
            setHarnessId(v);
            // Switching harness invalidates the version pin.
            if (v !== currentHarnessId) setHarnessVersion(LATEST);
          }}
        >
          <SelectTrigger id="defaults-harness" data-testid="defaults-harness-trigger">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>(none — clear default)</SelectItem>
            {harnesses.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name} (latest v{h.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="defaultHarnessId" value={harnessId} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaults-version">Version pin</Label>
        <Select
          value={harnessVersion}
          onValueChange={setHarnessVersion}
          disabled={harnessId === UNSET}
        >
          <SelectTrigger id="defaults-version" data-testid="defaults-version-trigger">
            <SelectValue placeholder="latest" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LATEST}>latest (auto-follow)</SelectItem>
            {availableVersions.map((v) => (
              <SelectItem key={v} value={String(v)}>
                v{v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="defaultHarnessVersion" value={harnessVersion} />
        <p className="text-[11px] text-muted-foreground">
          비어 있으면 (latest) save 마다 새 version 이 자동 적용됩니다. 특정 version 으로 pin 하면
          안정성을 우선합니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defaults-client">Default client</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger id="defaults-client" data-testid="defaults-client-trigger">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>(none — clear default)</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {c.status.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="defaultClientId" value={clientId} />
      </div>

      <Button type="submit" size="sm" data-testid="project-defaults-save">
        <Save className="mr-1.5 h-3.5 w-3.5" />
        Save defaults
      </Button>
    </form>
  );
}
