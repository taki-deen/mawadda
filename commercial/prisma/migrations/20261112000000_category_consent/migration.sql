BEGIN;

CREATE TABLE "Consent" (
  "sessionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "category" INTEGER NOT NULL CHECK ("category" BETWEEN 0 AND 14),
  "fingerprint" TEXT NOT NULL,
  PRIMARY KEY ("sessionId", "accountId", "category"),
  FOREIGN KEY ("sessionId", "accountId") REFERENCES "Member"("sessionId", "accountId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Consent" ("sessionId", "accountId", "category", "fingerprint")
SELECT "sessionId", "accountId", 0, "consent" FROM "Member" WHERE "consent" IS NOT NULL;

ALTER TABLE "Member" DROP COLUMN "consent";

COMMIT;
