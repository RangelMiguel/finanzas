-- CreateTable
CREATE TABLE "RetirementPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mi retiro',
    "currentAge" INTEGER NOT NULL DEFAULT 35,
    "retirementAge" INTEGER NOT NULL DEFAULT 65,
    "lifeExpectancyAge" INTEGER NOT NULL DEFAULT 90,
    "desiredAnnualIncomeCents" INTEGER NOT NULL DEFAULT 36000000,
    "currentAnnualIncomeCents" INTEGER NOT NULL DEFAULT 0,
    "replacementPercent" INTEGER NOT NULL DEFAULT 70,
    "currentSavingsCents" INTEGER,
    "includeAccountBalances" BOOLEAN NOT NULL DEFAULT true,
    "includeGoalReserves" BOOLEAN NOT NULL DEFAULT true,
    "monthlyContributionCents" INTEGER NOT NULL DEFAULT 0,
    "contributionGrowthPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnPrePercent" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "returnPostPercent" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "inflationPercent" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "withdrawalRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "pensionAnnualCents" INTEGER NOT NULL DEFAULT 0,
    "otherIncomeAnnualCents" INTEGER NOT NULL DEFAULT 0,
    "taxDragPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetirementPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetirementPlan_householdId_userId_key" ON "RetirementPlan"("householdId", "userId");
CREATE INDEX "RetirementPlan_userId_idx" ON "RetirementPlan"("userId");

ALTER TABLE "RetirementPlan" ADD CONSTRAINT "RetirementPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetirementPlan" ADD CONSTRAINT "RetirementPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
