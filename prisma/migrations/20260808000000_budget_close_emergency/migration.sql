-- AlterTable
ALTER TABLE "Budget" ADD COLUMN "emergencyCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BudgetPeriodClose" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "toPeriod" TEXT NOT NULL,
    "carryovers" TEXT NOT NULL,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetPeriodClose_householdId_idx" ON "BudgetPeriodClose"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriodClose_householdId_period_key" ON "BudgetPeriodClose"("householdId", "period");

-- AddForeignKey
ALTER TABLE "BudgetPeriodClose" ADD CONSTRAINT "BudgetPeriodClose_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPeriodClose" ADD CONSTRAINT "BudgetPeriodClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
