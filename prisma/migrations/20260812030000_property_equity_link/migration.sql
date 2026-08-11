-- Link an asset to the liability that finances it (casa + hipoteca = equity)
ALTER TABLE "PropertyItem" ADD COLUMN "financedById" TEXT;

CREATE UNIQUE INDEX "PropertyItem_financedById_key" ON "PropertyItem"("financedById");

ALTER TABLE "PropertyItem" ADD CONSTRAINT "PropertyItem_financedById_fkey" FOREIGN KEY ("financedById") REFERENCES "PropertyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
