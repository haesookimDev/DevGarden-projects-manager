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
- `githubRepoId` (int), `repoFullName` ("owner/name")
- `defaultClientId → Client.id` (nullable)
- `defaultHarnessId → Harness.id` (nullable)
- `localRoot` (string, 클라이언트 측 경로)
- `worktreePolicy` ('keep' | 'auto-remove-success' | 'auto-remove-always')

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

### Harness

- `id`, `ownerId`
- `name`, `version` (int)
- `definition` (JSONB — 파싱된 IR)
- `source` (text — 원본 YAML 보존)
- `createdAt`, `updatedAt`
- unique: (`ownerId`, `name`)

### HarnessRun

- `id`, `harnessId`, `projectId`, `clientId`, `triggeredByUserId`
- `status` ('queued' | 'running' | 'success' | 'failed' | 'cancelled')
- `branchName`, `workingDir`
- `startedAt`, `finishedAt` (nullable)
- `costUsd` (decimal, nullable)
- `tokenUsage` (JSONB: { input, output, total } per provider)

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
- `RunLog(runId, ts)` (시간순 조회)
- `RunStep(runId, stepIndex)`

## 4. 마이그레이션

- Prisma migrate. 모든 변경은 PR에서 마이그레이션 파일 포함
- 파괴적 변경(drop column 등)은 별도 PR로 분리, 다운타임 영향 PR 본문에 명시
