-- Custom remaining payment schedule for debts (array of amounts in cents)
ALTER TABLE "Debt" ADD COLUMN "paymentPlanCents" JSONB;
