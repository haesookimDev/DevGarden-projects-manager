-- Drop the old (ownerId, name) unique so the same name can hold many versions.
-- Original was created as a UNIQUE INDEX via Prisma, not a table constraint.
DROP INDEX IF EXISTS "Harness_ownerId_name_key";

-- New unique key includes version. Existing rows all have version=1 so no
-- conflicts during the rewrite.
CREATE UNIQUE INDEX "Harness_ownerId_name_version_key" ON "Harness"("ownerId", "name", "version");

-- Index for "latest version per (ownerId, name)" lookups.
CREATE INDEX "Harness_ownerId_name_idx" ON "Harness"("ownerId", "name");

-- Project pins a specific Harness version when not null; null = follow latest.
ALTER TABLE "Project" ADD COLUMN "defaultHarnessVersion" INTEGER;
