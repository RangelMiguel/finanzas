-- Prices add-on: stores, items, quotes, purchases linked to movements
CREATE TABLE "PriceStore" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceStore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pza',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "observedOn" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricePurchase" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "paidTotalCents" INTEGER NOT NULL,
    "purchasedOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricePurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceStore_householdId_idx" ON "PriceStore"("householdId");
CREATE INDEX "PriceItem_householdId_idx" ON "PriceItem"("householdId");
CREATE INDEX "PriceQuote_householdId_idx" ON "PriceQuote"("householdId");
CREATE INDEX "PriceQuote_itemId_observedOn_idx" ON "PriceQuote"("itemId", "observedOn");
CREATE INDEX "PriceQuote_storeId_idx" ON "PriceQuote"("storeId");
CREATE INDEX "PricePurchase_householdId_idx" ON "PricePurchase"("householdId");
CREATE INDEX "PricePurchase_itemId_idx" ON "PricePurchase"("itemId");
CREATE INDEX "PricePurchase_transactionId_idx" ON "PricePurchase"("transactionId");

ALTER TABLE "PriceStore" ADD CONSTRAINT "PriceStore_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceItem" ADD CONSTRAINT "PriceItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "PriceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePurchase" ADD CONSTRAINT "PricePurchase_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePurchase" ADD CONSTRAINT "PricePurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePurchase" ADD CONSTRAINT "PricePurchase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "PriceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricePurchase" ADD CONSTRAINT "PricePurchase_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Advanced investments profile
CREATE TABLE "InvestmentProfile" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "risk" TEXT NOT NULL DEFAULT 'medium',
    "horizonYears" INTEGER NOT NULL DEFAULT 3,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "marginalTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentProfile_householdId_userId_key" ON "InvestmentProfile"("householdId", "userId");
CREATE INDEX "InvestmentProfile_userId_idx" ON "InvestmentProfile"("userId");

ALTER TABLE "InvestmentProfile" ADD CONSTRAINT "InvestmentProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentProfile" ADD CONSTRAINT "InvestmentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
