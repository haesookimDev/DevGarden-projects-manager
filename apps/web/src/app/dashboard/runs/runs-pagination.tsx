'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@devgarden/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Prev/next pager that preserves all current filter params and only changes
// `page`. Disabled at the boundaries.
export function RunsPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const goto = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    router.push(`/dashboard/runs?${next.toString()}`);
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between" data-testid="runs-pagination">
      <p className="text-xs text-muted-foreground" data-testid="runs-pagination-summary">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => goto(page - 1)}
          data-testid="runs-pagination-prev"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= lastPage}
          onClick={() => goto(page + 1)}
          data-testid="runs-pagination-next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
