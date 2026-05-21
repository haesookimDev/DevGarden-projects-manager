import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  RUN_EVENTS,
  type RunLogPayload,
  type RunStartPayload,
  type RunStatusPayload,
  type RunStepPayload,
} from '@devgarden/shared';
import { LogLevel, RunStatus, StepKind, StepStatus } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { RunsService } from './runs.service';

interface AuthedSocketData {
  clientId?: string;
  ownerId?: string;
}

/**
 * Runs traffic over the `/clients` socket.io namespace.
 *
 *   api → client: `run:start` (emitted by `emitRunStart`)
 *   client → api: `run:log` / `run:step` / `run:status`
 *
 * Auth/connection lifecycle is owned by `ClientsGateway` on the same namespace;
 * `socket.data.clientId` is populated there before any handler here runs.
 */
@WebSocketGateway({
  namespace: '/clients',
  cors: { origin: '*' },
})
export class RunsGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RunsGateway.name);

  constructor(private readonly runs: RunsService) {}

  emitRunStart(clientId: string, payload: RunStartPayload): void {
    this.server.to(`client:${clientId}`).emit(RUN_EVENTS.Start, payload);
  }

  @SubscribeMessage(RUN_EVENTS.Log)
  async onLog(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RunLogPayload,
  ): Promise<{ ok: boolean }> {
    if (!this.assertAuthed(socket)) return { ok: false };
    if (!body?.runId) return { ok: false };
    await this.runs.appendLog({
      runId: body.runId,
      level: mapLogLevel(body.level),
      source: body.source ?? 'client',
      message: body.message ?? '',
    });
    return { ok: true };
  }

  @SubscribeMessage(RUN_EVENTS.Step)
  async onStep(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RunStepPayload,
  ): Promise<{ ok: boolean }> {
    if (!this.assertAuthed(socket)) return { ok: false };
    if (!body?.runId || typeof body.stepIndex !== 'number' || !body.stepId) {
      return { ok: false };
    }
    await this.runs.appendStep({
      runId: body.runId,
      stepIndex: body.stepIndex,
      stepId: body.stepId,
      kind: mapStepKind(body.kind),
      status: mapStepStatus(body.status),
      input: body.input,
      output: body.output,
      durationMs: body.durationMs,
      error: body.error,
    });
    return { ok: true };
  }

  @SubscribeMessage(RUN_EVENTS.Status)
  async onStatus(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RunStatusPayload,
  ): Promise<{ ok: boolean }> {
    if (!this.assertAuthed(socket)) return { ok: false };
    if (!body?.runId) return { ok: false };
    await this.runs.setStatus(body.runId, mapRunStatus(body.status));
    return { ok: true };
  }

  private assertAuthed(socket: Socket): boolean {
    const data = socket.data as AuthedSocketData;
    if (!data.clientId) {
      this.logger.warn(`run event from unauthenticated socket ${socket.id}`);
      return false;
    }
    return true;
  }
}

function mapLogLevel(level: RunLogPayload['level']): LogLevel {
  switch (level) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'warn':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'info':
    default:
      return LogLevel.INFO;
  }
}

function mapStepKind(kind: RunStepPayload['kind']): StepKind {
  return StepKind[kind];
}

function mapStepStatus(status: RunStepPayload['status']): StepStatus {
  return StepStatus[status];
}

function mapRunStatus(status: RunStatusPayload['status']): RunStatus {
  return RunStatus[status];
}
