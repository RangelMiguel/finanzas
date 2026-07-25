-- CreateTable
CREATE TABLE "TransactionFunding" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "accountId" TEXT,
    "creditCardId" TEXT,

    CONSTRAINT "TransactionFunding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionFunding_transactionId_idx" ON "TransactionFunding"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionFunding_accountId_idx" ON "TransactionFunding"("accountId");

-- CreateIndex
CREATE INDEX "TransactionFunding_creditCardId_idx" ON "TransactionFunding"("creditCardId");

-- AddForeignKey
ALTER TABLE "TransactionFunding" ADD CONSTRAINT "TransactionFunding_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionFunding" ADD CONSTRAINT "TransactionFunding_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionFunding" ADD CONSTRAINT "TransactionFunding_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: prefer credit card when both account + card were set (old form defaulted account).
INSERT INTO "TransactionFunding" ("id", "transactionId", "amountCents", "accountId", "creditCardId")
SELECT
    'tf_' || t."id",
    t."id",
    t."amountCents",
    CASE WHEN t."creditCardId" IS NOT NULL THEN NULL ELSE t."accountId" END,
    t."creditCardId"
FROM "Transaction" t
WHERE t."deletedAt" IS NULL
  AND t."type" = 'expense'
  AND (t."accountId" IS NOT NULL OR t."creditCardId" IS NOT NULL);
