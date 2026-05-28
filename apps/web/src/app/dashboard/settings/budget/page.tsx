import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { getBudget, getBudgetStatus, updateBudget, type BudgetStatus } from '@/lib/api/budget';

async function saveBudgetAction(formData: FormData) {
  'use server';
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/settings/budget');

  const limitRaw = String(formData.get('monthlyUsdLimit') ?? '').trim();
  const warnAtRaw = String(formData.get('warnAt') ?? '').trim();
  const resetDayRaw = String(formData.get('resetDay') ?? '').trim();

  const patch: { monthlyUsdLimit: number | null; warnAt?: number; resetDay?: number } = {
    monthlyUsdLimit: limitRaw === '' ? null : Number(limitRaw),
  };
  if (warnAtRaw) patch.warnAt = Number(warnAtRaw);
  if (resetDayRaw) patch.resetDay = Number(resetDayRaw);

  let saveErr: string | null = null;
  try {
    await updateBudget(ownerId, patch);
  } catch (e) {
    saveErr = e instanceof Error ? e.message : 'save failed';
  }
  if (saveErr) {
    redirect(`/dashboard/settings/budget?error=${encodeURIComponent(saveErr)}`);
  }
  revalidatePath('/dashboard/settings/budget');
  redirect('/dashboard/settings/budget?saved=1');
}

export default async function BudgetSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ error, saved }, session] = await Promise.all([searchParams, auth()]);
  const ownerId = session?.user?.id;
  if (!ownerId) redirect('/signin?callbackUrl=/dashboard/settings/budget');

  const [budget, status] = await Promise.all([
    getBudget(ownerId).catch(() => null),
    getBudgetStatus(ownerId).catch(() => null),
  ]);

  return (
    <main className="p-8">
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Budget</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          월 사용 한도와 경고 임계치. 한도에 도달하면 (N5 알림 채널이 붙는 대로) 알림이 갑니다.
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
          data-testid="budget-saved"
        >
          저장됨.
        </p>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveBudgetAction} className="space-y-4" data-testid="budget-form">
              <div className="space-y-1.5">
                <Label htmlFor="budget-limit">Monthly limit (USD)</Label>
                <Input
                  id="budget-limit"
                  name="monthlyUsdLimit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={budget?.monthlyUsdLimit ?? ''}
                  placeholder="비우면 무제한"
                  data-testid="budget-limit"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="budget-warn">Warn at (%)</Label>
                  <Input
                    id="budget-warn"
                    name="warnAt"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={budget?.warnAt ?? 80}
                    data-testid="budget-warn"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="budget-reset">Reset day</Label>
                  <Input
                    id="budget-reset"
                    name="resetDay"
                    type="number"
                    min="1"
                    max="28"
                    defaultValue={budget?.resetDay ?? 1}
                    data-testid="budget-reset"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" data-testid="budget-save">
                Save budget
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Current period
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status ? <StatusView status={status} /> : <p className="text-sm">상태 없음.</p>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function StatusView({ status }: { status: BudgetStatus }) {
  const pct =
    status.limitUsd && status.limitUsd > 0
      ? Math.min(100, Math.round((status.spendUsd / status.limitUsd) * 100))
      : 0;
  return (
    <div className="space-y-3" data-testid="budget-status">
      <ThresholdBadge threshold={status.threshold} />
      <p className="text-sm">
        <span className="font-mono">${status.spendUsd.toFixed(2)}</span>
        {status.limitUsd !== null && (
          <>
            {' / '}
            <span className="font-mono">${status.limitUsd.toFixed(2)}</span>
            <span className="text-muted-foreground"> ({pct}%)</span>
          </>
        )}
      </p>
      {status.limitUsd !== null && (
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div
            className={
              'h-2 ' +
              (status.threshold === 'exceeded'
                ? 'bg-destructive'
                : status.threshold === 'warn'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500')
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        기간 시작: {new Date(status.since).toLocaleDateString()}
      </p>
    </div>
  );
}

function ThresholdBadge({ threshold }: { threshold: BudgetStatus['threshold'] }) {
  if (threshold === 'exceeded') {
    return (
      <Badge
        variant="outline"
        className="border-destructive/50 bg-destructive/10 text-destructive"
        data-testid="budget-threshold-exceeded"
      >
        <AlertTriangle className="mr-1 h-3 w-3" /> exceeded
      </Badge>
    );
  }
  if (threshold === 'warn') {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-500"
        data-testid="budget-threshold-warn"
      >
        <AlertTriangle className="mr-1 h-3 w-3" /> warning
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      data-testid="budget-threshold-ok"
    >
      <CheckCircle2 className="mr-1 h-3 w-3" /> within budget
    </Badge>
  );
}
