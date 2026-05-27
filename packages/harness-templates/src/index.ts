// Catalog of starter harness templates shipped with v0.2 N4.
//
// Each entry is a yaml file under ./catalog. The first lines are "frontmatter"
// comments — single-line YAML comments starting with `# <key>: <value>` — that
// carry display metadata (title / description / tags). The body below is the
// usual harness YAML the operator will see in the editor.
//
// This module loads the files at runtime via fs so the api can hot-update
// templates without a rebuild; the catalog is small (5 entries) so the read
// cost is negligible.

import { readFileSync, readdirSync } from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = nodePath.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = nodePath.join(HERE, 'catalog');

export interface TemplateMeta {
  /** Stable slug (filename without `.yaml`). */
  id: string;
  /** Display title from the frontmatter `# title:` line. */
  title: string;
  /** One-line description from the frontmatter `# description:` line. */
  description: string;
  /** Tags from the frontmatter `# tags:` line, comma-separated → array. */
  tags: string[];
}

export interface Template extends TemplateMeta {
  /** Full yaml source — including the frontmatter comments. Operators edit
   *  this directly in the Monaco editor. */
  yaml: string;
}

const FRONTMATTER_LINE_RE = /^#\s*(title|description|tags):\s*(.+?)\s*$/;

export function parseFrontmatter(yaml: string): {
  meta: Omit<TemplateMeta, 'id'>;
} {
  let title = '';
  let description = '';
  let tags: string[] = [];

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('#')) break; // first non-comment line ends frontmatter

    const m = FRONTMATTER_LINE_RE.exec(trimmed);
    if (!m) continue;
    const key = m[1];
    const value = m[2] ?? '';
    if (key === 'title') title = value;
    else if (key === 'description') description = value;
    else if (key === 'tags') {
      tags = value
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }
  }

  return { meta: { title, description, tags } };
}

let cached: Template[] | null = null;

export function listTemplates(): Template[] {
  if (cached) return cached;
  const entries = readdirSync(CATALOG_DIR, { withFileTypes: true });
  const result: Template[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue;
    const id = entry.name.replace(/\.yaml$/, '');
    const yaml = readFileSync(nodePath.join(CATALOG_DIR, entry.name), 'utf8');
    const { meta } = parseFrontmatter(yaml);
    result.push({ id, yaml, ...meta });
  }
  result.sort((a, b) => a.id.localeCompare(b.id));
  cached = result;
  return result;
}

export function getTemplate(id: string): Template | undefined {
  return listTemplates().find((t) => t.id === id);
}

// listTemplatesMeta returns the catalog without the (potentially large) yaml
// body — used by the catalog endpoint that fronts the template picker grid.
export function listTemplatesMeta(): TemplateMeta[] {
  return listTemplates().map(({ yaml: _yaml, ...meta }) => meta);
}
