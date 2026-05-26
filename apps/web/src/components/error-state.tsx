'use client';

import { AlertTriangle } from 'lucide-react';
import { Button, cn } from '@devgarden/ui';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  testId?: string;
}

export function ErrorState({
  title = '문제가 발생했습니다',
  message,
  onRetry,
  className,
  testId = 'error-state',
}: ErrorStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 rounded-full border border-destructive/40 bg-background p-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-destructive">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
          Try again
        </Button>
      )}
    </div>
  );
}
