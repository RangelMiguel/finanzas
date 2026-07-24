-- AlterTable: password optional (passkey-only accounts)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: track when member last saw security feed
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "securityAlertsSeenAt" TIMESTAMP(3);
