import Link from 'next/link';
import { CheckCircle2, ExternalLink, Github } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@devgarden/ui';

import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import {
  getRegistration,
  listInstallationsFromDb,
  type GithubInstallation,
} from '@/lib/api/github';
import { InstallationsSection } from '@/app/dashboard/onboarding/installations-section';

interface PageProps {
  searchParams: Promise<{ refresh?: string }>;
}

export default async function GithubSettingsPage({ searchParams }: PageProps) {
  const session = await auth();
  const ownerId = session?.user?.id;
  const { refresh } = await searchParams;

  let registration = null;
  let installations: GithubInstallation[] = [];
  let loadError: string | null = null;
  if (ownerId) {
    try {
      registration = await getRegistration(ownerId);
      if (registration) {
        installations = await listInstallationsFromDb(ownerId);
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'failed to load registration';
    }
  }

  const refreshOk = refresh === 'ok';
  const refreshError = refresh && !refreshOk ? decodeURIComponent(refresh) : null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">GitHub settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          현재 연결된 GitHub App 과 설치된 계정 목록. 권한이 부족한 installation 은 amber 배지로
          표시됩니다.
        </p>
      </header>

      {loadError && (
        <p
          className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="settings-github-load-error"
        >
          {loadError}
        </p>
      )}

      {!registration ? (
        <EmptyState
          className="mt-6"
          icon={Github}
          title="연결된 GitHub App 이 없습니다"
          description="먼저 onboarding 에서 GitHub App 을 등록하세요. Manifest 흐름과 BYO 두 가지 경로가 있습니다."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/onboarding" data-testid="settings-github-onboarding-cta">
                Go to onboarding →
              </Link>
            </Button>
          }
          testId="settings-github-no-registration"
        />
      ) : (
        <>
          <Card className="mt-6" data-testid="settings-github-registered-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                GitHub App 연결됨
              </CardTitle>
              <CardDescription>
                App ID {registration.appId} · {registration.source.toLowerCase()}
                {registration.appSlug && ` · slug: ${registration.appSlug}`}
                {' · created '}
                {new Date(registration.createdAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              {registration.htmlUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={registration.htmlUrl} target="_blank" rel="noreferrer">
                    Open on GitHub <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/onboarding" data-testid="settings-github-re-onboard">
                  Re-run onboarding
                </Link>
              </Button>
            </CardContent>
          </Card>

          <InstallationsSection
            registration={registration}
            installations={installations}
            refreshError={refreshError}
            refreshOk={refreshOk}
            redirectPath="/dashboard/settings/github"
          />
        </>
      )}
    </main>
  );
}
