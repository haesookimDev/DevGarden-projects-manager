import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@devgarden/ui';
import type { ConnectionStatus } from './lib/client-socket';
import { pairClient, PairClientError } from './lib/pair-client';
import { tauriPairingStorage, type PairingRecord } from './lib/pairing-storage';
import { useClientSocket } from './lib/use-client-socket';

const DEFAULT_API_BASE = 'http://localhost:3001';

type Status =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'pairing' }
  | { kind: 'paired'; record: PairingRecord }
  | { kind: 'error'; message: string };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [token, setToken] = useState('');

  const pairing = status.kind === 'paired' ? status.record : undefined;
  const connection = useClientSocket({ apiBaseUrl: pairing?.apiBaseUrl, jwt: pairing?.jwt });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const existing = await tauriPairingStorage.load();
        if (cancelled) return;
        setStatus(existing ? { kind: 'paired', record: existing } : { kind: 'unpaired' });
      } catch (e) {
        if (cancelled) return;
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'storage error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'pairing' });
    try {
      const record = await pairClient(
        { apiBaseUrl: apiBase, token: token.trim() },
        tauriPairingStorage,
      );
      setStatus({ kind: 'paired', record });
      setToken('');
    } catch (e) {
      const msg =
        e instanceof PairClientError
          ? `${e.message}${e.status ? '' : ' (network failed)'}`
          : e instanceof Error
            ? e.message
            : 'pairing failed';
      setStatus({ kind: 'error', message: msg });
    }
  }

  async function handleUnpair() {
    await tauriPairingStorage.clear();
    setStatus({ kind: 'unpaired' });
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">DevGarden Client</h1>
        <p className="text-sm text-muted-foreground">로컬 에이전트 브릿지 — pairing 단계</p>
      </header>

      {status.kind === 'loading' && (
        <p className="mt-6 text-sm text-muted-foreground">storage 로딩 중…</p>
      )}

      {status.kind === 'paired' && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              Paired
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{status.record.name}</p>
            <p className="text-xs text-muted-foreground">clientId: {status.record.clientId}</p>
            <p className="text-xs text-muted-foreground">api: {status.record.apiBaseUrl}</p>
            <p className="text-xs text-muted-foreground">paired at: {status.record.pairedAt}</p>
            <ConnectionPill status={connection} />
            <div className="pt-3">
              <Button onClick={handleUnpair} variant="outline" size="sm">
                Unpair
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(status.kind === 'unpaired' || status.kind === 'pairing' || status.kind === 'error') && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <form onSubmit={handlePair} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="client-api-base">API base URL</Label>
                <Input
                  id="client-api-base"
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  disabled={status.kind === 'pairing'}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-pairing-token">Pairing token</Label>
                <Textarea
                  id="client-pairing-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                  disabled={status.kind === 'pairing'}
                  required
                />
              </div>
              <Button type="submit" disabled={status.kind === 'pairing'}>
                {status.kind === 'pairing' ? 'Pairing…' : 'Pair this client'}
              </Button>
              {status.kind === 'error' && (
                <p
                  data-testid="pair-error"
                  className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {status.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function ConnectionPill({ status }: { status: ConnectionStatus }) {
  const { className, label } = pillFor(status);
  return (
    <p data-testid="connection-pill" className={`pt-2 text-xs ${className}`}>
      ● {label}
    </p>
  );
}

function pillFor(status: ConnectionStatus): { className: string; label: string } {
  switch (status.kind) {
    case 'idle':
      return { className: 'text-muted-foreground', label: 'idle' };
    case 'connecting':
      return { className: 'text-amber-500', label: 'connecting…' };
    case 'connected':
      return {
        className: 'text-emerald-500',
        label: `connected (since ${status.since.slice(11, 19)})`,
      };
    case 'disconnected':
      return {
        className: 'text-muted-foreground',
        label: `disconnected${status.reason ? `: ${status.reason}` : ''}`,
      };
    case 'error':
      return { className: 'text-destructive', label: `error: ${status.message}` };
  }
}
