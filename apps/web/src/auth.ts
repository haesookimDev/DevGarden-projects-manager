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
      userinfo: githubUrls.userinfoUrl,
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
  },
});
