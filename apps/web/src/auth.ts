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
      authorization: { params: { scope: 'read:user user:email' } },
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
