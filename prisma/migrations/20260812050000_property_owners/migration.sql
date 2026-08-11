-- Ownership split: who owns what % of a property
CREATE TABLE "PropertyOwner" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyOwner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyOwner_propertyId_userId_key" ON "PropertyOwner"("propertyId", "userId");
CREATE INDEX "PropertyOwner_userId_idx" ON "PropertyOwner"("userId");

ALTER TABLE "PropertyOwner" ADD CONSTRAINT "PropertyOwner_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyOwner" ADD CONSTRAINT "PropertyOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
