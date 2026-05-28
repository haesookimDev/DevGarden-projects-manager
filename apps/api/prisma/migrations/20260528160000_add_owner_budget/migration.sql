-- CreateTable
CREATE TABLE "OwnerBudget" (
    "ownerId" TEXT NOT NULL,
    "monthlyUsdLimit" DECIMAL(10,2),
    "warnAt" INTEGER NOT NULL DEFAULT 80,
    "resetDay" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerBudget_pkey" PRIMARY KEY ("ownerId")
);

-- AddForeignKey
ALTER TABLE "OwnerBudget" ADD CONSTRAINT "OwnerBudget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
