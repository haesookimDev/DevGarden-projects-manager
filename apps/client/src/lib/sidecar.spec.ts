import { describe, expect, it } from 'vitest';

import { reduceSidecarEvent, type SidecarSnapshot } from './sidecar';

const INITIAL: SidecarSnapshot = {
  status: { kind: 'idle' },
  currentRunId: null,
  lastStderr: null,
};

describe('reduceSidecarEvent', () => {
  it('hello → starting', () => {
    expect(reduceSidecarEvent(INITIAL, { type: 'sidecar:hello' }).status).toEqual({
      kind: 'starting',
    });
  });

  it('status connecting carries apiBaseUrl when present', () => {
    expect(
      reduceSidecarEvent(INITIAL, {
        type: 'sidecar:status',
        status: 'connecting',
        apiBaseUrl: 'http://api.local',
      }).status,
    ).toEqual({ kind: 'connecting', apiBaseUrl: 'http://api.local' });
  });

  it('status connected → running with since timestamp', () => {
    const out = reduceSidecarEvent(INITIAL, {
      type: 'sidecar:status',
      status: 'connected',
      since: '2026-01-01T00:00:00Z',
    });
    expect(out.status).toEqual({ kind: 'running', since: '2026-01-01T00:00:00Z' });
  });

  it('status disconnected carries reason when present', () => {
    expect(
      reduceSidecarEvent(INITIAL, {
        type: 'sidecar:status',
        status: 'disconnected',
        reason: 'transport close',
      }).status,
    ).toEqual({ kind: 'disconnected', reason: 'transport close' });
  });

  it('status error sets kind=error with message', () => {
    expect(
      reduceSidecarEvent(INITIAL, {
        type: 'sidecar:status',
        status: 'error',
        message: 'connect ECONNREFUSED',
      }).status,
    ).toEqual({ kind: 'error', message: 'connect ECONNREFUSED' });
  });

  it('run-start / run-end set + clear currentRunId without disturbing status', () => {
    const running: SidecarSnapshot = {
      ...INITIAL,
      status: { kind: 'running', since: 'x' },
    };
    const mid = reduceSidecarEvent(running, { type: 'sidecar:run-start', runId: 'run_1' });
    expect(mid.currentRunId).toBe('run_1');
    expect(mid.status).toEqual(running.status);

    const after = reduceSidecarEvent(mid, { type: 'sidecar:run-end' });
    expect(after.currentRunId).toBeNull();
    expect(after.status).toEqual(running.status);
  });

  it('sidecar:error event surfaces the message as status error', () => {
    expect(reduceSidecarEvent(INITIAL, { type: 'sidecar:error', message: 'boom' }).status).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });

  it('eof and shutdown both move status to stopped', () => {
    expect(reduceSidecarEvent(INITIAL, { type: 'sidecar:eof' }).status).toEqual({
      kind: 'stopped',
    });
    expect(reduceSidecarEvent(INITIAL, { type: 'sidecar:shutdown' }).status).toEqual({
      kind: 'stopped',
    });
  });

  it('stderr fills lastStderr without touching status', () => {
    const out = reduceSidecarEvent(INITIAL, { type: 'sidecar:stderr', line: 'Cannot find node' });
    expect(out.lastStderr).toBe('Cannot find node');
    expect(out.status).toEqual(INITIAL.status);
  });

  it('unknown event types pass through unchanged', () => {
    const out = reduceSidecarEvent(INITIAL, { type: 'sidecar:unknown' });
    expect(out).toBe(INITIAL);
  });
});
