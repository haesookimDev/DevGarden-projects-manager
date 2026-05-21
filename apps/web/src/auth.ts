import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { isAllowed, parseAllowList } from './lib/auth/allow-list';
import { upsertUserViaApi } from './lib/auth/upsert-user';

declare module 'next-auth' {
  interface Session {
    user: {
      githubId: number;
      login: string;
    } & DefaultSession['user'];
  }

  interface JWT {
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
      authorization: { params: { scope: 'read:user user:email' } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const login = typeof profile?.login === 'string' ? profile.login : undefined;
      const githubId = typeof profile?.id === 'number' ? profile.id : undefined;

      if (!isAllowed(login, allowList)) return false;
      if (!login || githubId === undefined) return false;

      await upsertUserViaApi({
        githubId,
        login,
        email: typeof profile?.email === 'string' ? profile.email : null,
      });

      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        if (typeof profile.id === 'number') token.githubId = profile.id;
        if (typeof profile.login === 'string') token.login = profile.login;
      }
      return token;
    },
    async session({ session, token }) {
      const githubId = token.githubId;
      const login = token.login;
      if (typeof githubId === 'number' && typeof login === 'string') {
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
