import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Input, Label, Textarea } from '@devgarden/ui';

import { auth } from '@/auth';
import { createByoRegistration } from '@/lib/api/github';

async function submitByoAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    redirect('/signin?callbackUrl=/dashboard/onboarding/byo');
  }

  const appIdRaw = String(formData.get('appId') ?? '').trim();
  const privateKeyPem = String(formData.get('privateKeyPem') ?? '').trim();
  const webhookSecret = String(formData.get('webhookSecret') ?? '').trim() || undefined;
  const clientId = String(formData.get('clientId') ?? '').trim() || undefined;
  const clientSecret = String(formData.get('clientSecret') ?? '').trim() || undefined;

  if (!appIdRaw || !privateKeyPem) {
    redirect('/dashboard/onboarding/byo?error=missing-fields');
  }
  const appId = Number(appIdRaw);
  if (!Number.isFinite(appId) || !Number.isInteger(appId) || appId <= 0) {
    redirect('/dashboard/onboarding/byo?error=invalid-app-id');
  }

  try {
    await createByoRegistration({
      ownerId,
      appId,
      privateKeyPem,
      webhookSecret,
      clientId,
      clientSecret,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    redirect(`/dashboard/onboarding/byo?error=${encodeURIComponent(msg)}`);
  }
  redirect('/dashboard/onboarding?registered=byo');
}

export default async function ByoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard/onboarding" className="hover:underline">
            ← Onboarding
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Connect an existing GitHub App</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이미 만들어 둔 GitHub App 의 App ID 와 private key 를 한 번에 등록합니다. GitHub 가
          credentials 를 검증한 뒤 envelope-encrypted 로 저장됩니다.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      )}

      <form action={submitByoAction} className="mt-6 space-y-4" data-testid="byo-form">
        <div className="space-y-1.5">
          <Label htmlFor="byo-app-id">App ID</Label>
          <Input id="byo-app-id" name="appId" type="text" placeholder="12345678" required />
          <p className="text-xs text-muted-foreground">
            github.com/settings/apps/&lt;your-app&gt; 페이지의 "App ID"
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="byo-pem">Private key (PEM)</Label>
          <Textarea
            id="byo-pem"
            name="privateKeyPem"
            rows={10}
            required
            placeholder={'-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----'}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            App 페이지에서 "Generate a private key" 로 발급받은 .pem 파일 내용 전체. 줄바꿈 포함해서
            그대로 붙여넣으세요.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="byo-webhook">Webhook secret (선택)</Label>
          <Input
            id="byo-webhook"
            name="webhookSecret"
            type="text"
            placeholder="App 의 webhook secret"
          />
          <p className="text-xs text-muted-foreground">
            issue/PR webhook 을 받을 때 HMAC 검증에 사용. 비우면 검증 없이 모든 webhook 을 수락 —
            프로덕션에서는 권장하지 않습니다.
          </p>
        </div>

        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">OAuth client (선택)</summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="byo-client-id">Client ID</Label>
              <Input id="byo-client-id" name="clientId" type="text" placeholder="Iv1.abc..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="byo-client-secret">Client secret</Label>
              <Input id="byo-client-secret" name="clientSecret" type="text" />
            </div>
            <p className="text-xs text-muted-foreground">
              App 이 user-to-server OAuth 를 지원할 때만 필요. 기본 흐름은 사용 안 함.
            </p>
          </div>
        </details>

        <Button type="submit" data-testid="byo-submit">
          Register App
        </Button>
      </form>
    </main>
  );
}
