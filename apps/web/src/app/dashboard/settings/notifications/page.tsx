import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Bell, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@devgarden/ui';
import { auth } from '@/auth';
import {
  getNotificationSettings,
  listNotifications,
  sendTestNotification,
  updateNotificationSettings,
  type NotificationItem,
} from '@/lib/api/notifications';

const PAGE = '/dashboard/settings/notifications';

async function saveNotificationSettingsAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=${PAGE}`);

  const on = (name: string) => formData.get(name) === 'on';
  const emailAddress = String(formData.get('emailAddress') ?? '').trim();
  // Empty Slack input = keep the existing URL (we never render the secret).
  const slackWebhookUrl = String(formData.get('slackWebhookUrl') ?? '').trim();

  let saveErr: string | null = null;
  try {
    await updateNotificationSettings(ownerId, {
      webToast: on('webToast'),
      emailEnabled: on('emailEnabled'),
      emailAddress: emailAddress === '' ? null : emailAddress,
      ...(slackWebhookUrl ? { slackWebhookUrl } : {}),
      triggers: {
        success: on('trigger-success'),
        failed: on('trigger-failed'),
        cancelled: on('trigger-cancelled'),
      },
    });
  } catch (e) {
    saveErr = e instanceof Error ? e.message : 'save failed';
  }
  if (saveErr) redirect(`${PAGE}?error=${encodeURIComponent(saveErr)}`);
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

async function sendTestAction() {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=${PAGE}`);

  let testErr: string | null = null;
  try {
    await sendTestNotification(ownerId);
  } catch (e) {
    testErr = e instanceof Error ? e.message : 'test send failed';
  }
  if (testErr) redirect(`${PAGE}?error=${encodeURIComponent(testErr)}`);
  revalidatePath(PAGE);
  redirect(`${PAGE}?test=sent`);
}

export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; test?: string }>;
}) {
  const [{ error, saved, test }, session] = await Promise.all([searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect(`/signin?callbackUrl=${PAGE}`);

  const [settings, recent] = await Promise.all([
    getNotificationSettings(ownerId).catch(() => null),
    listNotifications(ownerId, { limit: 10 }).catch(() => [] as NotificationItem[]),
  ]);

  const webToast = settings?.webToast ?? true;
  const triggers = settings?.triggers ?? { success: false, failed: true, cancelled: false };
  const emailEnabled = settings?.emailEnabled ?? false;
  const emailAddress = settings?.emailAddress ?? '';

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 채널로, 어떤 run 상태에 알림을 받을지 설정합니다.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      )}
      {saved && (
        <p
          className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500"
          data-testid="notif-saved"
        >
          저장됨.
        </p>
      )}
      {test && (
        <p
          className="mt-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-500"
          data-testid="notif-test-sent"
        >
          테스트 알림을 보냈습니다.
        </p>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Channels & triggers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={saveNotificationSettingsAction}
              className="space-y-5"
              data-testid="notif-form"
            >
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Channels
                </p>
                <Toggle
                  name="webToast"
                  label="Web toast"
                  hint="로그인한 다른 탭에 토스트로 표시"
                  defaultChecked={webToast}
                  testId="notif-webtoast"
                />
                <Toggle
                  name="emailEnabled"
                  label="Email"
                  hint="SMTP relay (전송은 후속 PR에서 연결)"
                  defaultChecked={emailEnabled}
                  testId="notif-email-enabled"
                />
                <div className="space-y-1.5 pl-6">
                  <Label htmlFor="notif-email-address">Email address</Label>
                  <Input
                    id="notif-email-address"
                    name="emailAddress"
                    type="email"
                    defaultValue={emailAddress}
                    placeholder="you@example.com"
                    data-testid="notif-email-address"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notif-slack-url">Slack incoming webhook URL</Label>
                  <Input
                    id="notif-slack-url"
                    name="slackWebhookUrl"
                    type="url"
                    placeholder={
                      settings?.slackConfigured
                        ? `설정됨 (${settings.slackHint ?? '••••'}) — 비우면 유지`
                        : 'https://hooks.slack.com/services/…'
                    }
                    data-testid="notif-slack-url"
                  />
                  <p className="text-xs text-muted-foreground" data-testid="notif-slack-status">
                    {settings?.slackConfigured
                      ? `현재 설정됨 (${settings.slackHint ?? '••••'}). 새 URL을 입력하면 교체됩니다.`
                      : '미설정 — webhook URL을 입력하면 Slack으로도 알림이 갑니다.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Triggers
                </p>
                <Toggle
                  name="trigger-success"
                  label="Run succeeded"
                  defaultChecked={triggers.success}
                  testId="notif-trigger-success"
                />
                <Toggle
                  name="trigger-failed"
                  label="Run failed"
                  defaultChecked={triggers.failed}
                  testId="notif-trigger-failed"
                />
                <Toggle
                  name="trigger-cancelled"
                  label="Run cancelled"
                  defaultChecked={triggers.cancelled}
                  testId="notif-trigger-cancelled"
                />
              </div>

              <Button type="submit" size="sm" data-testid="notif-save">
                Save settings
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent notifications
            </CardTitle>
            <form action={sendTestAction}>
              <Button type="submit" size="sm" variant="outline" data-testid="notif-test">
                <Bell className="mr-1 h-3 w-3" /> Send test
              </Button>
            </form>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="notif-recent-empty">
                아직 알림이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="notif-recent">
                {recent.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-start gap-2 rounded-md border border-border px-3 py-2"
                    data-testid="notif-recent-item"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                      {n.kind}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  testId,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  testId: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        data-testid={testId}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
