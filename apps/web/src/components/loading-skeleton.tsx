import { Card, CardContent, Skeleton } from '@devgarden/ui';

export function ListSkeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <Card className="overflow-hidden p-0" data-testid={testId}>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <li key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function StatsSkeleton({ count = 4, testId }: { count?: number; testId?: string }) {
  return (
    <section data-testid={testId} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 px-4 py-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
