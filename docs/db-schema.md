# Database Schema (Prisma)

> 실제 `schema.prisma`는 [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma)에 있다.
> 이 문서는 **의도와 제약**을 설명하고, 컬럼 shape는 schema 파일이 authoritative.
> Prisma 변경 시 이 문서도 같은 PR에서 갱신할 것.

## 1. 엔터티 다이어그램 (요약)

```
User 1───*  Project
User 1───*  Client
User 1───*  Harness
User 1───*  LlmProvider

Project 1───*  TodoItem
Project 1───*  HarnessRun
Harness 1───*  HarnessRun
Client 1───*   HarnessRun

HarnessRun 1───* RunStep
HarnessRun 1───* RunLog
HarnessRun 1───* RunArtifact
```

## 2. 주요 테이블

### User

- `id` (cuid)
- `githubId` (unique, int)
- `login` (string)
- `email` (string, nullable)
- `role` ('owner' | 'member')
- `createdAt`, `updatedAt`

### Project

- `id`, `ownerId → User.id`
- `githubInstallationId` (int)
- `installationDbId → GithubInstallation.id` (nullable)
- `githubRepoId` (int), `repoFullName` ("owner/name")
- `defaultClientId → Client.id` (nullable)
- `defaultHarnessId → Harness.id` (nullable)
- `defaultHarnessVersion` (int, nullable) — null 이면 latest follow, 값이 있으면 그 version 으로 pin
- `localRoot` (string, 클라이언트 측 경로)
- `worktreePolicy` ('keep' | 'auto-remove-success' | 'auto-remove-always')
- `cloneStatus` ('not_cloned' | 'cloning' | 'ready' | 'failed') — sidecar 가 보고
- `cloneError` (string, nullable) — FAILED 일 때만 채워짐
- `cloneCompletedAt` (datetime, nullable) — READY 진입 시점

### RunPreset (v0.2 N3)

- `id`, `projectId → Project.id` (cascade delete)
- `name` (string) — `(projectId, name)` unique
- `harnessId → Harness.id` (restrict)
- `clientId → Client.id` (restrict)
- `inputs` (json, default `{}`) — harness 실행 시 inject 되는 입력 값
- `isDefault` (bool) — project 별 최대 1 개 (service 가 트랜잭션으로 보장)
- `createdAt`, `updatedAt`

### Client

- `id`, `ownerId`
- `name`, `hostname`, `os`, `version`
- `jwtTokenHash`
- `lastSeenAt`, `status` ('online' | 'offline')
- `createdAt`

### ClientPairing

- `id`, `clientName`, `ownerId`
- `tokenHash`
- `expiresAt`
- `consumedAt` (nullable, 1회용)

### OwnerBudget (v0.2 N6)

- `ownerId` (PK, → User.id, cascade) — 1:1 with User
- `monthlyUsdLimit` (decimal, nullable) — null 이면 무제한
- `warnAt` (int, default 80) — 한도의 % 경고 임계치
- `resetDay` (int, default 1) — 월 윈도우 리셋 day-of-month (1~28)
- `updatedAt`

### UserNotificationSettings (v0.2 N5)

- `id`, `userId` (unique, → User.id, cascade) — 1:1 with User
- `webToast` (bool, default true) — web 토스트 채널 on/off
- `slackWebhookUrl` (bytea, nullable) — envelope-encrypted (Slack 채널 PR 에서 set)
- `emailEnabled` (bool, default false), `emailAddress` (string, nullable)
- `triggers` (json, default `{success:false, failed:true, cancelled:false}`) — terminal status 별 알림 여부
- `perProject` (json, default `{}`) — `{ [projectId]: { success?/failed?/cancelled? } }` override
- `createdAt`, `updatedAt`

### Notification (v0.2 N5)

- `id`, `userId` (→ User.id, cascade)
- `kind` (string) — `run-success`/`run-failed`/`run-cancelled`/`budget-warn`/`budget-exceeded`/`test`
- `title`, `body` (nullable)
- `runId` (nullable) — run 관련 알림이면 link
- `readAt` (datetime, nullable) — 안 읽었으면 null
- `createdAt`
- WebToast 채널이 한 row 씩 남김. Slack/email 은 out-of-band 발송이라 row 안 남김

### Harness

- `id`, `ownerId`
- `name`, `version` (int) — 같은 name 이 여러 version row 로 보존 (v0.2 N4)
- `definition` (JSONB — 파싱된 IR)
- `source` (text — 원본 YAML 보존)
- `createdAt`, `updatedAt`
- unique: (`ownerId`, `name`, `version`) — 매 save 가 새 version row 생성
- index: (`ownerId`, `name`) — latest 조회용

### HarnessRun

- `id`, `harnessId`, `projectId`, `clientId`, `triggeredByUserId`
- `status` ('queued' | 'running' | 'success' | 'failed' | 'cancelled')
- `branchName`, `workingDir`
- `inputs` (JSONB, default `{}`) — 실행 시 inject 된 입력 값. v0.2 N5 에서 retry 가 동일 payload 로
  재실행할 수 있도록 dispatch 시점에 보존
- `startedAt`, `finishedAt` (nullable)
- `costUsd` (decimal, nullable)
- `tokenUsage` (JSONB: { input, output, total } per provider)
- `retryOfRunId` (→ HarnessRun.id, nullable, onDelete SetNull) — retry 로 만들어진 run 이 원본을 link.
  self-relation `RunRetry` (역방향 `retries`)
- `cancelRequestedAt` (datetime, nullable) — 사용자가 cancel 을 요청한 시점 (RUNNING run 은 sidecar 확인 대기)
- `cancelledAt` (datetime, nullable) — 실제 CANCELLED 로 전이된 시점
- `cancelReason` (string, nullable)

### RunStep

- `id`, `runId`, `stepIndex` (int), `stepId` (string from YAML)
- `kind` ('tool' | 'llm' | 'subagent' | 'condition' | 'loop')
- `input` (JSONB), `output` (JSONB)
- `status`, `durationMs`, `error` (text, nullable)

### RunLog

- `id`, `runId`, `ts`
- `level` ('debug' | 'info' | 'warn' | 'error')
- `source` (string — step id / 'system' / tool name)
- `message` (text)

### RunArtifact

- `id`, `runId`, `stepId` (nullable)
- `kind` ('diff' | 'log' | 'json' | 'binary')
- `mimeType`, `bytes` (bytea — 1MB 이하만; 그 이상은 외부 파일 경로)

### LlmProvider

- `id`, `ownerId`
- `kind` ('codex-cli' | 'openai-compatible')
- `name`
- `baseUrl` (nullable, openai-compatible)
- `defaultModel`
- `credentialEncrypted` (bytea, nullable)
- `enabled` (bool)

### TodoItem

- `id`, `projectId`
- `title`, `body` (markdown)
- `status` ('open' | 'in_progress' | 'done')
- `sourceType` ('internal' | 'github-issue')
- `sourceRef` (nullable — github issue number)

## 3. 인덱스

- `Project(ownerId)`, `Project(repoFullName)`
- `HarnessRun(projectId, startedAt DESC)`
- `HarnessRun(retryOfRunId)` (N5: 한 run 의 retry 목록 조회)
- `RunLog(runId, ts)` (시간순 조회)
- `RunStep(runId, stepIndex)`

## 4. 마이그레이션

- Prisma migrate. 모든 변경은 PR에서 마이그레이션 파일 포함
- 파괴적 변경(drop column 등)은 별도 PR로 분리, 다운타임 영향 PR 본문에 명시
