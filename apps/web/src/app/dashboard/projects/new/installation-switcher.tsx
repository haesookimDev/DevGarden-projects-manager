'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devgarden/ui';

// Switches the page's installation context via the URL param. The page is a
// server component; changing this Select pushes to ?installationDbId=…
// which re-renders the server-side fetch of repos.
export function InstallationSwitcher({
  installations,
  current,
}: {
  installations: Array<{ id: string; accountLogin: string; accountType: string }>;
  current: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(current);

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => {
        setValue(v);
        startTransition(() => {
          router.push(`?installationDbId=${encodeURIComponent(v)}`);
        });
      }}
    >
      <SelectTrigger data-testid="project-new-installation-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {installations.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.accountLogin} ({i.accountType.toLowerCase()})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
