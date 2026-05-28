import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Webhook } from 'lucide-react';
import { Card, CardContent } from '@devgarden/ui';
import { auth } from '@/auth';
import { EmptyState } from '@/components/empty-state';
import { listWebhookEvents, type WebhookEventRow } from '@/lib/api/webhooks';
import { WebhookRow } from './webhook-row';

// Webhook delivery audit (N6). Lists recent GithubEvent rows with an
// expandable payload preview + a redeliver action per row.
export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ type }, session] = await Promise.all([searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/webhooks');

  let events: WebhookEventRow[] = [];
  let error: string | null = null;
  try {
    events = await listWebhookEvents({ ...(type ? { type } : {}), pageSize: 50 });
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to load webhook events';
  }

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Webhook deliveries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GitHub 에서 받은 최근 webhook 이벤트. payload 를 펼쳐보거나 redeliver 할 수 있습니다.
        </p>
      </header>

      {error && (
        <p className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="mt-6">
        {events.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhook deliveries yet"
            description="GitHub App 이 설치된 repo 에서 이벤트가 발생하면 여기에 기록됩니다."
            testId="webhooks-empty"
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              <ul data-testid="webhooks-list" className="divide-y divide-border">
                {events.map((e) => (
                  <WebhookRow key={e.id} event={e} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  );
}
