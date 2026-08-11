-- Cached market reference rates, refreshed monthly.
CREATE TABLE "MarketRateSnapshot" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "quotesJson" TEXT NOT NULL,
    "statusJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "MarketRateSnapshot_pkey" PRIMARY KEY ("id")
);
