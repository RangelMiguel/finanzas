-- Link property liabilities to the Debts module
ALTER TABLE "PropertyItem" ADD COLUMN "debtId" TEXT;

CREATE INDEX "PropertyItem_debtId_idx" ON "PropertyItem"("debtId");

ALTER TABLE "PropertyItem" ADD CONSTRAINT "PropertyItem_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
