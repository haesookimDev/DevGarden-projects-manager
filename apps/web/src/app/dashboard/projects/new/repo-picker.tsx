'use client';

import { useState } from 'react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devgarden/ui';

interface Repo {
  id: number;
  fullName: string;
  defaultBranch: string | null;
  private: boolean;
  fork: boolean;
}

// Combines the repo Select + the auto-suggested local working directory into
// a single client component so that picking a repo can update the working
// dir placeholder in real time without a server round-trip.
//
// `defaultWorkspaceRoot` is purely a UI hint — the user can edit / override
// the working directory before submitting.
export function RepoPicker({
  repos,
  defaultWorkspaceRoot,
}: {
  repos: Repo[];
  defaultWorkspaceRoot: string;
}) {
  const [repoFullName, setRepoFullName] = useState('');

  const suggestedLocalRoot = repoFullName
    ? `${defaultWorkspaceRoot.replace(/\/$/, '')}/${slugRepo(repoFullName)}`
    : '';

  return (
    <>
      {/* Form-action submission picks this up by name. */}
      <input type="hidden" name="repoFullName" value={repoFullName} />

      <div className="space-y-1.5">
        <Label htmlFor="project-new-repo">Repository</Label>
        <Select value={repoFullName} onValueChange={setRepoFullName}>
          <SelectTrigger id="project-new-repo" data-testid="project-new-repo-trigger">
            <SelectValue placeholder={repos.length === 0 ? '(no repos)' : 'Select a repo'} />
          </SelectTrigger>
          <SelectContent>
            {repos.map((r) => (
              <SelectItem key={r.id} value={r.fullName}>
                {r.fullName}
                {r.private ? ' · private' : ''}
                {r.fork ? ' · fork' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {repos.length === 0 && (
          <p className="text-xs text-muted-foreground">
            이 installation 에 접근 가능한 repo 가 없습니다. GitHub 의 install 페이지에서 repo
            access 를 확인하세요.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-new-local-root">Local working directory</Label>
        <Input
          id="project-new-local-root"
          name="localRoot"
          type="text"
          placeholder={suggestedLocalRoot || '/Users/me/devgarden-workspaces/owner-repo'}
          defaultValue={suggestedLocalRoot}
          // The placeholder updates as the repo changes, but a defaultValue
          // gives the user something editable right away. Re-keying the
          // Input forces React to reset the value when the suggestion shifts.
          key={suggestedLocalRoot || 'blank'}
          required
        />
        <p className="text-xs text-muted-foreground">
          데스크탑 클라이언트가 동작하는 머신에서 이 repo 를 clone 해둔 절대 경로. 자동 clone 은
          없으므로 먼저 git clone 후 그 경로를 넣어주세요. 모든 fs/git/process 도구는 이 디렉터리
          안에서만 동작합니다 (sandbox).
        </p>
      </div>
    </>
  );
}

function slugRepo(full: string): string {
  // "octocat/Hello-World" → "octocat-Hello-World" so the suggested local
  // directory is a single segment under the workspace root.
  return full.replace(/\//g, '-');
}
