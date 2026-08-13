-- Bank loan interest calculation method (french, german, flat, interest_only)
ALTER TABLE "Debt" ADD COLUMN "interestMethod" TEXT NOT NULL DEFAULT 'french';
