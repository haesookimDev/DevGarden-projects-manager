'use client';

import { useState } from 'react';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';
import { type ClientSummary } from '@/lib/api/clients';

// Toggles the clone-after-create option + reveals client picker only when the
// checkbox is on. We keep this as a client component because the existing
// form on /dashboard/projects/new is a server action — a checkbox driving
// conditional UI is exactly the seam where client state pays off.
export function CloneOnCreateSection({ clients }: { clients: ClientSummary[] }) {
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState(
    clients.find((c) => c.status === 'ONLINE')?.id ?? clients[0]?.id ?? '',
  );

  const noClients = clients.length === 0;
  return (
    <div
      className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
      data-testid="clone-on-create-section"
    >
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="cloneOnCreate"
          className="mt-0.5"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={noClients}
          data-testid="clone-on-create-toggle"
        />
        <span>
          <span className="font-medium">Clone & register</span>
          <span className="block text-xs text-muted-foreground">
            데스크탑 client 가 자동으로 repo 를 위 경로에 clone 합니다. 끄면 직접 clone 해두고
            경로만 등록합니다.
          </span>
        </span>
      </label>

      {noClients && (
        <p className="text-xs text-amber-500" data-testid="clone-on-create-no-clients">
          페어링된 desktop client 가 없어 자동 clone 을 할 수 없습니다. Clients 페이지에서 client 를
          페어링한 뒤 다시 시도하세요.
        </p>
      )}

      {enabled && !noClients && (
        <div className="space-y-3 pl-6">
          <input type="hidden" name="cloneClientId" value={clientId} />
          <div className="space-y-1.5">
            <Label htmlFor="clone-on-create-client">Clone on which client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="clone-on-create-client" data-testid="clone-client-trigger">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`clone-client-${c.id}`}>
                    {c.name} · {c.status.toLowerCase()}
                    {c.hostname ? ` · ${c.hostname}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              name="useWorktrees"
              className="mt-0.5"
              data-testid="clone-on-create-worktrees"
            />
            <span>
              <span className="font-medium">Use git worktrees</span>
              <span className="block text-muted-foreground">
                같은 repo 의 여러 branch 작업을 격리하려면 켜세요. bare repo 와 main worktree 가
                자동 생성됩니다.
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
