import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@devgarden/ui';

import { auth } from '@/auth';
import { startManifest } from '@/lib/api/github';

// Server component that fetches the manifest body + state from the api,
// then renders an auto-submitting HTML form pointed at github.com.
// GitHub requires the manifest to be POSTed (it is too large for a URL),
// so an HTML form is the canonical implementation of the manifest flow.
export default async function ManifestSubmitPage() {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    redirect('/signin?callbackUrl=/dashboard/onboarding/manifest');
  }

  let payload: Awaited<ReturnType<typeof startManifest>> | null = null;
  let error: string | null = null;
  try {
    payload = await startManifest(ownerId);
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to start manifest flow';
  }

  if (error || !payload) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Manifest 흐름을 시작할 수 없습니다</h1>
        <p className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? 'unknown error'}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          가장 흔한 원인은 api 의 <code className="font-mono">PUBLIC_BASE_URL</code> 미설정입니다.
          로컬 개발에서는 BYO 경로를 사용하세요.
        </p>
        <div className="mt-6 flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/onboarding">← Back</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/onboarding/byo">Use BYO instead</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Redirecting to GitHub…</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        DevGarden 이 GitHub 에서 자동으로 App 을 생성합니다. 새 창에서 GitHub 의 설정 화면이 열리지
        않으면 아래 버튼을 눌러주세요.
      </p>

      <form
        action={payload.submitUrl}
        method="post"
        id="manifest-form"
        data-testid="manifest-auto-submit-form"
      >
        <input type="hidden" name="manifest" value={JSON.stringify(payload.manifest)} />
        <div className="mt-6">
          <Button type="submit">Open GitHub</Button>
        </div>
      </form>

      {/* Auto-submit. Inline script kept tiny + idempotent so a re-render
          (e.g. refresh) re-sends. The form action is github.com — opening it
          in a new tab would lose the form POST body, so same-tab submit. */}
      <script
        dangerouslySetInnerHTML={{
          __html: "document.getElementById('manifest-form').submit();",
        }}
      />
    </main>
  );
}
