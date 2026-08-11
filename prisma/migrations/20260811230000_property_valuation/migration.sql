-- Appreciation / depreciation on valuables
ALTER TABLE "PropertyItem" ADD COLUMN "valueChange" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "PropertyItem" ADD COLUMN "annualRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PropertyItem" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'compound';
ALTER TABLE "PropertyItem" ADD COLUMN "usefulLifeYears" DOUBLE PRECISION;
ALTER TABLE "PropertyItem" ADD COLUMN "salvageCents" INTEGER NOT NULL DEFAULT 0;
