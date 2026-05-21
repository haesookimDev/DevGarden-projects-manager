// Unit-level coverage for RunsGateway: stubs the Server emit + RunsService so
// we verify the dispatch shape and the persistence calls in isolation. Real
// socket wiring is covered by integration tests.

import { describe, expect, it, vi } from 'vitest';
import { LogLevel, RunStatus, StepKind, StepStatus } from '@prisma/client';
import { RUN_EVENTS } from '@devgarden/shared';
import type { Socket } from 'socket.io';
import { RunsGateway } from './runs.gateway';
import type { RunsService } from './runs.service';

function makeGateway() {
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  const runs = {
    appendLog: vi.fn().mockResolvedValue(undefined),
    appendStep: vi.fn().mockResolvedValue(undefined),
    setStatus: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<RunsService>;

  const gw = new RunsGateway(runs as unknown as RunsService);
  gw.server = { to } as unknown as RunsGateway['server'];
  return { gw, emit, to, runs };
}

function authedSocket(clientId = 'client-abc'): Socket {
  return { id: 'sock-1', data: { clientId } } as unknown as Socket;
}

function internalSocket(): Socket & {
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
} {
  return {
    id: 'sock-bff',
    data: { isInternal: true },
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
  } as unknown as Socket & {
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
  };
}

describe('RunsGateway', () => {
  describe('emitRunStart', () => {
    it("routes the payload to the client's room AND fans out to the run room", () => {
      const { gw, to, emit } = makeGateway();
      gw.emitRunStart('client-abc', {
        runId: 'run-1',
        harness: { name: 'h', version: 1, steps: [] },
        inputs: {},
      });
      expect(to).toHaveBeenCalledWith('client:client-abc');
      expect(to).toHaveBeenCalledWith('run:run-1');
      const emittedEvents = emit.mock.calls.map((c) => c[0]);
      expect(emittedEvents.filter((e) => e === RUN_EVENTS.Start)).toHaveLength(2);
    });
  });

  describe('subscribe:run', () => {
    it('lets internal sockets join run rooms', async () => {
      const { gw } = makeGateway();
      const socket = internalSocket();
      const ack = await gw.onSubscribeRun(socket, { runId: 'run-1' });
      expect(ack).toEqual({ ok: true });
      expect(socket.join).toHaveBeenCalledWith('run:run-1');
    });

    it('rejects subscribe attempts from desktop client sockets', async () => {
      const { gw } = makeGateway();
      const socket = {
        id: 's',
        data: { clientId: 'c-1' },
        join: vi.fn(),
      } as unknown as Socket & { join: ReturnType<typeof vi.fn> };
      const ack = await gw.onSubscribeRun(socket, { runId: 'run-1' });
      expect(ack).toEqual({ ok: false });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('unsubscribe leaves the run room', async () => {
      const { gw } = makeGateway();
      const socket = internalSocket();
      const ack = await gw.onUnsubscribeRun(socket, { runId: 'run-1' });
      expect(ack).toEqual({ ok: true });
      expect(socket.leave).toHaveBeenCalledWith('run:run-1');
    });
  });

  describe('onLog', () => {
    it('rejects logs from unauthenticated sockets', async () => {
      const { gw, runs } = makeGateway();
      const socket = { id: 'sock', data: {} } as unknown as Socket;
      const ack = await gw.onLog(socket, {
        runId: 'r',
        level: 'info',
        source: 'x',
        message: 'm',
      });
      expect(ack).toEqual({ ok: false });
      expect(runs.appendLog).not.toHaveBeenCalled();
    });

    it('persists a log line via RunsService and fans out to the run room', async () => {
      const { gw, runs, to, emit } = makeGateway();
      const ack = await gw.onLog(authedSocket(), {
        runId: 'run-1',
        level: 'warn',
        source: 'tool/fs.write',
        message: 'wrote a file',
      });
      expect(ack).toEqual({ ok: true });
      expect(runs.appendLog).toHaveBeenCalledWith({
        runId: 'run-1',
        level: LogLevel.WARN,
        source: 'tool/fs.write',
        message: 'wrote a file',
      });
      expect(to).toHaveBeenCalledWith('run:run-1');
      expect(emit).toHaveBeenCalledWith(
        RUN_EVENTS.Log,
        expect.objectContaining({ runId: 'run-1' }),
      );
    });
  });

  describe('onStep', () => {
    it('persists a step result with mapped enums', async () => {
      const { gw, runs } = makeGateway();
      const ack = await gw.onStep(authedSocket(), {
        runId: 'run-1',
        stepIndex: 0,
        stepId: 'plan',
        kind: 'TOOL',
        status: 'SUCCESS',
        durationMs: 12,
        output: { ok: true },
      });
      expect(ack).toEqual({ ok: true });
      expect(runs.appendStep).toHaveBeenCalledWith({
        runId: 'run-1',
        stepIndex: 0,
        stepId: 'plan',
        kind: StepKind.TOOL,
        status: StepStatus.SUCCESS,
        input: undefined,
        output: { ok: true },
        durationMs: 12,
        error: undefined,
      });
    });

    it('rejects malformed payloads', async () => {
      const { gw, runs } = makeGateway();
      const ack = await gw.onStep(authedSocket(), {
        runId: '',
        stepIndex: 0,
        stepId: '',
        kind: 'TOOL',
        status: 'SUCCESS',
      });
      expect(ack).toEqual({ ok: false });
      expect(runs.appendStep).not.toHaveBeenCalled();
    });
  });

  describe('onStatus', () => {
    it('flips the run status via RunsService', async () => {
      const { gw, runs } = makeGateway();
      const ack = await gw.onStatus(authedSocket(), {
        runId: 'run-1',
        status: 'SUCCESS',
      });
      expect(ack).toEqual({ ok: true });
      expect(runs.setStatus).toHaveBeenCalledWith('run-1', RunStatus.SUCCESS);
    });
  });
});
