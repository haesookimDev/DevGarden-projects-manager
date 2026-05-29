-- AlterTable
ALTER TABLE "HarnessRun" ADD COLUMN     "inputs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "retryOfRunId" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT;

-- CreateIndex
CREATE INDEX "HarnessRun_retryOfRunId_idx" ON "HarnessRun"("retryOfRunId");

-- AddForeignKey
ALTER TABLE "HarnessRun" ADD CONSTRAINT "HarnessRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "HarnessRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
