-- Goal leftover from period close does not move cash, so account is optional.
ALTER TABLE "GoalReserve" ALTER COLUMN "accountId" DROP NOT NULL;

-- account = reserved from a bank/cash account; budget_close = leftover assigned at close
ALTER TABLE "GoalReserve" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'account';
