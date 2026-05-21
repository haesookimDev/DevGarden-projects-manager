-- CreateTable
CREATE TABLE "GithubEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "repoFullName" TEXT,
    "projectId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubEvent_deliveryId_key" ON "GithubEvent"("deliveryId");

-- CreateIndex
CREATE INDEX "GithubEvent_projectId_receivedAt_idx" ON "GithubEvent"("projectId", "receivedAt");

-- CreateIndex
CREATE INDEX "GithubEvent_eventType_receivedAt_idx" ON "GithubEvent"("eventType", "receivedAt");

-- AddForeignKey
ALTER TABLE "GithubEvent" ADD CONSTRAINT "GithubEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
