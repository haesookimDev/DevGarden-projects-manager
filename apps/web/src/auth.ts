import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { isAllowed, parseAllowList } from './lib/auth/allow-list';
import { upsertUserViaApi } from './lib/auth/upsert-user';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      githubId: number;
      login: string;
    } & DefaultSession['user'];
  }

  interface JWT {
    dbUserId?: string;
    githubId?: number;
    login?: string;
  }
}

const allowList = parseAllowList(process.env.OWNER_GITHUB_LOGINS);

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      // URL overrides exist so end-to-end tests can swap GitHub for a local mock.
      // In production these env vars are unset and NextAuth falls back to github.com.
      authorization: {
        url:
          process.env.AUTH_GITHUB_AUTHORIZATION_URL ?? 'https://github.com/login/oauth/authorize',
        params: { scope: 'read:user user:email' },
      },
      token: process.env.AUTH_GITHUB_TOKEN_URL ?? 'https://github.com/login/oauth/access_token',
      userinfo: process.env.AUTH_GITHUB_USERINFO_URL ?? 'https://api.github.com/user',
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = typeof profile?.login === 'string' ? profile.login : undefined;
      return isAllowed(login, allowList);
    },
    async jwt({ token, profile }) {
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
