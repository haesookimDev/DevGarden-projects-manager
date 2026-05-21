import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { isAllowed, parseAllowList } from './lib/auth/allow-list';

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
      const login = profile?.login;
      return isAllowed(typeof login === 'string' ? login : undefined, allowList);
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
