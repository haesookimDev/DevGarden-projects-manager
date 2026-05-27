-- CreateEnum
CREATE TYPE "CloneStatus" AS ENUM ('NOT_CLONED', 'CLONING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "cloneStatus" "CloneStatus" NOT NULL DEFAULT 'NOT_CLONED',
  ADD COLUMN "cloneError" TEXT,
  ADD COLUMN "cloneCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RunPreset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "harnessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunPreset_projectId_name_key" ON "RunPreset"("projectId", "name");

-- CreateIndex
CREATE INDEX "RunPreset_projectId_idx" ON "RunPreset"("projectId");

-- AddForeignKey
ALTER TABLE "RunPreset" ADD CONSTRAINT "RunPreset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunPreset" ADD CONSTRAINT "RunPreset_harnessId_fkey" FOREIGN KEY ("harnessId") REFERENCES "Harness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunPreset" ADD CONSTRAINT "RunPreset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
