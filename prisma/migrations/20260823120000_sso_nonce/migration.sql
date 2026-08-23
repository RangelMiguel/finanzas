-- CreateTable
CREATE TABLE "SsoNonce" (
    "jti" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoNonce_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "SsoNonce_expiresAt_idx" ON "SsoNonce"("expiresAt");
