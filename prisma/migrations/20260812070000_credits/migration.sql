-- Informal credits: money lent or borrowed with anyone (not only family)
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'person',
    "counterpartyName" TEXT NOT NULL,
    "counterpartyUserId" TEXT,
    "principalCents" INTEGER NOT NULL,
    "dueOn" TEXT,
    "openedOn" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditPayment" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "accountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Credit_householdId_direction_idx" ON "Credit"("householdId", "direction");
CREATE INDEX "Credit_counterpartyUserId_idx" ON "Credit"("counterpartyUserId");
CREATE INDEX "CreditPayment_householdId_idx" ON "CreditPayment"("householdId");
CREATE INDEX "CreditPayment_creditId_idx" ON "CreditPayment"("creditId");

ALTER TABLE "Credit" ADD CONSTRAINT "Credit_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_counterpartyUserId_fkey" FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
