import Link from 'next/link';
import { PairingForm } from './pairing-form';

export default function NewClientPage() {
  return (
    <main className="p-8">
      <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold">Add client</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Dashboard
        </Link>
      </header>

      <p className="mt-4 text-sm text-neutral-400">
        데스크탑 클라이언트를 페어링하려면 클라이언트 이름을 입력해 1회용 페어링 토큰을 발급하세요.
        토큰은 10분간 유효합니다.
      </p>

      <PairingForm />
    </main>
  );
}
