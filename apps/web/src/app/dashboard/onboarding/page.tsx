import Link from 'next/link';
import { CheckCircle2, Circle, ExternalLink, Github } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@devgarden/ui';

import { auth } from '@/auth';
import { getRegistration } from '@/lib/api/github';

export default async function OnboardingPage() {
  const session = await auth();
  const ownerId = session?.user?.id;

  let registration = null;
  let loadError: string | null = null;
  if (ownerId) {
    try {
      registration = await getRegistration(ownerId);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'failed to load registration';
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Connect GitHub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          DevGarden 이 사용자의 repo 를 읽고 PR 을 열려면 GitHub App 을 연결해야 합니다. 최초 1회만
          설정하면 됩니다.
        </p>
      </header>

      <ol className="mt-6 space-y-3" data-testid="onboarding-steps">
        <Step
          n={1}
          title="GitHub App 등록"
          done={Boolean(registration)}
          description={
            registration
              ? `등록됨: App ID ${registration.appId} (${registration.source.toLowerCase()})`
              : 'Manifest 흐름 또는 BYO 중 선택하세요.'
          }
        />
        <Step
          n={2}
          title="조직 / 계정에 설치"
          done={false}
          description="설치된 GitHub App 의 권한을 가진 repo 목록을 가져옵니다. (다음 PR 에서 활성화)"
        />
        <Step
          n={3}
          title="첫 프로젝트 선택"
          done={false}
          description="picker 에서 repo 를 골라 첫 project 를 만듭니다. (다음 PR 에서 활성화)"
        />
      </ol>

      {loadError && (
        <p className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {!registration && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card data-testid="onboarding-manifest-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Github className="h-4 w-4" />
                Create GitHub App
              </CardTitle>
              <CardDescription>
                추천. GitHub 에서 자동으로 App 을 만들고 secret/PEM 을 발급받습니다.
                <br />
                <span className="text-amber-500">
                  공개 URL (PUBLIC_BASE_URL) 이 설정되어 있어야 합니다.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/dashboard/onboarding/manifest" data-testid="onboarding-manifest-cta">
                  Continue to GitHub
                  <ExternalLink className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="onboarding-byo-card">
            <CardHeader>
              <CardTitle className="text-base">I already have an App (BYO)</CardTitle>
              <CardDescription>
                이미 GitHub App 이 있다면 App ID 와 private key 를 직접 입력하세요. localhost 개발
                환경의 표준 경로입니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/dashboard/onboarding/byo" data-testid="onboarding-byo-cta">
                  Paste credentials
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {registration && (
        <Card className="mt-8" data-testid="onboarding-registered-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              GitHub App 연결됨
            </CardTitle>
            <CardDescription>
              App ID {registration.appId} · {registration.source.toLowerCase()}
              {registration.appSlug && ` · slug: ${registration.appSlug}`}
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
            <Button asChild size="sm">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Step({
  n,
  title,
  description,
  done,
}: {
  n: number;
  title: string;
  description: string;
  done: boolean;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-3">
      <Icon className={`mt-0.5 h-5 w-5 ${done ? 'text-emerald-500' : 'text-muted-foreground'}`} />
      <div>
        <p className="text-sm font-medium">
          <span className="text-muted-foreground">{n}.</span> {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
