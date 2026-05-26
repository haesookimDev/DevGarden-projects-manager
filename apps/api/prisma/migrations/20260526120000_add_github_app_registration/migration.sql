-- CreateEnum
CREATE TYPE "GithubAppSource" AS ENUM ('MANIFEST', 'BYO');

-- CreateTable
CREATE TABLE "GithubAppRegistration" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "source" "GithubAppSource" NOT NULL,
    "appId" INTEGER NOT NULL,
    "appSlug" TEXT,
    "webhookSecret" BYTEA NOT NULL,
    "privateKeyPem" BYTEA NOT NULL,
    "clientId" TEXT,
    "clientSecret" BYTEA,
    "htmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubAppRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubInstallation" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "htmlUrl" TEXT,
    "permissions" JSONB NOT NULL,
    "events" TEXT[],
    "repositorySelection" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubInstallation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "installationDbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GithubAppRegistration_ownerId_key" ON "GithubAppRegistration"("ownerId");

-- CreateIndex
CREATE INDEX "GithubAppRegistration_appId_idx" ON "GithubAppRegistration"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubInstallation_installationId_key" ON "GithubInstallation"("installationId");

-- CreateIndex
CREATE INDEX "GithubInstallation_registrationId_idx" ON "GithubInstallation"("registrationId");

-- AddForeignKey
ALTER TABLE "GithubAppRegistration" ADD CONSTRAINT "GithubAppRegistration_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubInstallation" ADD CONSTRAINT "GithubInstallation_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "GithubAppRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_installationDbId_fkey" FOREIGN KEY ("installationDbId") REFERENCES "GithubInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
