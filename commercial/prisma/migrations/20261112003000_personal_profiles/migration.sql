ALTER TABLE "Account" ADD COLUMN "personalDetails" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Member"
  ADD COLUMN "sharedProfileFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sharedProfileRevision" INTEGER;
