import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@devgarden/ui';

import { auth } from '@/auth';
import { getGithubAccessToken } from '@/lib/auth/github-token';
import {
  syncInstallationsFromGithub,
  type GithubInstallation,
  type GithubRegistration,
} from '@/lib/api/github';
import { EmptyState } from '@/components/empty-state';

// Minimum permissions a v0.1 harness needs to be useful. Kept in sync with
// the api's manifest-builder DEFAULT_PERMISSIONS — when those diverge, the
// onboarding screen will flag the gap to the user.
const REQUIRED_PERMISSIONS: Record<string, 'read' | 'write'> = {
  contents: 'write',
  metadata: 'read',
  pull_requests: 'write',
  issues: 'write',
};

async function refreshAction() {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    redirect('/signin?callbackUrl=/dashboard/onboarding');
  }
  const token = await getGithubAccessToken();
  if (!token) {
    redirect('/dashboard/onboarding?refresh=missing-token');
  }
  try {
    await syncInstallationsFromGithub(ownerId, token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/dashboard/onboarding?refresh=${encodeURIComponent(msg)}`);
  }
  redirect('/dashboard/onboarding?refresh=ok');
}

export function InstallationsSection({
  registration,
  installations,
  refreshError,
  refreshOk,
}: {
  registration: GithubRegistration;
  installations: GithubInstallation[];
  refreshError?: string | null;
  refreshOk?: boolean;
}) {
  const installNewUrl = registration.appSlug
    ? `https://github.com/apps/${registration.appSlug}/installations/new`
    : null;

  return (
    <section className="mt-8 space-y-4" data-testid="onboarding-installations">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Installations</h2>
          <p className="text-xs text-muted-foreground">
            App 이 설치된 계정 / 조직. 권한이 부족하면 GitHub 에서 한 번 더 승인하세요.
          </p>
        </div>
        <div className="flex gap-2">
          {installNewUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={installNewUrl} target="_blank" rel="noreferrer">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Install on more
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <form action={refreshAction}>
            <Button type="submit" size="sm" data-testid="installations-refresh">
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Refresh from GitHub
            </Button>
          </form>
        </div>
      </header>

      {refreshError && (
        <p
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="installations-refresh-error"
        >
          {refreshError}
        </p>
      )}
      {refreshOk && (
        <p
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500"
          data-testid="installations-refresh-ok"
        >
          GitHub 에서 최신 installation 목록을 가져왔습니다.
        </p>
      )}

      {installations.length === 0 ? (
        <EmptyState
          title="설치된 곳이 없습니다"
          description={
            installNewUrl
              ? '“Install on more” 를 눌러 GitHub 에서 본인 또는 조직 계정에 App 을 설치하세요. 설치 후 “Refresh from GitHub” 를 누르면 여기로 옵니다.'
              : '“Refresh from GitHub” 를 눌러 GitHub 에서 설치 목록을 동기화하세요.'
          }
          testId="installations-empty"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="installations-list">
          {installations.map((i) => (
            <InstallationCard key={i.id} installation={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InstallationCard({ installation }: { installation: GithubInstallation }) {
  const gaps = missingPermissions(installation.permissions);
  return (
    <li>
      <Card
        data-testid="installation-card"
        data-account={installation.accountLogin}
        data-installation-id={installation.installationId}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {installation.accountLogin}
            <Badge variant="outline" className="text-xs">
              {installation.accountType.toLowerCase()}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            installation #{installation.installationId} · {installation.repositorySelection} repos ·
            last sync {new Date(installation.syncedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {gaps.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              모든 권한 OK
            </p>
          ) : (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-500"
              data-testid="installation-perm-warning"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                권한 부족
              </p>
              <ul className="mt-1 list-inside list-disc text-[11px]">
                {gaps.map((g) => (
                  <li key={g.scope}>
                    {g.scope}: {g.required} (현재 {g.actual ?? '없음'})
                  </li>
                ))}
              </ul>
              {installation.htmlUrl && (
                <p className="mt-1">
                  <Link
                    href={installation.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    GitHub 에서 권한 업데이트 →
                  </Link>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function missingPermissions(
  current: Record<string, string>,
): Array<{ scope: string; required: string; actual: string | null }> {
  const out: Array<{ scope: string; required: string; actual: string | null }> = [];
  for (const [scope, required] of Object.entries(REQUIRED_PERMISSIONS)) {
    const actual = current[scope] ?? null;
    if (!satisfies(actual, required)) out.push({ scope, required, actual });
  }
  return out;
}

function satisfies(actual: string | null, required: 'read' | 'write'): boolean {
  if (!actual) return false;
  if (required === 'read') return actual === 'read' || actual === 'write' || actual === 'admin';
  return actual === 'write' || actual === 'admin';
}
