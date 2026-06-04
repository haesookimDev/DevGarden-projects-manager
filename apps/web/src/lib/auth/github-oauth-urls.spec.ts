import { describe, expect, it } from 'vitest';
import { getGithubOAuthUrls } from './github-oauth-urls';

describe('getGithubOAuthUrls', () => {
  it('defaults to github.com when env vars are unset', () => {
    const urls = getGithubOAuthUrls({} as unknown as NodeJS.ProcessEnv);
    expect(urls.authorizationUrl).toBe('https://github.com/login/oauth/authorize');
    expect(urls.tokenUrl).toBe('https://github.com/login/oauth/access_token');
    expect(urls.userinfoUrl).toBe('https://api.github.com/user');
  });

  it('honours all three env overrides', () => {
    const urls = getGithubOAuthUrls({
      AUTH_GITHUB_AUTHORIZATION_URL: 'https://mock.test/authorize',
      AUTH_GITHUB_TOKEN_URL: 'https://mock.test/token',
      AUTH_GITHUB_USERINFO_URL: 'https://mock.test/user',
    } as unknown as NodeJS.ProcessEnv);
    expect(urls.authorizationUrl).toBe('https://mock.test/authorize');
    expect(urls.tokenUrl).toBe('https://mock.test/token');
    expect(urls.userinfoUrl).toBe('https://mock.test/user');
  });

  it('falls back to defaults when overrides are whitespace-only', () => {
    const urls = getGithubOAuthUrls({
      AUTH_GITHUB_AUTHORIZATION_URL: '   ',
    } as unknown as NodeJS.ProcessEnv);
    expect(urls.authorizationUrl).toBe('https://github.com/login/oauth/authorize');
  });
});
