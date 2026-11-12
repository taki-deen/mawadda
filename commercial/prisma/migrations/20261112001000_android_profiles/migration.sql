ALTER TABLE "Account"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "engagement" TEXT NOT NULL DEFAULT 'undisclosed',
  ADD COLUMN "profileRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Account_engagement_check"
    CHECK ("engagement" IN ('undisclosed', 'not_engaged', 'fiance', 'fiancee'));
