ALTER TABLE "Account" ADD COLUMN "customProfile" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "Account" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Questionnaire" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "firstComparisonAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "sharedFieldsVersion" TEXT;
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_check", ADD CHECK ("questionId" > 0);
ALTER TABLE "Review" DROP CONSTRAINT "Review_questionId_check", ADD CHECK ("questionId" > 0);

CREATE TABLE "ContentState" (
  "id" TEXT PRIMARY KEY,
  "publishedId" TEXT NOT NULL,
  "publishedFields" JSONB NOT NULL DEFAULT '[]',
  "draft" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "highestQuestionId" INTEGER NOT NULL DEFAULT 150
);

CREATE TABLE "ContentEvent" (
  "id" SERIAL PRIMARY KEY,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
