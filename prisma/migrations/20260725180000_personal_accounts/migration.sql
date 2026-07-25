-- AlterTable
ALTER TABLE "Account" ADD COLUMN "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Account_householdId_ownerUserId_idx" ON "Account"("householdId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_householdId_ownerUserId_key" ON "Account"("householdId", "ownerUserId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
