'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/error-state';

// Next.js App Router boundary for any unexpected exception thrown inside
// /dashboard/* (segment-level + nested). Expected/server-side failures are
// already handled inline via try/catch + listError-style banners; this
// boundary is the safety net for the rest.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard error boundary]', error);
  }, [error]);

  return (
    <main className="p-8">
      <ErrorState
        title="대시보드를 불러오는 중 오류가 발생했습니다"
        message={
          error.digest
            ? `에러 ID: ${error.digest}. 잠시 후 다시 시도해주세요.`
            : '잠시 후 다시 시도해주세요.'
        }
        onRetry={reset}
        testId="dashboard-error"
      />
    </main>
  );
}
