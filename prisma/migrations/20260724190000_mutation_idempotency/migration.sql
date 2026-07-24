-- CreateTable
CREATE TABLE "MutationIdempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MutationIdempotency_createdAt_idx" ON "MutationIdempotency"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutationIdempotency_userId_key_key" ON "MutationIdempotency"("userId", "key");

-- AddForeignKey
ALTER TABLE "MutationIdempotency" ADD CONSTRAINT "MutationIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
