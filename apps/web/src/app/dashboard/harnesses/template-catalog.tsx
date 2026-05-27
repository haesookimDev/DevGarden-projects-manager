import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@devgarden/ui';
import { listHarnessTemplates, type HarnessTemplateMeta } from '@/lib/api/harness-templates';

// Server-rendered grid of the shipped starter templates. Clicking a card
// reloads /dashboard/harnesses/new?template=<id> so the page's server
// component fetches the yaml body via getHarnessTemplate() and seeds the
// editor with it. Catalog metadata is small (~5 entries with title +
// description + tags), so no client-side state needed.
export async function TemplateCatalog() {
  let templates: HarnessTemplateMeta[] = [];
  try {
    templates = await listHarnessTemplates();
  } catch {
    templates = [];
  }
  if (templates.length === 0) return null;

  return (
    <section className="mb-6" data-testid="harness-template-catalog">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Start from a template
        </h2>
      </header>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <li key={t.id}>
            <Link
              href={`/dashboard/harnesses/new?template=${encodeURIComponent(t.id)}`}
              className="block"
              data-testid="harness-template-card"
              data-template-id={t.id}
            >
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t.title}</CardTitle>
                  <CardDescription className="text-xs">{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1">
                  {t.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
