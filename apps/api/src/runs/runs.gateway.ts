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
import { GithubPrService } from '../github/github-pr.service';
import { RunsService } from './runs.service';

interface AuthedSocketData {
  clientId?: string;
  ownerId?: string;
  isInternal?: boolean;
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

  constructor(
    private readonly runs: RunsService,
    private readonly githubPr: GithubPrService,
  ) {}

  emitRunStart(clientId: string, payload: RunStartPayload): void {
    this.server.to(`client:${clientId}`).emit(RUN_EVENTS.Start, payload);
    // Also fan-out to subscribers (web BFF / future direct browser subscribers)
    this.fanOutToRunRoom(payload.runId, RUN_EVENTS.Start, payload);
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
    this.fanOutToRunRoom(body.runId, RUN_EVENTS.Log, body);
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
    this.fanOutToRunRoom(body.runId, RUN_EVENTS.Step, body);
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
    this.fanOutToRunRoom(body.runId, RUN_EVENTS.Status, body);
    return { ok: true };
  }

  /**
   * Subscribe an internal (BFF) socket to a run's broadcast room. ClientsGateway
   * marks `socket.data.isInternal` when the connection token matches
   * INTERNAL_API_SECRET. Only those sockets may subscribe — desktop clients
   * have no business reading other clients' runs.
   */
  @SubscribeMessage('subscribe:run')
  async onSubscribeRun(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { runId?: string },
  ): Promise<{ ok: boolean }> {
    const data = socket.data as AuthedSocketData;
    if (!data.isInternal) return { ok: false };
    if (!body?.runId) return { ok: false };
    await socket.join(`run:${body.runId}`);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:run')
  async onUnsubscribeRun(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { runId?: string },
  ): Promise<{ ok: boolean }> {
    const data = socket.data as AuthedSocketData;
    if (!data.isInternal) return { ok: false };
    if (!body?.runId) return { ok: false };
    await socket.leave(`run:${body.runId}`);
    return { ok: true };
  }

  /**
   * Host-bridge: a desktop client asks api to open a GitHub PR on its behalf.
   * Client auth is sufficient (we already verified the JWT on connection); the
   * project is identified by `projectId` carried in the request.
   */
  @SubscribeMessage('github:openPR')
  async onOpenPullRequest(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: {
      projectId?: string;
      head?: string;
      base?: string;
      title?: string;
      body?: string;
      draft?: boolean;
    },
  ): Promise<{ ok: true; url: string; number: number } | { ok: false; error: string }> {
    if (!this.assertAuthed(socket)) return { ok: false, error: 'unauthorized' };
    if (!body?.projectId || !body.head || !body.title) {
      return { ok: false, error: 'projectId, head, and title are required' };
    }
    try {
      const pr = await this.githubPr.open({
        projectId: body.projectId,
        head: body.head,
        base: body.base,
        title: body.title,
        body: body.body,
        draft: body.draft,
      });
      return { ok: true, url: pr.url, number: pr.number };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`github:openPR failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /**
   * Broadcast a run event to every socket that joined `run:<runId>` on this
   * namespace. Rooms are namespace-scoped in socket.io, so the subscriber
   * connection must also live on `/clients` (it does — see ClientsGateway).
   */
  private fanOutToRunRoom(runId: string, event: string, payload: unknown): void {
    this.server.to(`run:${runId}`).emit(event, payload);
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
