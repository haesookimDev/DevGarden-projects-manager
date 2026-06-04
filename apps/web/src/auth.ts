import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { isAllowed, parseAllowList } from './lib/auth/allow-list';
import { getGithubOAuthUrls } from './lib/auth/github-oauth-urls';
import { upsertUserViaApi } from './lib/auth/upsert-user';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      githubId: number;
      login: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    dbUserId?: string;
    githubId?: number;
    login?: string;
    /** GitHub OAuth access token. Server-side only — never copied to
     *  session. Read via lib/auth/github-token.ts so the cookie surface
     *  is the single touch point. */
    githubAccessToken?: string;
  }
}

const allowList = parseAllowList(process.env.OWNER_GITHUB_LOGINS);
const githubUrls = getGithubOAuthUrls();

// NextAuth v5 routes the userinfo call through oauth4webapi, which enforces
// HTTPS on the configured endpoint even when AUTH_GITHUB_USERINFO_URL points
// at http://localhost during e2e. Providing a `request` callback bypasses
// oauth4webapi.userInfoRequest entirely and lets the mock server stay on
// HTTP. The override is opt-in (only when the env var is set) so the
// production path against api.github.com is unchanged.
const userinfoConfig = process.env.AUTH_GITHUB_USERINFO_URL
  ? {
      url: githubUrls.userinfoUrl,
      async request({
        tokens,
      }: {
        tokens: { access_token?: string };
      }): Promise<Record<string, unknown>> {
        const res = await fetch(githubUrls.userinfoUrl, {
          headers: {
            Authorization: `Bearer ${tokens.access_token ?? ''}`,
            'User-Agent': 'devgarden-e2e',
          },
        });
        if (!res.ok) throw new Error(`mock userinfo failed: ${res.status}`);
        return (await res.json()) as Record<string, unknown>;
      },
    }
  : githubUrls.userinfoUrl;

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      // URL overrides (AUTH_GITHUB_*_URL) come from getGithubOAuthUrls() so
      // P3 e2e can swap in a local mock provider over HTTPS without touching
      // the rest of the auth wiring. Production leaves the env vars unset
      // and the helper returns the github.com defaults.
      authorization: {
        url: githubUrls.authorizationUrl,
        params: { scope: 'read:user user:email' },
      },
      token: githubUrls.tokenUrl,
      userinfo: userinfoConfig,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = typeof profile?.login === 'string' ? profile.login : undefined;
      return isAllowed(login, allowList);
    },
    async jwt({ token, account, profile }) {
      // Capture the OAuth access_token on the initial sign-in. account is
      // populated only on the first JWT callback after sign-in; on
      // subsequent calls token already holds the access_token from the prior
      // round, so we keep it. The N1 manifest/installations flow needs this
      // token to call apps.listInstallationsForAuthenticatedUser on the
      // user's behalf.
      if (account?.access_token && typeof account.access_token === 'string') {
        token.githubAccessToken = account.access_token;
      }
      if (profile) {
        const login = typeof profile.login === 'string' ? profile.login : undefined;
        const githubId = typeof profile.id === 'number' ? profile.id : undefined;
        if (!login || githubId === undefined) return token;

        const user = await upsertUserViaApi({
          githubId,
          login,
          email: typeof profile.email === 'string' ? profile.email : null,
        });

        token.dbUserId = user.id;
        token.githubId = githubId;
        token.login = login;
      }
      return token;
    },
    async session({ session, token }) {
      const dbUserId = token.dbUserId;
      const githubId = token.githubId;
      const login = token.login;
      if (
        typeof dbUserId === 'string' &&
        typeof githubId === 'number' &&
        typeof login === 'string'
      ) {
        session.user.id = dbUserId;
        session.user.githubId = githubId;
        session.user.login = login;
      }
      return session;
    },
  },
  pages: {
    signIn: '/signin',
    // Route NextAuth's error UI back to /signin so the AccessDenied banner
    // built into the signin page renders the actual message. Without this
    // override v0.2 sends denied users to the default /api/auth/error page,
    // which only shows a generic error code and breaks the polished flow
    // we already built in src/app/signin/page.tsx.
    error: '/signin',
  },
});
