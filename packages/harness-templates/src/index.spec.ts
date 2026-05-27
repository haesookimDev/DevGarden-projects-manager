import { describe, expect, it } from 'vitest';
import { getTemplate, listTemplates, listTemplatesMeta, parseFrontmatter } from './index';

describe('parseFrontmatter', () => {
  it('reads title / description / tags from leading # comments', () => {
    const yaml = [
      '# title: My template',
      '# description: Does a thing',
      '# tags: foo, bar, baz',
      '',
      'name: my-template',
      'version: 1',
    ].join('\n');
    const { meta } = parseFrontmatter(yaml);
    expect(meta.title).toBe('My template');
    expect(meta.description).toBe('Does a thing');
    expect(meta.tags).toEqual(['foo', 'bar', 'baz']);
  });

  it('stops scanning at the first non-comment line', () => {
    const yaml = ['# title: Real', 'name: y', '# title: Ignored'].join('\n');
    const { meta } = parseFrontmatter(yaml);
    expect(meta.title).toBe('Real');
  });

  it('returns empty defaults when frontmatter is missing', () => {
    const { meta } = parseFrontmatter('name: x\nversion: 1\n');
    expect(meta).toEqual({ title: '', description: '', tags: [] });
  });

  it('ignores comment lines that are not frontmatter keys', () => {
    const yaml = ['# unrelated comment', '# title: Kept', 'name: x'].join('\n');
    const { meta } = parseFrontmatter(yaml);
    expect(meta.title).toBe('Kept');
  });
});

describe('listTemplates', () => {
  it('returns the five shipped catalog entries sorted by id', () => {
    const t = listTemplates();
    expect(t.map((x) => x.id)).toEqual([
      'auto-fix-issue',
      'dependency-upgrade',
      'pr-review',
      'release-notes',
      'test-runner',
    ]);
  });

  it('every entry has a non-empty title, description, and at least one tag', () => {
    for (const t of listTemplates()) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('yaml body parses as YAML with name + version + steps', async () => {
    const { parse } = await import('yaml');
    for (const t of listTemplates()) {
      const parsed = parse(t.yaml) as Record<string, unknown>;
      expect(parsed.name).toBe(t.id);
      expect(parsed.version).toBe(1);
      expect(Array.isArray(parsed.steps)).toBe(true);
    }
  });
});

describe('getTemplate', () => {
  it('returns the requested template by id', () => {
    expect(getTemplate('auto-fix-issue')?.title).toMatch(/issue/i);
  });

  it('returns undefined for unknown id', () => {
    expect(getTemplate('nope')).toBeUndefined();
  });
});

describe('listTemplatesMeta', () => {
  it('returns metadata without the yaml body', () => {
    const m = listTemplatesMeta();
    expect(m).toHaveLength(5);
    for (const entry of m) {
      expect(entry).not.toHaveProperty('yaml');
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('title');
    }
  });
});
