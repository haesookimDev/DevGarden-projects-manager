import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowList } from './allow-list';

describe('parseAllowList', () => {
  it('returns empty set for undefined', () => {
    expect(parseAllowList(undefined).size).toBe(0);
  });

  it('returns empty set for empty string', () => {
    expect(parseAllowList('').size).toBe(0);
  });

  it('parses comma-separated logins and trims whitespace', () => {
    const set = parseAllowList(' alice , bob,carol ');
    expect(Array.from(set).sort()).toEqual(['alice', 'bob', 'carol']);
  });

  it('lowercases entries', () => {
    const set = parseAllowList('Alice,BOB');
    expect(set.has('alice')).toBe(true);
    expect(set.has('bob')).toBe(true);
  });

  it('drops empty segments from trailing commas', () => {
    expect(parseAllowList('alice,,bob,').size).toBe(2);
  });
});

describe('isAllowed', () => {
  const set = parseAllowList('alice,bob');

  it('returns false for undefined login', () => {
    expect(isAllowed(undefined, set)).toBe(false);
  });

  it('returns false for unknown login', () => {
    expect(isAllowed('eve', set)).toBe(false);
  });

  it('returns true for known login (case-insensitive)', () => {
    expect(isAllowed('Alice', set)).toBe(true);
    expect(isAllowed('bob', set)).toBe(true);
  });

  it('fails closed when allow-list is empty', () => {
    expect(isAllowed('alice', new Set())).toBe(false);
  });
});
