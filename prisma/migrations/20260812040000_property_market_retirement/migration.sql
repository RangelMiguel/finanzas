-- Manual market value on properties + optional equity in retirement nest egg
ALTER TABLE "PropertyItem" ADD COLUMN "marketValueCents" INTEGER;
ALTER TABLE "PropertyItem" ADD COLUMN "marketValueOn" TEXT;

ALTER TABLE "RetirementPlan" ADD COLUMN "includePropertyEquity" BOOLEAN NOT NULL DEFAULT false;
