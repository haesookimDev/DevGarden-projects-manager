-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "WorktreePolicy" AS ENUM ('KEEP', 'AUTO_REMOVE_SUCCESS', 'AUTO_REMOVE_ALWAYS');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('TOOL', 'LLM', 'SUBAGENT', 'CONDITION', 'LOOP');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "ArtifactKind" AS ENUM ('DIFF', 'LOG', 'JSON', 'BINARY');

-- CreateEnum
CREATE TYPE "LlmProviderKind" AS ENUM ('CODEX_CLI', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TodoSource" AS ENUM ('INTERNAL', 'GITHUB_ISSUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "os" TEXT,
    "version" TEXT,
    "jwtTokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "status" "ClientStatus" NOT NULL DEFAULT 'OFFLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPairing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "githubInstallationId" INTEGER NOT NULL,
    "githubRepoId" INTEGER NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "defaultClientId" TEXT,
    "defaultHarnessId" TEXT,
    "localRoot" TEXT NOT NULL,
    "worktreePolicy" "WorktreePolicy" NOT NULL DEFAULT 'AUTO_REMOVE_SUCCESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Harness" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Harness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarnessRun" (
    "id" TEXT NOT NULL,
    "harnessId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "triggeredByUserId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "branchName" TEXT,
    "workingDir" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "costUsd" DECIMAL(10,6),
    "tokenUsage" JSONB,

    CONSTRAINT "HarnessRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepId" TEXT NOT NULL,
    "kind" "StepKind" NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "RunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "kind" "ArtifactKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmProvider" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "LlmProviderKind" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "defaultModel" TEXT NOT NULL,
    "credentialEncrypted" BYTEA,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TodoItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "TodoStatus" NOT NULL DEFAULT 'OPEN',
    "sourceType" "TodoSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceRef" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TodoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE INDEX "Client_ownerId_idx" ON "Client"("ownerId");

-- CreateIndex
CREATE INDEX "ClientPairing_ownerId_idx" ON "ClientPairing"("ownerId");

-- CreateIndex
CREATE INDEX "ClientPairing_expiresAt_idx" ON "ClientPairing"("expiresAt");

-- CreateIndex
CREATE INDEX "Project_repoFullName_idx" ON "Project"("repoFullName");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_githubRepoId_key" ON "Project"("ownerId", "githubRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "Harness_ownerId_name_key" ON "Harness"("ownerId", "name");

-- CreateIndex
CREATE INDEX "HarnessRun_projectId_startedAt_idx" ON "HarnessRun"("projectId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "HarnessRun_harnessId_idx" ON "HarnessRun"("harnessId");

-- CreateIndex
CREATE INDEX "HarnessRun_clientId_idx" ON "HarnessRun"("clientId");

-- CreateIndex
CREATE INDEX "RunStep_runId_idx" ON "RunStep"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RunStep_runId_stepIndex_key" ON "RunStep"("runId", "stepIndex");

-- CreateIndex
CREATE INDEX "RunLog_runId_ts_idx" ON "RunLog"("runId", "ts");

-- CreateIndex
CREATE INDEX "RunArtifact_runId_idx" ON "RunArtifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "LlmProvider_ownerId_name_key" ON "LlmProvider"("ownerId", "name");

-- CreateIndex
CREATE INDEX "TodoItem_projectId_status_idx" ON "TodoItem"("projectId", "status");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPairing" ADD CONSTRAINT "ClientPairing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultClientId_fkey" FOREIGN KEY ("defaultClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultHarnessId_fkey" FOREIGN KEY ("defaultHarnessId") REFERENCES "Harness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Harness" ADD CONSTRAINT "Harness_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_harnessId_fkey" FOREIGN KEY ("harnessId") REFERENCES "Harness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunStep" ADD CONSTRAINT "RunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HarnessRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLog" ADD CONSTRAINT "RunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HarnessRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunArtifact" ADD CONSTRAINT "RunArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HarnessRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmProvider" ADD CONSTRAINT "LlmProvider_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodoItem" ADD CONSTRAINT "TodoItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
