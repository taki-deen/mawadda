CREATE TABLE "Account" (
  "id" TEXT PRIMARY KEY
);

CREATE TABLE "Questionnaire" (
  "id" TEXT PRIMARY KEY,
  "content" JSONB NOT NULL
);

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "questionnaireId" TEXT NOT NULL REFERENCES "Questionnaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3)
);

CREATE TABLE "Member" (
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "seat" INTEGER NOT NULL CHECK ("seat" IN (1, 2)),
  "alias" TEXT NOT NULL,
  "consent" TEXT,
  PRIMARY KEY ("sessionId", "accountId")
);
CREATE UNIQUE INDEX "Member_sessionId_seat_key" ON "Member"("sessionId", "seat");
CREATE INDEX "Member_accountId_idx" ON "Member"("accountId");

CREATE TABLE "Invitation" (
  "digest" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Invitation_sessionId_key" ON "Invitation"("sessionId");

CREATE TABLE "Answer" (
  "sessionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "questionId" INTEGER NOT NULL CHECK ("questionId" BETWEEN 1 AND 150),
  "choice" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "importance" INTEGER NOT NULL CHECK ("importance" BETWEEN 1 AND 3),
  "deferred" BOOLEAN NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 1),
  PRIMARY KEY ("sessionId", "accountId", "questionId"),
  FOREIGN KEY ("sessionId", "accountId") REFERENCES "Member"("sessionId", "accountId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Review" (
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "questionId" INTEGER NOT NULL CHECK ("questionId" BETWEEN 1 AND 150),
  "status" TEXT NOT NULL CHECK ("status" IN ('agree', 'partial', 'different')),
  "note" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 1),
  "approvedOne" BOOLEAN NOT NULL DEFAULT FALSE,
  "approvedTwo" BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY ("sessionId", "questionId")
);
