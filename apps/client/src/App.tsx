import { useEffect, useState } from 'react';
import { pairClient, PairClientError } from './lib/pair-client';
import { tauriPairingStorage, type PairingRecord } from './lib/pairing-storage';

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
    <main style={containerStyle}>
      <h1 style={{ marginBottom: 4 }}>DevGarden Client</h1>
      <p style={{ color: '#888', marginTop: 0 }}>로컬 에이전트 브릿지 — pairing 단계</p>

      {status.kind === 'loading' && <p>storage 로딩 중…</p>}

      {status.kind === 'paired' && (
        <section style={cardStyle}>
          <p style={{ marginTop: 0, color: '#9be39b' }}>✓ Paired</p>
          <p>
            <strong>{status.record.name}</strong>
          </p>
          <p style={metaStyle}>clientId: {status.record.clientId}</p>
          <p style={metaStyle}>api: {status.record.apiBaseUrl}</p>
          <p style={metaStyle}>paired at: {status.record.pairedAt}</p>
          <button onClick={handleUnpair} style={buttonStyle}>
            Unpair
          </button>
        </section>
      )}

      {(status.kind === 'unpaired' || status.kind === 'pairing' || status.kind === 'error') && (
        <form onSubmit={handlePair} style={cardStyle}>
          <label style={labelStyle}>
            API base URL
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              style={inputStyle}
              disabled={status.kind === 'pairing'}
              required
            />
          </label>
          <label style={labelStyle}>
            Pairing token
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
              disabled={status.kind === 'pairing'}
              required
            />
          </label>
          <button type="submit" disabled={status.kind === 'pairing'} style={buttonStyle}>
            {status.kind === 'pairing' ? 'Pairing…' : 'Pair this client'}
          </button>
          {status.kind === 'error' && (
            <p data-testid="pair-error" style={errorStyle}>
              {status.message}
            </p>
          )}
        </form>
      )}
    </main>
  );
}

const containerStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: 24,
  maxWidth: 560,
};
const cardStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  border: '1px solid #333',
  borderRadius: 8,
  background: '#111',
  color: '#eee',
};
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 12, fontSize: 13 };
const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '8px 10px',
  background: '#000',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: 6,
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#eee',
  color: '#111',
  border: 'none',
  borderRadius: 6,
  fontWeight: 500,
  cursor: 'pointer',
};
const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 10px',
  background: '#3a1010',
  color: '#fbb',
  border: '1px solid #722',
  borderRadius: 6,
  fontSize: 13,
};
const metaStyle: React.CSSProperties = { fontSize: 12, color: '#888', margin: '4px 0' };
