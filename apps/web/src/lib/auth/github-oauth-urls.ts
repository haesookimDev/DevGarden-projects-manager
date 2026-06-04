// Centralised GitHub OAuth endpoint URLs. The defaults point at github.com;
// the env overrides exist so end-to-end tests (P3) can swap in a local mock
// provider over HTTPS without touching the rest of the auth wiring.

export interface GithubOAuthUrls {
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

const DEFAULTS: GithubOAuthUrls = {
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userinfoUrl: 'https://api.github.com/user',
};

export function getGithubOAuthUrls(env: NodeJS.ProcessEnv = process.env): GithubOAuthUrls {
  return {
    authorizationUrl: env.AUTH_GITHUB_AUTHORIZATION_URL?.trim() || DEFAULTS.authorizationUrl,
    tokenUrl: env.AUTH_GITHUB_TOKEN_URL?.trim() || DEFAULTS.tokenUrl,
    userinfoUrl: env.AUTH_GITHUB_USERINFO_URL?.trim() || DEFAULTS.userinfoUrl,
  };
}
