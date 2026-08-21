-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "ccBillingCutoff" TEXT;

-- AlterTable
ALTER TABLE "InstallmentPlan" ADD COLUMN "billingCutoffs" TEXT NOT NULL DEFAULT '{}';
