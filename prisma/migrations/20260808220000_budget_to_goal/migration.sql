-- Mid-period budget → goal deductions (no cash movement).
ALTER TABLE "GoalReserve" ADD COLUMN "categoryId" TEXT;

CREATE INDEX "GoalReserve_categoryId_idx" ON "GoalReserve"("categoryId");
CREATE INDEX "GoalReserve_householdId_period_source_idx" ON "GoalReserve"("householdId", "period", "source");

ALTER TABLE "GoalReserve" ADD CONSTRAINT "GoalReserve_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
