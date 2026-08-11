-- Investments in a property and their estimated effect on value
CREATE TABLE "PropertyImprovement" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'improve',
    "recoveryPercent" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "doneOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyImprovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyImprovement_propertyId_idx" ON "PropertyImprovement"("propertyId");
CREATE INDEX "PropertyImprovement_householdId_idx" ON "PropertyImprovement"("householdId");

ALTER TABLE "PropertyImprovement" ADD CONSTRAINT "PropertyImprovement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
