-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'xai';
ALTER TABLE "UserPreference" ADD COLUMN "aiBaseUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserPreference" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'grok-4.5';
ALTER TABLE "UserPreference" ADD COLUMN "aiApiKeyEnc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserPreference" ADD COLUMN "aiConsentAt" TIMESTAMP(3);
