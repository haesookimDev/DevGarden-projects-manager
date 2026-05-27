import { internalFetch } from './internal';

export interface HarnessTemplateMeta {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

export interface HarnessTemplate extends HarnessTemplateMeta {
  yaml: string;
}

export async function listHarnessTemplates(): Promise<HarnessTemplateMeta[]> {
  const res = await internalFetch('/internal/harness-templates', { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`listHarnessTemplates failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessTemplateMeta[];
}

export async function getHarnessTemplate(id: string): Promise<HarnessTemplate> {
  const res = await internalFetch(`/internal/harness-templates/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getHarnessTemplate failed: ${res.status} ${text}`);
  }
  return (await res.json()) as HarnessTemplate;
}
