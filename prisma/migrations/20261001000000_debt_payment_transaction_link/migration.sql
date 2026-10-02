-- Link debt payments to their ledger movement so deleting one undoes the other.
ALTER TABLE "DebtPayment" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "DebtPayment" ADD COLUMN "consumedPlanStepCents" INTEGER;

CREATE UNIQUE INDEX "DebtPayment_transactionId_key" ON "DebtPayment"("transactionId");

ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
