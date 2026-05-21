import { signIn } from '@/auth';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-2xl font-semibold">Sign in to DevGarden</h1>
        <p className="mt-2 text-sm text-neutral-400">
          GitHub 계정으로 로그인합니다. 관리자가 등록한 계정만 접근 가능합니다.
        </p>

        <SignInError searchParams={searchParams} />

        <form
          action={async () => {
            'use server';
            await signIn('github', { redirectTo: '/dashboard' });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
          >
            Continue with GitHub
          </button>
        </form>
      </div>
    </main>
  );
}

async function SignInError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;

  const message =
    error === 'AccessDenied'
      ? '이 계정은 허용 목록에 없습니다. 관리자에게 문의하세요.'
      : `로그인 실패: ${error}`;

  return (
    <div className="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
      {message}
    </div>
  );
}
