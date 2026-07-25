-- CreateTable
CREATE TABLE "VisibilityTemplate" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisibilityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisibilityTemplate_householdId_idx" ON "VisibilityTemplate"("householdId");

-- AddForeignKey
ALTER TABLE "VisibilityTemplate" ADD CONSTRAINT "VisibilityTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
