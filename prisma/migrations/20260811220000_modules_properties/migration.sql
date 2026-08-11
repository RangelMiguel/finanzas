-- Marketplace installs + Properties (assets / liabilities)
CREATE TABLE "HouseholdModule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,

    CONSTRAINT "HouseholdModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HouseholdModule_householdId_moduleId_key" ON "HouseholdModule"("householdId", "moduleId");
CREATE INDEX "HouseholdModule_householdId_idx" ON "HouseholdModule"("householdId");

ALTER TABLE "HouseholdModule" ADD CONSTRAINT "HouseholdModule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PropertyItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "acquiredOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropertyItem_householdId_kind_idx" ON "PropertyItem"("householdId", "kind");

ALTER TABLE "PropertyItem" ADD CONSTRAINT "PropertyItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
